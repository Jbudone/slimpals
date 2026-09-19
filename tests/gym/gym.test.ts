import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, userGyms, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	awardGymXp,
	computeLevel,
	getOrCreateGym,
} from "../../server/services/gym/index.js"
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

async function registerAndLogin(
	email = "user@slimpals.test",
	name = "Test User",
	inviteCode = "VALID-INVITE",
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
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

describe("computeLevel", () => {
	it("returns 0 for 0 XP", () => {
		expect(computeLevel(0)).toBe(0)
	})

	it("returns 1 for 50 XP", () => {
		expect(computeLevel(50)).toBe(1)
	})

	it("returns 2 for 200 XP", () => {
		expect(computeLevel(200)).toBe(2)
	})

	it("returns 3 for 450 XP", () => {
		expect(computeLevel(450)).toBe(3)
	})

	it("returns floor for in-between values", () => {
		expect(computeLevel(100)).toBe(1)
		expect(computeLevel(199)).toBe(1)
	})
})

describe("getOrCreateGym", () => {
	it("creates a gym on first call", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-gym-1",
			email: "gymuser@test.com",
			name: "Gym User",
		})

		const gym = await getOrCreateGym("user-gym-1", db)
		expect(gym.userId).toBe("user-gym-1")
		expect(gym.name).toBe("Gym User's Gym")
		expect(gym.level).toBe(0)
		expect(gym.xp).toBe(0)
		expect(gym.pendingUpgradeKeys).toEqual([])
	})

	it("returns existing gym on subsequent calls", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-gym-2",
			email: "gymuser2@test.com",
			name: "Gym User 2",
		})

		const first = await getOrCreateGym("user-gym-2", db)
		const second = await getOrCreateGym("user-gym-2", db)
		expect(first.id).toBe(second.id)
	})
})

describe("awardGymXp", () => {
	it("adds XP and detects level up", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-xp-1",
			email: "xpuser@test.com",
			name: "XP User",
		})

		await getOrCreateGym("user-xp-1", db)
		const result = await awardGymXp("user-xp-1", 50, "test", db)
		expect(result.newLevel).toBe(true)

		const gym = await getOrCreateGym("user-xp-1", db)
		expect(gym.xp).toBe(50)
		expect(gym.level).toBe(1)
	})

	it("populates pending upgrades when XP threshold crossed", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-xp-2",
			email: "xpuser2@test.com",
			name: "XP User 2",
		})

		await getOrCreateGym("user-xp-2", db)

		// Award enough XP to unlock some upgrades (requiredXp=0 ones should be pending immediately)
		const result = await awardGymXp("user-xp-2", 1, "test", db)
		expect(result.newPendingUpgrades.length).toBeGreaterThan(0)

		const gym = await getOrCreateGym("user-xp-2", db)
		expect(gym.pendingUpgradeKeys.length).toBeGreaterThan(0)
	})

	it("does not re-add already pending or unlocked upgrades", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-xp-3",
			email: "xpuser3@test.com",
			name: "XP User 3",
		})

		await getOrCreateGym("user-xp-3", db)
		const first = await awardGymXp("user-xp-3", 1, "test", db)
		const second = await awardGymXp("user-xp-3", 1, "test", db)

		expect(second.newPendingUpgrades).toEqual([])

		const gym = await getOrCreateGym("user-xp-3", db)
		expect(gym.pendingUpgradeKeys.length).toBe(first.newPendingUpgrades.length)
	})
})

describe("GET /api/gym", () => {
	it("creates gym on first access and returns upgrade state", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app).get("/api/gym").set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.gym.level).toBe(0)
		expect(res.body.gym.xp).toBe(0)
		expect(res.body.upgrades.unlocked).toEqual([])
		expect(res.body.upgrades.locked).toBeInstanceOf(Array)
		expect(res.body.xpToNextLevel).toBe(50)
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/gym")
		expect(res.status).toBe(401)
	})
})

describe("GET /api/gym/catalog", () => {
	it("returns 31 upgrades", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/gym/catalog")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(31)

		const categories = new Set(
			res.body.map((u: { category: string }) => u.category),
		)
		expect(categories).toEqual(
			new Set([
				"cardio",
				"weights",
				"amenities",
				"decor",
				"staff",
				"boxing",
				"lagree",
				"swimming",
			]),
		)
	})
})

describe("POST /api/gym/claim-upgrade", () => {
	it("claims a pending upgrade and moves it to unlocked", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		// Get the user
		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		// Manually set a pending upgrade
		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["cardio_treadmill"] })
			.where(eq(userGyms.id, gymId))

		const claimRes = await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "cardio_treadmill" })

		expect(claimRes.status).toBe(200)
		expect(claimRes.body.upgrades.unlocked).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "cardio_treadmill" }),
			]),
		)
		expect(
			claimRes.body.upgrades.pending.find(
				(p: { key: string }) => p.key === "cardio_treadmill",
			),
		).toBeUndefined()
	})

	it("rejects claim for non-pending upgrade", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "cardio_cinema" })

		expect(res.status).toBe(400)
		expect(res.body.error).toContain("not pending")
	})

	it("rejects claim without key", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({})

		expect(res.status).toBe(400)
		expect(res.body.error).toContain("key is required")
	})
})

describe("XP awards from existing routes", () => {
	it("awards XP on checkin", async () => {
		const cookies = await registerAndLogin()

		// First access gym to create it
		await request(app).get("/api/gym").set("Cookie", cookies)

		// Do a checkin
		await request(app)
			.post("/api/checkins")
			.set("Cookie", cookies)
			.send({ mood: "good" })

		// Check gym XP increased
		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)

		expect(gymRes.body.gym.xp).toBeGreaterThanOrEqual(15)
	})
})
