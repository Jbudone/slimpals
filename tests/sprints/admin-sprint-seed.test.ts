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

function getMondayOfWeek(d: Date = new Date()): Date {
	const date = new Date(d)
	date.setUTCHours(0, 0, 0, 0)
	const day = date.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	date.setUTCDate(date.getUTCDate() - diff)
	return date
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
		tasks: [],
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
	const inviteCode = `ADMIN-SPRINT-SEED-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/seed/:id/sprint", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/seed/some-id/sprint")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie, userId } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.post(`/api/admin/seed/${userId}/sprint`)
			.set("Cookie", cookie)
			.send({ completion: "complete" })
		expect(res.status).toBe(403)
	})

	it("creates a sprint with default tasks for an arbitrary past week when none exists", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const pastWeek = getMondayOfWeek(
			new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
		)

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ weekStart: pastWeek.toISOString(), completion: "complete" })

		expect(res.status).toBe(201)
		expect(res.body.sprint.tasks.length).toBeGreaterThan(0)
		expect(new Date(res.body.sprint.weekStart).toISOString().slice(0, 10)).toBe(
			pastWeek.toISOString().slice(0, 10),
		)
	})

	it("normalizes an arbitrary date within a week to that week's Monday", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const wednesday = new Date(getMondayOfWeek())
		wednesday.setUTCDate(wednesday.getUTCDate() + 2)

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ weekStart: wednesday.toISOString(), completion: "complete" })

		expect(res.status).toBe(201)
		expect(new Date(res.body.sprint.weekStart).toISOString().slice(0, 10)).toBe(
			getMondayOfWeek().toISOString().slice(0, 10),
		)
	})

	it("seeds completion=complete with every task done and completedAt set", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ completion: "complete" })

		expect(res.status).toBe(201)
		const tasks = res.body.sprint.tasks as { id: string }[]
		expect(res.body.completedTasks).toHaveLength(tasks.length)
		expect(res.body.completedAt).not.toBeNull()
		expect(res.body.progress).toBe(100)
	})

	it("seeds completion=near_complete with exactly one task left undone", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ completion: "near_complete" })

		expect(res.status).toBe(201)
		const tasks = res.body.sprint.tasks as { id: string }[]
		expect(res.body.completedTasks).toHaveLength(tasks.length - 1)
		expect(res.body.completedAt).toBeNull()
	})

	it("seeds completion=partial with roughly half the tasks done", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ completion: "partial" })

		expect(res.status).toBe(201)
		const tasks = res.body.sprint.tasks as { id: string }[]
		expect(res.body.completedTasks.length).toBeGreaterThan(0)
		expect(res.body.completedTasks.length).toBeLessThan(tasks.length)
		expect(res.body.completedAt).toBeNull()
	})

	it("seeds completion=none with no tasks done", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ completion: "none" })

		expect(res.status).toBe(201)
		expect(res.body.completedTasks).toEqual([])
		expect(res.body.completedAt).toBeNull()
		expect(res.body.progress).toBe(0)
	})

	it("re-seeding the same user/week overwrites prior state instead of duplicating rows", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ completion: "partial" })

		await request(app)
			.post(`/api/admin/seed/${memberId}/sprint`)
			.set("Cookie", adminCookie)
			.send({ completion: "complete" })

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(sprints)
			.where(eq(sprints.userId, memberId))
		expect(rows).toHaveLength(1)
		expect(rows[0].completedAt).not.toBeNull()
	})
})
