import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymPieces,
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { ECONOMY } from "../../shared/gym3d/economy.js"
import type { GymLayoutDto } from "../../shared/types.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) => `Congrats ${userName}!`,
	generateWeeklyInspiration: async () => "Keep going!",
	generateNpcDialogs: async () => [],
}

const _TINY_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
)

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

const HOUR = 3_600_000
let inviteCounter = 0

async function registerAndLogin(email = "user@slimpals.test", name = "Tester") {
	const db = await getTestDb()
	const code = `ECON-INVITE-${++inviteCounter}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: code,
	})
	const cookies = res.headers["set-cookie"] as string[]
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId: res.body.user.id as string,
	}
}

async function getLayout(cookie: string, open = false): Promise<GymLayoutDto> {
	const res = await request(app)
		.get(`/api/gym/layout${open ? "?open=1" : ""}`)
		.set("Cookie", cookie)
		.expect(200)
	return res.body as GymLayoutDto
}

/** A user whose gym has `keys` claimed and a seeded layout. */
async function setup(keys: string[] = [], email?: string) {
	const { cookie, userId } = await registerAndLogin(email)
	await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
	const db = await getTestDb()
	const [gym] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, userId))
	if (keys.length)
		await db
			.insert(userGymUpgrades)
			.values(keys.map((upgradeKey) => ({ gymId: gym.id, upgradeKey })))
	const layout = await getLayout(cookie)
	return { cookie, userId, gymId: gym.id, layout }
}

const _post = (cookie: string, path: string, body: object = {}) =>
	request(app).post(`/api/gym/layout${path}`).set("Cookie", cookie).send(body)

async function _mission(
	cookie: string,
	body: { title: string; cadence?: string; difficulty?: string; kind?: string },
) {
	const res = await request(app)
		.post("/api/missions")
		.set("Cookie", cookie)
		.send({ cadence: "daily", difficulty: "easy", ...body })
		.expect(201)
	return res.body as { id: number; kind: string; sweat: number; greens: number }
}

const _tick = (cookie: string, id: number, on = true) =>
	request(app)
		.post(`/api/missions/${id}/${on ? "complete" : "uncomplete"}`)
		.set("Cookie", cookie)
		.expect(200)

/** Moves every income clock of the gym `hours` into the past. */
async function _age(gymId: number, hours: number) {
	const db = await getTestDb()
	// a few seconds more: timestamps are whole seconds and "now" is floored
	const t = new Date(Date.now() - hours * HOUR - 3000)
	await db
		.update(userGyms)
		.set({ deskCollectedAt: t, kitchenCollectedAt: t })
		.where(eq(userGyms.id, gymId))
	await db
		.update(gymPieces)
		.set({ collectedAt: t })
		.where(eq(gymPieces.gymId, gymId))
}

async function gymRow(gymId: number) {
	const [g] = await (await getTestDb())
		.select()
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	return g
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
})

afterAll(async () => {
	await closeTestDb()
})

describe("Gym rating and goals", () => {
	it("the layout carries a rating and every goal", async () => {
		const { layout } = await setup(["cardio_treadmill"])
		expect(layout.rating.stars).toBeGreaterThanOrEqual(1)
		expect(layout.rating.stars).toBeLessThanOrEqual(5)
		expect(layout.goals.length).toBeGreaterThan(5)
		expect(layout.goalsPaid).toBeUndefined()
	})

	it("goals already met on the first read start done, with no payout", async () => {
		const { layout, gymId } = await setup([
			"cardio_treadmill",
			"weights_dumbbells",
		])
		// two finished rooms: "Open a second room" is met from the start
		expect(layout.goals.find((g) => g.id === "rooms-2")?.done).toBe(true)
		expect(layout.goalsPaid).toBeUndefined()
		const g = await gymRow(gymId)
		expect(g.sweat).toBe(ECONOMY.starterSweat)
		expect(g.greens).toBe(ECONOMY.starterGreens)
	})

	it("a goal reached later pays once", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		expect(layout.goals.find((g) => g.id === "decor-1")?.done).toBe(false)
		const lobby = layout.rooms.find((r) => r.type === "lobby")
		const db = await getTestDb()
		await db.insert(gymPieces).values({
			gymId,
			roomId: lobby?.id,
			kind: "decor",
			itemKey: "plant",
			posX2: 6,
			posZ2: 6,
			status: "placed",
		})
		const before = await gymRow(gymId)

		const next = await getLayout(cookie)
		expect(next.goalsPaid?.map((p) => p.id)).toEqual(["decor-1"])
		expect(next.goals.find((g) => g.id === "decor-1")?.done).toBe(true)
		expect(next.greens).toBe(before.greens + 1)
		expect((await gymRow(gymId)).greens).toBe(before.greens + 1)

		// reading again pays nothing more
		const again = await getLayout(cookie)
		expect(again.goalsPaid).toBeUndefined()
		expect(again.greens).toBe(before.greens + 1)
	})

	it("a paid goal stays done after the gym changes", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		const lobby = layout.rooms.find((r) => r.type === "lobby")
		const db = await getTestDb()
		const [piece] = await db
			.insert(gymPieces)
			.values({
				gymId,
				roomId: lobby?.id,
				kind: "decor",
				itemKey: "plant",
				posX2: 6,
				posZ2: 6,
				status: "placed",
			})
			.$returningId()
		await getLayout(cookie)
		await db.delete(gymPieces).where(eq(gymPieces.id, piece.id))
		const after = await getLayout(cookie)
		expect(after.goals.find((g) => g.id === "decor-1")?.done).toBe(true)
		expect(after.goalsPaid).toBeUndefined()
	})

	it("racing reads pay a new goal exactly once", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		const lobby = layout.rooms.find((r) => r.type === "lobby")
		const db = await getTestDb()
		await db.insert(gymPieces).values({
			gymId,
			roomId: lobby?.id,
			kind: "decor",
			itemKey: "plant",
			posX2: 6,
			posZ2: 6,
			status: "placed",
		})
		const before = await gymRow(gymId)
		const results = await Promise.all(
			Array.from({ length: 6 }, () =>
				request(app).get("/api/gym/layout").set("Cookie", cookie),
			),
		)
		for (const r of results) expect(r.status).toBe(200)
		expect((await gymRow(gymId)).greens).toBe(before.greens + 1)
	})
})
