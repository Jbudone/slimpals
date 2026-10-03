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

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

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

/** A machine that is working: equipment on a spot. */
const isMachine = (p: GymLayoutDto["pieces"][number]) =>
	p.kind === "equipment" && p.status === "placed" && p.spotIndex != null

const hustle = (cookie: string, pieceId: number) =>
	request(app).post(`/api/gym/layout/hustle/${pieceId}`).set("Cookie", cookie)

describe("Tap-to-hustle", () => {
	it("pays a shrinking bonus, then nothing past the daily cap", async () => {
		const { cookie, gymId, layout } = await setup(["weights_dumbbells"])
		const machine = layout.pieces.find(isMachine)
		if (!machine) throw new Error("no machine")
		const start = (await gymRow(gymId)).coins

		const paid: number[] = []
		for (let i = 0; i < ECONOMY.hustle.dailyCap + 2; i++) {
			const res = await hustle(cookie, machine.id).expect(200)
			paid.push(res.body.paid)
		}
		expect(paid[0]).toBe(ECONOMY.hustle.coins)
		for (let i = 1; i < paid.length; i++)
			expect(paid[i]).toBeLessThanOrEqual(paid[i - 1])
		expect(paid.slice(-2)).toEqual([0, 0])
		const total = paid.reduce((a, b) => a + b, 0)
		expect((await gymRow(gymId)).coins).toBe(start + total)
	})

	it("refuses a stored machine, a stranger's machine and nothing at all", async () => {
		const mine = await setup(["weights_dumbbells"], "mine@slimpals.test")
		const theirs = await setup(["cardio_treadmill"], "theirs@slimpals.test")
		const theirPiece = theirs.layout.pieces.find(isMachine)
		if (!theirPiece) throw new Error("no machine")
		await hustle(mine.cookie, theirPiece.id).expect(404)
		await hustle(mine.cookie, 999_999).expect(404)

		const db = await getTestDb()
		const own = mine.layout.pieces.find(isMachine)
		if (!own) throw new Error("no machine")
		await db
			.update(gymPieces)
			.set({ status: "stored", spotIndex: null })
			.where(eq(gymPieces.id, own.id))
		await hustle(mine.cookie, own.id).expect(404)
	})
})
