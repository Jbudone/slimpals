import { and, eq } from "drizzle-orm"
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
	const inviteCode = `ADMIN-SEED-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/seed/:id/challenge", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/seed/some-id/challenge")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie, userId } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.post(`/api/admin/seed/${userId}/challenge`)
			.set("Cookie", cookie)
			.send({ completion: "complete" })
		expect(res.status).toBe(403)
	})

	it("creates a challenge with default goals when none exists for the target month", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 3, year: 2020, completion: "complete" })

		expect(res.status).toBe(201)
		expect(res.body.challenge.month).toBe(3)
		expect(res.body.challenge.year).toBe(2020)
		expect(res.body.challenge.goals.length).toBeGreaterThan(0)

		const db = await getTestDb()
		const [row] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, 3), eq(challenges.year, 2020)))
		expect(row).toBeDefined()
	})

	it("seeds completion=complete with all goals at target and completedAt set", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 4, year: 2021, completion: "complete" })

		expect(res.status).toBe(201)
		const goals = res.body.challenge.goals as { id: string; target: number }[]
		for (const g of goals) {
			expect(res.body.completedTasks[g.id]).toBe(g.target)
		}
		expect(res.body.completedAt).not.toBeNull()
		expect(res.body.joined).toBe(true)
	})

	it("seeds completion=near_complete with exactly one goal short of target", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 5, year: 2021, completion: "near_complete" })

		expect(res.status).toBe(201)
		const goals = res.body.challenge.goals as { id: string; target: number }[]
		const shortGoals = goals.filter(
			(g) => res.body.completedTasks[g.id] < g.target,
		)
		expect(shortGoals).toHaveLength(1)
		expect(res.body.completedAt).toBeNull()
	})

	it("seeds completion=partial with roughly half progress on each goal", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 6, year: 2021, completion: "partial" })

		expect(res.status).toBe(201)
		const goals = res.body.challenge.goals as { id: string; target: number }[]
		for (const g of goals) {
			expect(res.body.completedTasks[g.id]).toBeGreaterThan(0)
			expect(res.body.completedTasks[g.id]).toBeLessThan(g.target)
		}
		expect(res.body.completedAt).toBeNull()
		expect(res.body.joined).toBe(true)
	})

	it("seeds completion=none by removing any existing user_challenges row", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 7, year: 2021, completion: "complete" })

		const res = await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 7, year: 2021, completion: "none" })

		expect(res.status).toBe(201)
		expect(res.body.joined).toBe(false)
		expect(res.body.completedTasks).toBeNull()

		const db = await getTestDb()
		const [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, 7), eq(challenges.year, 2021)))
		const rows = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, memberId),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
		expect(rows).toHaveLength(0)
	})

	it("re-seeding the same user/month overwrites prior state instead of duplicating rows", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 8, year: 2021, completion: "partial" })

		await request(app)
			.post(`/api/admin/seed/${memberId}/challenge`)
			.set("Cookie", adminCookie)
			.send({ month: 8, year: 2021, completion: "complete" })

		const db = await getTestDb()
		const [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, 8), eq(challenges.year, 2021)))
		const rows = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, memberId),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
		expect(rows).toHaveLength(1)
		expect(rows[0].completedAt).not.toBeNull()
	})
})
