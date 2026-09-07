import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymNpcDailyState,
	gymNpcs,
	invites,
	userGymNpcRelationships,
	userGyms,
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
	const inviteCode = `ADMIN-GYM-EDIT-INVITE-${++inviteCounter}`
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
	const { cookie: memberCookie, userId: memberId } = await registerAndLogin(
		"b@slimpals.test",
		"Member Two",
	)
	return { adminCookie, memberCookie, memberId }
}

async function seedNpcCatalog() {
	const db = await getTestDb()
	await db.insert(gymNpcs).values({
		key: "trainer_test",
		name: "Test Trainer",
		role: "trainer",
		personalityProfile: { moodBaseline: 60 },
		defaultSchedule: {},
		spriteKey: "npc_trainer_test",
		unlockedByUpgradeKey: null,
	})
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
	await seedNpcCatalog()
})

afterAll(async () => {
	await closeTestDb()
})

describe("PATCH /api/admin/users/:id/gym/npcs/:npcKey", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).patch(
			"/api/admin/users/x/gym/npcs/trainer_test",
		)
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.patch("/api/admin/users/x/gym/npcs/trainer_test")
			.set("Cookie", cookie)
			.send({ relationshipLevel: 50 })
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown npc key", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/does_not_exist`)
			.set("Cookie", adminCookie)
			.send({ relationshipLevel: 50 })
		expect(res.status).toBe(404)
	})

	it("rejects an out-of-range relationshipLevel with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ relationshipLevel: 150 })
		expect(res.status).toBe(400)
	})

	it("rejects an out-of-range mood with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ mood: -150 })
		expect(res.status).toBe(400)
	})

	it("rejects a malformed goalSequence with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ goalSequence: [{ type: "not_a_type", durationMin: 10 }] })
		expect(res.status).toBe(400)
	})

	it("creates gym/relationship/daily-state rows on first edit for a user with none", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ relationshipLevel: 80, mood: -50 })

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			key: "trainer_test",
			relationshipLevel: 80,
			relationshipStage: 3,
			stageLabel: "Friend",
			mood: -50,
			goalSequence: [],
		})

		const db = await getTestDb()
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		expect(gym).toBeDefined()

		const [rel] = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.gymId, gym.id))
		expect(rel.relationshipLevel).toBe(80)

		const [daily] = await db
			.select()
			.from(gymNpcDailyState)
			.where(eq(gymNpcDailyState.gymId, gym.id))
		expect(daily.mood).toBe(-50)
	})

	it("updates only the provided fields, leaving others unchanged", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ relationshipLevel: 30, mood: 10 })

		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ mood: 20 })

		expect(res.status).toBe(200)
		expect(res.body.relationshipLevel).toBe(30)
		expect(res.body.mood).toBe(20)
	})

	it("relationshipStage matches the level's tier boundary", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/npcs/trainer_test`)
			.set("Cookie", adminCookie)
			.send({ relationshipLevel: 25 })

		expect(res.status).toBe(200)
		expect(res.body.relationshipStage).toBe(1)
		expect(res.body.stageLabel).toBe("Acquaintance")
	})
})
