import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, sprints, users } from "../../server/db/schema.js"
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
	generateWeeklyInspiration: async (userName) => `Great week ${userName}!`,
	generateMonthlyChallenge: async (month, year) => ({
		title: `Challenge ${month}/${year}`,
		description: "Test",
		theme: "test",
		goals: [],
	}),
	generateWeeklySprint: async (userName) => ({
		title: `${userName}'s Sprint`,
		tasks: [{ id: "task_1", title: "Log a meal" }],
	}),
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
	const inviteCode = `ADMIN-SPRINT-RESET-INVITE-${++inviteCounter}`
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

async function seedSprintProgress(
	adminCookie: string,
	userId: string,
	weekStart: Date,
) {
	await request(app)
		.post(`/api/admin/seed/${userId}/sprint`)
		.set("Cookie", adminCookie)
		.send({ weekStart: weekStart.toISOString(), completion: "partial" })
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

describe("DELETE /api/admin/users/:id/sprint", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).delete("/api/admin/users/some-id/sprint")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie, userId } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.delete(`/api/admin/users/${userId}/sprint`)
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("clears a user's sprint progress for the current week", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		await seedSprintProgress(adminCookie, memberId, new Date())

		const res = await request(app)
			.delete(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.deleted).toBeGreaterThan(0)

		const stateRes = await request(app)
			.get(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)
		expect(stateRes.body.sprint).toBeNull()
	})

	it("clears progress across every week the user has a sprint for, not just the current one", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		await seedSprintProgress(
			adminCookie,
			memberId,
			new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
		)
		await seedSprintProgress(
			adminCookie,
			memberId,
			new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
		)

		const res = await request(app)
			.delete(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.deleted).toBe(2)

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(sprints)
			.where(eq(sprints.userId, memberId))
		expect(rows).toHaveLength(0)
	})

	it("is idempotent when the user has no sprint progress", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.delete(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.deleted).toBe(0)
	})

	it("does not affect another user's sprint progress", async () => {
		const { adminCookie, memberId: memberA } = await adminAndMember()
		const { userId: memberB } = await registerAndLogin(
			"c@slimpals.test",
			"Member Three",
		)
		const now = new Date()
		await seedSprintProgress(adminCookie, memberA, now)
		await seedSprintProgress(adminCookie, memberB, now)

		await request(app)
			.delete(`/api/admin/users/${memberA}/sprint`)
			.set("Cookie", adminCookie)

		const db = await getTestDb()
		const bRows = await db
			.select()
			.from(sprints)
			.where(eq(sprints.userId, memberB))
		expect(bRows).toHaveLength(1)
	})
})
