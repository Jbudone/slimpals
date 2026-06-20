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
			{ id: "task_1", title: "Walk 30 min" },
			{ id: "task_2", title: "Drink 8 glasses" },
			{ id: "task_3", title: "Log a meal" },
			{ id: "task_4", title: "Stretch for 10 min" },
			{ id: "task_5", title: "Meditate 5 min" },
			{ id: "task_6", title: "Eat a fruit" },
		],
	}),
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
	await db.insert(invites).values([
		{
			code: "SPRINT-INVITE-A",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		},
		{
			code: "SPRINT-INVITE-B",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		},
	])
}

async function seedSprint(userId: string) {
	const db = await getTestDb()
	const monday = getMondayOfWeek()
	await db.insert(sprints).values({
		userId,
		weekStart: monday,
		title: "Test Sprint",
		tasks: [
			{ id: "task_1", title: "Task A" },
			{ id: "task_2", title: "Task B" },
			{ id: "task_3", title: "Task C" },
		],
	})
	const [row] = await db
		.select()
		.from(sprints)
		.where(eq(sprints.userId, userId))
	return row
}

let inviteIndex = 0
async function registerAndLogin(
	email = "sprinter@slimpals.test",
	name = "Sprinter",
) {
	const code = inviteIndex === 0 ? "SPRINT-INVITE-A" : "SPRINT-INVITE-B"
	inviteIndex++
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: code,
	})
	const cookies = res.headers["set-cookie"] as string[]
	const cookie = Array.isArray(cookies) ? cookies.join("; ") : cookies

	const me = await request(app).get("/api/users/me").set("Cookie", cookie)
	return { cookie, userId: me.body.id as string }
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
	inviteIndex = 0
})

afterAll(async () => {
	await closeTestDb()
})

describe("GET /api/sprints/current", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/sprints/current")
		expect(res.status).toBe(401)
	})

	it("returns null when no sprint exists for the current week", async () => {
		const { cookie } = await registerAndLogin()
		const res = await request(app)
			.get("/api/sprints/current")
			.set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body).toBeNull()
	})

	it("returns the current sprint with tasks and progress", async () => {
		const { cookie, userId } = await registerAndLogin()
		await seedSprint(userId)

		const res = await request(app)
			.get("/api/sprints/current")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.title).toBe("Test Sprint")
		expect(res.body.tasks).toHaveLength(3)
		expect(res.body.completedTasks).toEqual([])
		expect(res.body.progress).toBe(0)
	})
})

describe("PATCH /api/sprints/:id/tasks", () => {
	it("checks off tasks and returns progress", async () => {
		const { cookie, userId } = await registerAndLogin()
		const sprint = await seedSprint(userId)

		const res = await request(app)
			.patch(`/api/sprints/${sprint.id}/tasks`)
			.set("Cookie", cookie)
			.send({ completedTasks: ["task_1", "task_2"] })

		expect(res.status).toBe(200)
		expect(res.body.completedTasks).toEqual(["task_1", "task_2"])
		expect(res.body.progress).toBe(67)
		expect(res.body.completed).toBe(false)
	})

	it("awards 50 gym XP on sprint completion", async () => {
		const { cookie, userId } = await registerAndLogin()
		const sprint = await seedSprint(userId)

		const res = await request(app)
			.patch(`/api/sprints/${sprint.id}/tasks`)
			.set("Cookie", cookie)
			.send({ completedTasks: ["task_1", "task_2", "task_3"] })

		expect(res.body.completed).toBe(true)
		expect(res.body.progress).toBe(100)
		expect(res.body.gymXpAwarded).toBe(50)
	})

	it("returns 404 for another user's sprint", async () => {
		const { userId } = await registerAndLogin()
		const sprint = await seedSprint(userId)

		const { cookie: otherCookie } = await registerAndLogin(
			"other@slimpals.test",
			"Other",
		)

		const res = await request(app)
			.patch(`/api/sprints/${sprint.id}/tasks`)
			.set("Cookie", otherCookie)
			.send({ completedTasks: ["task_1"] })

		expect(res.status).toBe(404)
	})

	it("returns 400 after sprint is completed", async () => {
		const { cookie, userId } = await registerAndLogin()
		const sprint = await seedSprint(userId)

		await request(app)
			.patch(`/api/sprints/${sprint.id}/tasks`)
			.set("Cookie", cookie)
			.send({ completedTasks: ["task_1", "task_2", "task_3"] })

		const res = await request(app)
			.patch(`/api/sprints/${sprint.id}/tasks`)
			.set("Cookie", cookie)
			.send({ completedTasks: ["task_1"] })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/already completed/i)
	})

	it("filters invalid task IDs", async () => {
		const { cookie, userId } = await registerAndLogin()
		const sprint = await seedSprint(userId)

		const res = await request(app)
			.patch(`/api/sprints/${sprint.id}/tasks`)
			.set("Cookie", cookie)
			.send({ completedTasks: ["task_1", "fake_id"] })

		expect(res.body.completedTasks).toEqual(["task_1"])
	})
})

describe("POST /api/sprints/generate", () => {
	it("generates sprints for all users", async () => {
		const { cookie } = await registerAndLogin()

		const res = await request(app)
			.post("/api/sprints/generate")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.generated).toBeGreaterThanOrEqual(1)
		expect(res.body.weekStart).toBeDefined()
	})

	it("does not duplicate sprints for the same week", async () => {
		const { cookie } = await registerAndLogin()

		await request(app).post("/api/sprints/generate").set("Cookie", cookie)

		const res = await request(app)
			.post("/api/sprints/generate")
			.set("Cookie", cookie)

		expect(res.body.generated).toBe(0)
	})

	it("generated sprint appears in GET /api/sprints/current", async () => {
		const { cookie } = await registerAndLogin()

		await request(app).post("/api/sprints/generate").set("Cookie", cookie)

		const res = await request(app)
			.get("/api/sprints/current")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.title).toContain("Sprint")
		expect(res.body.tasks).toHaveLength(6)
	})
})
