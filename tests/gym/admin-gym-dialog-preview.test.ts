import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { gymNpcs, invites, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const generateNpcDialogs = vi.fn(async () => [
	{
		promptText: "How's it going?",
		response: "Crushing it today!",
		portraitVariant: "happy" as const,
		personalityTagAdded: null,
	},
])

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) => `Congrats ${userName}!`,
	generateWeeklyInspiration: async () => "Keep pushing!",
	generateNpcDialogs,
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
	const inviteCode = `ADMIN-GYM-DIALOG-INVITE-${++inviteCounter}`
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
	generateNpcDialogs.mockClear()
})

afterAll(async () => {
	await closeTestDb()
})

describe("GET /api/admin/users/:id/gym/npcs/:npcKey/dialogs", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get(
			"/api/admin/users/x/gym/npcs/trainer_test/dialogs?stage=0",
		)
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/users/x/gym/npcs/trainer_test/dialogs?stage=0")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown npc key", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/does_not_exist/dialogs?stage=0`)
			.set("Cookie", adminCookie)
		expect(res.status).toBe(404)
	})

	it("returns 400 for an out-of-range stage", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs?stage=4`)
			.set("Cookie", adminCookie)
		expect(res.status).toBe(400)
	})

	it("returns 400 for a missing stage", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs`)
			.set("Cookie", adminCookie)
		expect(res.status).toBe(400)
	})

	it("generates and returns a dialog batch for an arbitrary stage, even for a user with no gym", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs?stage=3`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.stage).toBe(3)
		expect(res.body.stageLabel).toBe("Friend")
		expect(res.body.dialogs).toHaveLength(1)
		expect(res.body.dialogs[0].response).toBe("Crushing it today!")
		expect(generateNpcDialogs).toHaveBeenCalledTimes(1)
	})

	it("reuses a cached batch instead of regenerating on a second call", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs?stage=1`)
			.set("Cookie", adminCookie)

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs?stage=1`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(generateNpcDialogs).toHaveBeenCalledTimes(1)
	})

	it("regenerate=true bypasses the cache", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		await request(app)
			.get(`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs?stage=2`)
			.set("Cookie", adminCookie)

		const res = await request(app)
			.get(
				`/api/admin/users/${memberId}/gym/npcs/trainer_test/dialogs?stage=2&regenerate=true`,
			)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(generateNpcDialogs).toHaveBeenCalledTimes(2)
	})
})
