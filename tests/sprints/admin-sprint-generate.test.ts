import { and, eq } from "drizzle-orm"
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
			{ id: "task_1", title: "Log a meal" },
			{ id: "task_2", title: "Log your weight" },
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
	const inviteCode = `ADMIN-SPRINT-GEN-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/sprints/generate", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/sprints/generate")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("generates a sprint for a single specified user", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({ userId: memberId })

		expect(res.status).toBe(201)
		expect(res.body.generated).toBe(1)
		expect(res.body.sprint.title).toContain("Sprint")

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(sprints)
			.where(
				and(
					eq(sprints.userId, memberId),
					eq(sprints.weekStart, getMondayOfWeek()),
				),
			)
		expect(rows).toHaveLength(1)
	})

	it("returns 409 if the specified user already has a sprint this week", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({ userId: memberId })

		const res = await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({ userId: memberId })

		expect(res.status).toBe(409)
	})

	it("returns 404 for an unknown user id", async () => {
		const { adminCookie } = await adminAndMember()

		const res = await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({ userId: "does-not-exist" })

		expect(res.status).toBe(404)
	})

	it("generates sprints for all users when no userId is given", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({})

		expect(res.status).toBe(201)
		expect(res.body.generated).toBeGreaterThanOrEqual(1)

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(sprints)
			.where(
				and(
					eq(sprints.userId, memberId),
					eq(sprints.weekStart, getMondayOfWeek()),
				),
			)
		expect(rows).toHaveLength(1)
	})

	it("skips users who already have a sprint this week during a bulk run", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({ userId: memberId })

		const res = await request(app)
			.post("/api/admin/sprints/generate")
			.set("Cookie", adminCookie)
			.send({})

		expect(res.status).toBe(201)

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(sprints)
			.where(eq(sprints.userId, memberId))
		expect(rows).toHaveLength(1)
	})
})
