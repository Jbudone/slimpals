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
	generateVictoryMessage: async (userName) =>
		`Congrats ${userName}, you crushed it!`,
	generateWeeklyInspiration: async () => "Keep pushing this week!",
	generateNpcDialogs: async () => [],
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
	await db.insert(invites).values({
		code: "VALID-INVITE",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(email = "user@slimpals.test") {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name: "Test User",
		email,
		password: "Password1!",
		inviteCode: "VALID-INVITE",
	})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

afterAll(async () => {
	await closeTestDb()
})

describe("GET /api/gym/sim-state — in-gym classes gating (gh-69)", () => {
	it("does not activate a class when its room isn't unlocked, even with enough xp", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ xp: 20000, simulatedHourOverride: 18 })
			.where(eq(userGyms.id, gymId))
		// No boxing_ring/boxing_mitts_station in userGymUpgrades: the room
		// doesn't exist yet, so boxing_6pm_class must stay gated off.

		const res = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		const keys = res.body.activeClasses.map((c: { key: string }) => c.key)
		expect(keys).not.toContain("boxing_6pm_class")
	})

	it("activates a class once its room is unlocked, enough xp, and within its hour window", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ xp: 20000, simulatedHourOverride: 18 })
			.where(eq(userGyms.id, gymId))
		await db
			.insert(userGymUpgrades)
			.values({ gymId, upgradeKey: "boxing_ring" })

		const res = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		const keys = res.body.activeClasses.map((c: { key: string }) => c.key)
		expect(keys).toContain("boxing_6pm_class")
	})

	it("does not activate a class outside its scheduled hour, even when unlocked", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ xp: 20000, simulatedHourOverride: 10 })
			.where(eq(userGyms.id, gymId))
		await db
			.insert(userGymUpgrades)
			.values({ gymId, upgradeKey: "boxing_ring" })

		const res = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		const keys = res.body.activeClasses.map((c: { key: string }) => c.key)
		expect(keys).not.toContain("boxing_6pm_class")
	})
})
