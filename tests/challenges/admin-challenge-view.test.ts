import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	challenges,
	invites,
	userChallenges,
	users,
} from "../../server/db/schema.js"
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
		goals: [],
	}),
	generateNpcDialogs: async () => [],
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

const NOW = new Date()
const MONTH = NOW.getUTCMonth() + 1
const YEAR = NOW.getUTCFullYear()

function sampleGoals(n = 2) {
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
}

async function createInvite(code: string) {
	const db = await getTestDb()
	await db.insert(invites).values({
		code,
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

let inviteCounter = 0

async function registerAndLogin(email: string, name: string) {
	const inviteCode = `ADMIN-VIEW-INVITE-${++inviteCounter}`
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

describe("GET /api/admin/users/:id/challenge", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/users/some-id/challenge")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie, userId } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.get(`/api/admin/users/${userId}/challenge`)
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns a no-challenge state when no challenge exists for the current month", async () => {
		const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
			"a@slimpals.test",
			"Admin Two",
		)
		await makeAdmin(adminId)
		const { userId: memberId } = await registerAndLogin(
			"b@slimpals.test",
			"Member Two",
		)

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/challenge`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.challenge).toBeNull()
		expect(res.body.joined).toBe(false)
	})

	it("returns joined=false when the challenge exists but the user hasn't joined", async () => {
		await seedChallenge()
		const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
			"a@slimpals.test",
			"Admin Two",
		)
		await makeAdmin(adminId)
		const { userId: memberId } = await registerAndLogin(
			"b@slimpals.test",
			"Member Two",
		)

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/challenge`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.challenge).not.toBeNull()
		expect(res.body.challenge.title).toBe("June Wellness")
		expect(res.body.joined).toBe(false)
		expect(res.body.completedTasks).toBeNull()
		expect(res.body.completedAt).toBeNull()
	})

	it("returns progress and completedAt for a user who joined and completed the challenge", async () => {
		const challenge = await seedChallenge()
		const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
			"a@slimpals.test",
			"Admin Two",
		)
		await makeAdmin(adminId)
		const { userId: memberId } = await registerAndLogin(
			"b@slimpals.test",
			"Member Two",
		)

		const db = await getTestDb()
		const completedAt = new Date()
		await db.insert(userChallenges).values({
			userId: memberId,
			challengeId: challenge.id,
			completedTasks: { goal_1: 6, goal_2: 6 },
			completedAt,
		})

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/challenge`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.joined).toBe(true)
		expect(res.body.completedTasks).toEqual({ goal_1: 6, goal_2: 6 })
		expect(res.body.completedAt).not.toBeNull()
		expect(res.body.goalsCompleted).toBe(2)
		expect(res.body.totalGoals).toBe(2)
	})
})
