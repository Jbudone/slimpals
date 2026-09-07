import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymNpcDailyState,
	gymNpcs,
	invites,
	userGymNpcRelationships,
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
	const inviteCode = `ADMIN-GYM-VIEW-INVITE-${++inviteCounter}`
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
	await db.insert(gymNpcs).values([
		{
			key: "trainer_test",
			name: "Test Trainer",
			role: "trainer",
			personalityProfile: { moodBaseline: 60 },
			defaultSchedule: {},
			spriteKey: "npc_trainer_test",
			unlockedByUpgradeKey: null,
		},
		{
			key: "specialist_locked",
			name: "Locked Specialist",
			role: "specialist",
			personalityProfile: { moodBaseline: 50 },
			defaultSchedule: {},
			spriteKey: "npc_specialist_locked",
			unlockedByUpgradeKey: "upgrade_locker_room",
		},
	])
}

async function createGym(userId: string) {
	const db = await getTestDb()
	const [inserted] = await db
		.insert(userGyms)
		.values({ userId, name: "Test Gym" })
		.$returningId()
	return inserted.id
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

describe("GET /api/admin/users/:id/gym/npcs", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/users/x/gym/npcs")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/users/x/gym/npcs")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns hasGym: false for a user with no gym", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs`)
			.set("Cookie", adminCookie)
		expect(res.status).toBe(200)
		expect(res.body).toEqual({ hasGym: false, npcs: [] })
	})

	it("lists catalog NPCs with defaults when no relationship/daily-state exists", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		await createGym(memberId)

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.hasGym).toBe(true)
		expect(res.body.npcs.length).toBeGreaterThanOrEqual(2)

		const trainer = res.body.npcs.find(
			(n: { key: string }) => n.key === "trainer_test",
		)
		expect(trainer).toMatchObject({
			unlocked: true,
			relationshipLevel: 0,
			relationshipStage: 0,
			stageLabel: "Stranger",
			interactionCount: 0,
			gymDaysActive: 0,
			mood: null,
			goalSequence: null,
		})

		const locked = res.body.npcs.find(
			(n: { key: string }) => n.key === "specialist_locked",
		)
		expect(locked.unlocked).toBe(false)
	})

	it("reflects seeded relationship/daily-state values and claimed upgrades", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const gymId = await createGym(memberId)
		const db = await getTestDb()

		await db.insert(userGymNpcRelationships).values({
			gymId,
			npcKey: "trainer_test",
			relationshipLevel: 80,
			interactionCount: 5,
			gymDaysActive: 3,
		})

		const dateStart = new Date()
		dateStart.setHours(0, 0, 0, 0)
		await db.insert(gymNpcDailyState).values({
			gymId,
			npcKey: "trainer_test",
			date: dateStart,
			mood: 42,
			goalSequence: [
				{ type: "warmup", durationMin: 10, equipmentCategory: "cardio" },
			],
		})

		await db.insert(userGymUpgrades).values({
			gymId,
			upgradeKey: "upgrade_locker_room",
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		const trainer = res.body.npcs.find(
			(n: { key: string }) => n.key === "trainer_test",
		)
		expect(trainer.relationshipLevel).toBe(80)
		expect(trainer.relationshipStage).toBe(3)
		expect(trainer.stageLabel).toBe("Friend")
		expect(trainer.interactionCount).toBe(5)
		expect(trainer.gymDaysActive).toBe(3)
		expect(trainer.mood).toBe(42)
		expect(trainer.goalSequence).toEqual([
			{ type: "warmup", durationMin: 10, equipmentCategory: "cardio" },
		])

		const locked = res.body.npcs.find(
			(n: { key: string }) => n.key === "specialist_locked",
		)
		expect(locked.unlocked).toBe(true)
	})
})
