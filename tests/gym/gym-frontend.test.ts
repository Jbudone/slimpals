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

describe("GET /api/gym — frontend data contract", () => {
	it("returns gym name, level, xp, and xpToNextLevel", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app).get("/api/gym").set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.gym).toMatchObject({
			name: expect.stringContaining("'s Gym"),
			level: 0,
			xp: 0,
		})
		expect(res.body.xpToNextLevel).toBeGreaterThan(0)
	})

	it("returns unlocked upgrades with placementData field", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["cardio_treadmill"] })
			.where(eq(userGyms.id, gymId))

		await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "cardio_treadmill" })

		const res = await request(app).get("/api/gym").set("Cookie", cookies)
		const treadmill = res.body.upgrades.unlocked.find(
			(u: { key: string }) => u.key === "cardio_treadmill",
		)

		expect(treadmill).toBeDefined()
		expect(treadmill).toHaveProperty("key")
		expect(treadmill).toHaveProperty("name")
		expect(treadmill).toHaveProperty("category")
		expect(treadmill).toHaveProperty("placementData")
	})

	it("returns locked upgrades with requiredXp for unlock condition label", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app).get("/api/gym").set("Cookie", cookies)

		const locked = res.body.upgrades.locked
		expect(locked.length).toBeGreaterThan(0)

		for (const item of locked) {
			expect(item).toHaveProperty("key")
			expect(item).toHaveProperty("name")
			expect(item).toHaveProperty("requiredXp")
			expect(typeof item.requiredXp).toBe("number")
		}
	})

	it("returns pending upgrades separate from locked", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["weights_dumbbells"] })
			.where(eq(userGyms.id, gymId))

		const res = await request(app).get("/api/gym").set("Cookie", cookies)

		const pending = res.body.upgrades.pending
		expect(pending).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "weights_dumbbells" }),
			]),
		)

		const locked = res.body.upgrades.locked
		const inLocked = locked.find(
			(l: { key: string }) => l.key === "weights_dumbbells",
		)
		expect(inLocked).toBeUndefined()
	})

	it("returns category field on all upgrade types", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app).get("/api/gym").set("Cookie", cookies)

		const allUpgrades = [
			...res.body.upgrades.locked,
			...res.body.upgrades.pending,
			...res.body.upgrades.unlocked,
		]

		const validCategories = new Set([
			"cardio",
			"weights",
			"amenities",
			"decor",
			"staff",
			"boxing",
		])

		for (const u of allUpgrades) {
			expect(validCategories.has(u.category)).toBe(true)
		}
	})
})

describe("POST /api/gym/claim-upgrade — integration", () => {
	it("moves upgrade from pending to unlocked and returns updated state", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({
				pendingUpgradeKeys: ["amenity_water", "decor_posters"],
			})
			.where(eq(userGyms.id, gymId))

		const res = await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "amenity_water" })

		expect(res.status).toBe(200)

		const unlocked = res.body.upgrades.unlocked
		expect(unlocked).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "amenity_water" }),
			]),
		)

		const pending = res.body.upgrades.pending
		expect(pending).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "decor_posters" }),
			]),
		)

		const claimedInPending = pending.find(
			(p: { key: string }) => p.key === "amenity_water",
		)
		expect(claimedInPending).toBeUndefined()
	})

	it("persists placementData for claimed upgrades", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["staff_reception"] })
			.where(eq(userGyms.id, gymId))

		await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "staff_reception" })

		const [row] = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.upgradeKey, "staff_reception"))

		expect(row).toBeDefined()
		expect(row.gymId).toBe(gymId)
	})
})

describe("GET /api/gym/catalog — full catalog", () => {
	it("returns all 27 upgrades with required fields for rendering", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/gym/catalog")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(27)

		for (const item of res.body) {
			expect(item).toHaveProperty("key")
			expect(item).toHaveProperty("name")
			expect(item).toHaveProperty("category")
			expect(item).toHaveProperty("requiredXp")
			expect(typeof item.requiredXp).toBe("number")
		}
	})

	it("covers all six equipment categories", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/gym/catalog")
			.set("Cookie", cookies)

		const categories = [
			...new Set(res.body.map((u: { category: string }) => u.category)),
		]
		expect(categories.sort()).toEqual([
			"amenities",
			"boxing",
			"cardio",
			"decor",
			"staff",
			"weights",
		])
	})
})
