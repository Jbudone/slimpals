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
import { UPGRADE_LAYOUT } from "../../server/services/gym/layout.js"
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

describe("UPGRADE_LAYOUT", () => {
	it("defines positions for all 29 upgrades", () => {
		expect(Object.keys(UPGRADE_LAYOUT)).toHaveLength(29)
	})

	it("all positions are within grid bounds (20x15)", () => {
		for (const [_key, pos] of Object.entries(UPGRADE_LAYOUT)) {
			expect(pos.x).toBeGreaterThanOrEqual(1)
			expect(pos.x).toBeLessThanOrEqual(17)
			expect(pos.y).toBeGreaterThanOrEqual(1)
			expect(pos.y).toBeLessThanOrEqual(13)
		}
	})

	it("cardio_treadmill is at expected position", () => {
		expect(UPGRADE_LAYOUT.cardio_treadmill).toEqual({ x: 2, y: 2 })
	})

	it("amenity_sauna is at expected position", () => {
		expect(UPGRADE_LAYOUT.amenity_sauna).toEqual({ x: 8, y: 8 })
	})

	it("staff_reception is at expected position", () => {
		expect(UPGRADE_LAYOUT.staff_reception).toEqual({ x: 6, y: 5 })
	})
})

describe("POST /api/gym/claim-upgrade — placement data", () => {
	it("stores placementData from layout when claiming upgrade", async () => {
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

		const [row] = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.upgradeKey, "cardio_treadmill"))

		expect(row.placementData).toEqual({ x: 2, y: 2 })
	})

	it("stores correct placement for staff upgrades", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["staff_nutrition"] })
			.where(eq(userGyms.id, gymId))

		await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "staff_nutrition" })

		const [row] = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.upgradeKey, "staff_nutrition"))

		expect(row.placementData).toEqual(UPGRADE_LAYOUT.staff_nutrition)
	})

	it("placementData appears in GET /api/gym response after claim", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["weights_barbell"] })
			.where(eq(userGyms.id, gymId))

		await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookies)
			.send({ key: "weights_barbell" })

		const res = await request(app).get("/api/gym").set("Cookie", cookies)
		const barbell = res.body.upgrades.unlocked.find(
			(u: { key: string }) => u.key === "weights_barbell",
		)

		expect(barbell).toBeDefined()
		expect(barbell.placementData).toEqual({ x: 12, y: 2 })
	})

	it("all 25 layout keys match catalog keys", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/gym/catalog")
			.set("Cookie", cookies)

		const catalogKeys = new Set(res.body.map((u: { key: string }) => u.key))
		const layoutKeys = Object.keys(UPGRADE_LAYOUT)

		for (const key of layoutKeys) {
			expect(catalogKeys.has(key)).toBe(true)
		}
		expect(layoutKeys).toHaveLength(catalogKeys.size)
	})
})
