import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { challenges, invites, users } from "../../server/db/schema.js"
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
		title: `Test Challenge ${month}/${year}`,
		description: "A test challenge",
		theme: "wellness",
		goals: [
			{
				id: "goal_1",
				title: "60 Glasses",
				description: "Drink up",
				target: 60,
				unit: "glasses",
				dailyAmount: 6,
				dailyPrompt: "Did you drink 6 glasses?",
			},
			{
				id: "goal_2",
				title: "200 Minutes",
				description: "Move it",
				target: 200,
				unit: "minutes",
				dailyAmount: 20,
				dailyPrompt: "Did you move 20 min?",
			},
			{
				id: "goal_3",
				title: "30 Servings",
				description: "Eat veggies",
				target: 30,
				unit: "servings",
				dailyAmount: 3,
				dailyPrompt: "Did you eat 3 servings?",
			},
		],
	}),
	generateNpcDialogs: async () => [],
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

const NOW = new Date()
const MONTH = NOW.getUTCMonth() + 1
const YEAR = NOW.getUTCFullYear()

function sampleGoals(n = 3) {
	return Array.from({ length: n }, (_, i) => ({
		id: `goal_${i + 1}`,
		title: `Goal ${i + 1}`,
		description: `Complete goal ${i + 1}`,
		target: 6,
		unit: "things",
		dailyAmount: 2,
		dailyPrompt: `Did you do goal ${i + 1} today?`,
	}))
}

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
	await db.insert(invites).values({
		code: "CHALLENGE-INVITE",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function seedChallenge(goals = sampleGoals()) {
	const db = await getTestDb()
	await db.insert(challenges).values({
		title: "June Wellness",
		description: "Stay healthy this month",
		month: MONTH,
		year: YEAR,
		theme: "wellness",
		tasks: goals,
	})
	const [row] = await db
		.select()
		.from(challenges)
		.where(eq(challenges.month, MONTH))
	return row
}

async function registerAndLogin(
	email = "challenger@slimpals.test",
	name = "Challenger",
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: "CHALLENGE-INVITE",
	})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
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

describe("GET /api/challenges/current", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/challenges/current")
		expect(res.status).toBe(401)
	})

	it("returns null when no challenge exists for the current month", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app)
			.get("/api/challenges/current")
			.set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body).toBeNull()
	})

	it("returns the current month challenge with user progress", async () => {
		await seedChallenge()
		const cookie = await registerAndLogin()

		const res = await request(app)
			.get("/api/challenges/current")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.title).toBe("June Wellness")
		expect(res.body.goals).toHaveLength(3)
		expect(res.body.joined).toBe(false)
		expect(res.body.progress).toEqual({})
		expect(res.body.overallProgress).toBe(0)
	})
})

describe("POST /api/challenges/:id/join", () => {
	it("creates a user_challenges row", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		expect(res.status).toBe(201)
		expect(res.body.joined).toBe(true)

		const getRes = await request(app)
			.get("/api/challenges/current")
			.set("Cookie", cookie)
		expect(getRes.body.joined).toBe(true)
	})

	it("returns 409 when already joined", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		const res = await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		expect(res.status).toBe(409)
	})

	it("returns 404 for nonexistent challenge", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app)
			.post("/api/challenges/9999/join")
			.set("Cookie", cookie)
		expect(res.status).toBe(404)
	})
})

describe("PATCH /api/challenges/:id/progress", () => {
	it("accumulates daily progress toward goals", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 1, goal_2: 1 } })

		expect(res.status).toBe(200)
		expect(res.body.progress.goal_1).toBe(1)
		expect(res.body.progress.goal_2).toBe(1)
		expect(res.body.completed).toBe(false)
	})

	it("accumulates across multiple submissions", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 1 } })

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 1 } })

		expect(res.body.progress.goal_1).toBe(2)
	})

	it("returns 400 when not joined", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 5 } })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/join/i)
	})

	it("returns 400 when dailyProgress is not an object", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: "bad" })

		expect(res.status).toBe(400)
	})

	it("ignores invalid goal IDs", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 1, fake_goal: 100 } })

		expect(res.body.progress.goal_1).toBe(1)
		expect(res.body.progress.fake_goal).toBeUndefined()
	})

	it("completes when all goals reach their targets", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 6, goal_2: 6, goal_3: 6 } })

		expect(res.status).toBe(200)
		expect(res.body.completed).toBe(true)
		expect(res.body.overallProgress).toBe(100)
		expect(res.body.gymXpAwarded).toBe(200)
	})

	it("prevents updating after completion", async () => {
		const challenge = await seedChallenge()
		const cookie = await registerAndLogin()

		await request(app)
			.post(`/api/challenges/${challenge.id}/join`)
			.set("Cookie", cookie)

		await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 6, goal_2: 6, goal_3: 6 } })

		const res = await request(app)
			.patch(`/api/challenges/${challenge.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 1 } })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/already completed/i)
	})
})

describe("POST /api/challenges/generate", () => {
	it("generates a challenge with goals via AI", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/challenges/generate")
			.set("Cookie", cookie)

		expect(res.status).toBe(201)
		expect(res.body.title).toContain("Test Challenge")
		expect(res.body.goals).toHaveLength(3)
		expect(res.body.goals[0]).toHaveProperty("target")
		expect(res.body.goals[0]).toHaveProperty("unit")
		expect(res.body.theme).toBe("wellness")
	})

	it("returns 409 if challenge already exists for the month", async () => {
		await seedChallenge()
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/challenges/generate")
			.set("Cookie", cookie)

		expect(res.status).toBe(409)
	})
})
