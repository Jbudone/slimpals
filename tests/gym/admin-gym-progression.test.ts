import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymNpcs,
	gymUpgradesCatalog,
	invites,
	userGymNpcRelationships,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import { deriveRelationshipFromDays } from "../../server/services/gym/dialog.js"
import { deriveProgressionFromDays } from "../../server/services/gym/index.js"
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
	const inviteCode = `ADMIN-GYM-PROGRESSION-INVITE-${++inviteCounter}`
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

async function realCatalog() {
	const db = await getTestDb()
	return db
		.select({
			key: gymUpgradesCatalog.key,
			requiredXp: gymUpgradesCatalog.requiredXp,
		})
		.from(gymUpgradesCatalog)
}

async function realNpcKeys(): Promise<string[]> {
	const db = await getTestDb()
	const rows = await db.select({ key: gymNpcs.key }).from(gymNpcs)
	return rows.map((r) => r.key)
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

describe("POST /api/admin/users/:id/gym/progression", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/users/x/gym/progression")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.post("/api/admin/users/x/gym/progression")
			.set("Cookie", cookie)
			.send({ daysElapsed: 30 })
		expect(res.status).toBe(403)
	})

	it("rejects a missing daysElapsed with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({})
		expect(res.status).toBe(400)
	})

	it("rejects a negative daysElapsed with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: -1 })
		expect(res.status).toBe(400)
	})

	it("rejects a non-integer daysElapsed with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: 3.5 })
		expect(res.status).toBe(400)
	})

	it("applies derived xp/level/unlocks and relationship state, creating the gym if missing", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const catalog = await realCatalog()
		const expectedProgression = deriveProgressionFromDays(30, catalog)
		const expectedRelationship = deriveRelationshipFromDays(30)

		const res = await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: 30 })

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			daysElapsed: 30,
			xp: expectedProgression.xp,
			level: expectedProgression.level,
			relationshipLevel: expectedRelationship.relationshipLevel,
			gymDaysActive: expectedRelationship.gymDaysActive,
		})
		expect(new Set(res.body.unlockedUpgradeKeys)).toEqual(
			new Set(expectedProgression.unlockedUpgradeKeys),
		)

		const db = await getTestDb()
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		expect(gym.xp).toBe(expectedProgression.xp)
		expect(gym.level).toBe(expectedProgression.level)
		expect(gym.pendingUpgradeKeys).toEqual([])

		const claimed = await db
			.select({ upgradeKey: userGymUpgrades.upgradeKey })
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))
		expect(new Set(claimed.map((c) => c.upgradeKey))).toEqual(
			new Set(expectedProgression.unlockedUpgradeKeys),
		)

		const npcKeys = await realNpcKeys()
		const relRows = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.gymId, gym.id))
		expect(relRows).toHaveLength(npcKeys.length)
		for (const row of relRows) {
			expect(row.relationshipLevel).toBe(expectedRelationship.relationshipLevel)
			expect(row.gymDaysActive).toBe(expectedRelationship.gymDaysActive)
		}
	})

	it("is idempotent — calling twice with the same daysElapsed produces identical state", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: 45 })

		const db = await getTestDb()
		const [gymAfterFirst] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		const claimedAfterFirst = (
			await db
				.select({ upgradeKey: userGymUpgrades.upgradeKey })
				.from(userGymUpgrades)
				.where(eq(userGymUpgrades.gymId, gymAfterFirst.id))
		)
			.map((c) => c.upgradeKey)
			.sort()

		await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: 45 })

		const [gymAfterSecond] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		const claimedAfterSecond = (
			await db
				.select({ upgradeKey: userGymUpgrades.upgradeKey })
				.from(userGymUpgrades)
				.where(eq(userGymUpgrades.gymId, gymAfterSecond.id))
		)
			.map((c) => c.upgradeKey)
			.sort()

		expect(gymAfterSecond.xp).toBe(gymAfterFirst.xp)
		expect(gymAfterSecond.level).toBe(gymAfterFirst.level)
		expect(claimedAfterSecond).toEqual(claimedAfterFirst)
	})

	it("replaces rather than accumulates on top of a prior, larger daysElapsed", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const catalog = await realCatalog()

		// First jump far ahead...
		await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: 365 })

		// ...then back to day 1. If state accumulated instead of replacing,
		// day-365-only unlocks would still be present.
		const res = await request(app)
			.post(`/api/admin/users/${memberId}/gym/progression`)
			.set("Cookie", adminCookie)
			.send({ daysElapsed: 1 })

		const expectedDay1 = deriveProgressionFromDays(1, catalog)
		const expectedDay365 = deriveProgressionFromDays(365, catalog)

		expect(res.body.xp).toBe(expectedDay1.xp)
		expect(new Set(res.body.unlockedUpgradeKeys)).toEqual(
			new Set(expectedDay1.unlockedUpgradeKeys),
		)
		// Sanity: day 365 really did unlock strictly more than day 1, so this
		// test is actually exercising the replace-vs-accumulate distinction.
		expect(expectedDay365.unlockedUpgradeKeys.length).toBeGreaterThan(
			expectedDay1.unlockedUpgradeKeys.length,
		)

		const db = await getTestDb()
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		const claimed = await db
			.select({ upgradeKey: userGymUpgrades.upgradeKey })
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))
		expect(new Set(claimed.map((c) => c.upgradeKey))).toEqual(
			new Set(expectedDay1.unlockedUpgradeKeys),
		)
	})
})
