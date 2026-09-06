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

function getMondayOfWeek(): Date {
	const d = new Date()
	d.setUTCHours(0, 0, 0, 0)
	const day = d.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	d.setUTCDate(d.getUTCDate() - diff)
	return d
}

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
		tasks: [
			{ id: "task_1", title: "Log a meal", description: "Log any meal" },
			{
				id: "task_2",
				title: "Log your weight",
				description: "Step on the scale",
			},
		],
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
	const inviteCode = `ADMIN-SPRINT-VIEW-INVITE-${++inviteCounter}`
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

describe("GET /api/admin/users/:id/sprint", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/users/some-id/sprint")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie, userId } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.get(`/api/admin/users/${userId}/sprint`)
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("shows a clear no-sprint state when the user has no sprint this week", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.sprint).toBeNull()
	})

	it("shows an in-progress sprint's tasks, completed tasks, and progress", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const db = await getTestDb()
		await db.insert(sprints).values({
			userId: memberId,
			weekStart: getMondayOfWeek(),
			title: "Test Sprint",
			tasks: [
				{ id: "task_1", title: "Log a meal", description: "Log any meal" },
				{
					id: "task_2",
					title: "Log your weight",
					description: "Step on the scale",
				},
			],
			completedTasks: ["task_1"],
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.sprint.title).toBe("Test Sprint")
		expect(res.body.sprint.tasks).toHaveLength(2)
		expect(res.body.completedTasks).toEqual(["task_1"])
		expect(res.body.progress).toBe(50)
		expect(res.body.completedAt).toBeNull()
	})

	it("shows completedAt for a completed sprint", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const db = await getTestDb()
		await db.insert(sprints).values({
			userId: memberId,
			weekStart: getMondayOfWeek(),
			title: "Done Sprint",
			tasks: [{ id: "task_1", title: "Log a meal", description: "x" }],
			completedTasks: ["task_1"],
			completedAt: new Date(),
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.progress).toBe(100)
		expect(res.body.completedAt).not.toBeNull()
	})

	it("does not show another user's sprint", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const { userId: otherUserId } = await registerAndLogin(
			"c@slimpals.test",
			"Other Member",
		)
		const db = await getTestDb()
		await db.insert(sprints).values({
			userId: otherUserId,
			weekStart: getMondayOfWeek(),
			title: "Other's Sprint",
			tasks: [{ id: "task_1", title: "Log a meal", description: "x" }],
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/sprint`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.sprint).toBeNull()
	})
})
