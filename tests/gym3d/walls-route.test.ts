import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { openWallCost, sharedWalls } from "../../shared/gym3d/walls.js"
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

async function _gymRow(gymId: number) {
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

const openWall = (cookie: string, body: object) =>
	request(app)
		.post("/api/gym/layout/walls/open")
		.set("Cookie", cookie)
		.send(body)

const firstWall = (l: GymLayoutDto) => {
	const w = sharedWalls(l.plots, l.rooms)[0]
	if (!w) throw new Error("no shared wall")
	return w.ref
}

const setCoins = async (gymId: number, coins: number) => {
	await (await getTestDb())
		.update(userGyms)
		.set({ coins })
		.where(eq(userGyms.id, gymId))
}

describe("Open walls", () => {
	it("opens a wall once for coins and refuses everything else", async () => {
		const { cookie, gymId, layout } = await setup([
			"cardio_treadmill",
			"weights_dumbbells",
		])
		const wall = firstWall(layout)
		await setCoins(gymId, 2000)

		const res = await openWall(cookie, wall).expect(200)
		expect(res.body.openWalls).toEqual([wall])
		expect(res.body.coins).toBe(2000 - openWallCost(0))
		expect(res.body.nextWallCost).toBe(openWallCost(1))

		await openWall(cookie, wall).expect(409) // already open
		await openWall(cookie, { px: 99, pz: 99, axis: "x" }).expect(409) // no wall
		await openWall(cookie, { ...wall, axis: "diagonal" }).expect(400)
		await openWall(cookie, { px: "1", pz: 1, axis: "x" }).expect(400)
	})

	it("needs the coins", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		await setCoins(gymId, openWallCost(0) - 1)
		await openWall(cookie, firstWall(layout)).expect(409)
	})

	it("scores for the gym and pays the first-wall goal", async () => {
		const { cookie, gymId, layout } = await setup([
			"cardio_treadmill",
			"weights_dumbbells",
		])
		await setCoins(gymId, 2000)
		const before = layout.rating.parts.openWalls
		const res = await openWall(cookie, firstWall(layout)).expect(200)
		expect(res.body.rating.parts.openWalls).toBe(before + 1)
		expect(res.body.goalsPaid?.map((g: { id: string }) => g.id)).toContain(
			"wall-1",
		)
	})
})
