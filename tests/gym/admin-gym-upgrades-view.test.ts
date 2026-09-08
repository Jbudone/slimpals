import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymUpgradesCatalog,
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
}

async function createInvite(code: string) {
	const db = await getTestDb()
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

let inviteCounter = 0

async function registerAndLogin(email: string, name: string) {
	const inviteCode = `ADMIN-GYM-UPGRADES-INVITE-${++inviteCounter}`
	await createInvite(inviteCode)
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	const userId = res.body.user.id as string
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId,
	}
}

async function makeAdmin(userId: string) {
	const db = await getTestDb()
	await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId))
}

async function adminAndMember() {
	const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
		"a@slimpals.test",
		"Admin Two",
	)
	await makeAdmin(adminId)
	const { userId: memberId } = await registerAndLogin(
		"b@slimpals.test",
		"Member Two",
	)
	return { adminCookie, memberId }
}

async function seedUpgradeCatalog() {
	const db = await getTestDb()
	await db.insert(gymUpgradesCatalog).values([
		{
			key: "test_cardio_treadmill",
			name: "Test Treadmill",
			category: "cardio",
			requiredXp: 0,
			sortOrder: 1001,
		},
		{
			key: "test_weights_barbell",
			name: "Test Barbell Rack",
			category: "weights",
			requiredXp: 200,
			sortOrder: 1002,
		},
		{
			key: "test_staff_reception",
			name: "Test Reception Desk",
			category: "staff",
			requiredXp: 500,
			sortOrder: 1003,
			unlocksNpcKey: "receptionist_lisa",
		},
	])
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
	await seedUpgradeCatalog()
})

afterAll(async () => {
	await closeTestDb()
})

describe("GET /api/admin/users/:id/gym/upgrades", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/users/x/gym/upgrades")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/users/x/gym/upgrades")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns the full catalog as locked for a user with no gym, without creating one", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/upgrades`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.hasGym).toBe(false)
		expect(res.body.gym).toBeNull()
		expect(res.body.upgrades.length).toBeGreaterThanOrEqual(3)
		const testUpgrades = res.body.upgrades.filter((u: { key: string }) =>
			u.key.startsWith("test_"),
		)
		expect(testUpgrades).toHaveLength(3)
		expect(
			testUpgrades.every((u: { status: string }) => u.status === "locked"),
		).toBe(true)

		const db = await getTestDb()
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		expect(gym).toBeUndefined()
	})

	it("reflects claimed, pending, and locked status correctly", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const db = await getTestDb()
		const [gymInserted] = await db
			.insert(userGyms)
			.values({
				userId: memberId,
				name: "Test Gym",
				level: 2,
				xp: 250,
				pendingUpgradeKeys: ["test_staff_reception"],
			})
			.$returningId()

		await db.insert(userGymUpgrades).values({
			gymId: gymInserted.id,
			upgradeKey: "test_cardio_treadmill",
			placementData: { x: 3, y: 4 },
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/upgrades`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.hasGym).toBe(true)
		expect(res.body.gym).toMatchObject({
			level: 2,
			xp: 250,
			pendingUpgradeKeys: ["test_staff_reception"],
		})

		const byKey = Object.fromEntries(
			res.body.upgrades.map((u: { key: string }) => [u.key, u]),
		)
		expect(byKey.test_cardio_treadmill.status).toBe("claimed")
		expect(byKey.test_cardio_treadmill.placementData).toEqual({ x: 3, y: 4 })
		expect(byKey.test_cardio_treadmill.unlockedAt).not.toBeNull()
		expect(byKey.test_weights_barbell.status).toBe("locked")
		expect(byKey.test_staff_reception.status).toBe("pending")
		expect(byKey.test_staff_reception.unlocksNpcKey).toBe("receptionist_lisa")
	})

	it("only returns state for the requested user", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const { userId: otherId } = await registerAndLogin(
			"c@slimpals.test",
			"Other User",
		)
		const db = await getTestDb()
		const [otherGym] = await db
			.insert(userGyms)
			.values({ userId: otherId, name: "Other Gym" })
			.$returningId()
		await db.insert(userGymUpgrades).values({
			gymId: otherGym.id,
			upgradeKey: "test_cardio_treadmill",
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/upgrades`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.hasGym).toBe(false)
	})
})
