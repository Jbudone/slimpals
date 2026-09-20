import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
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
	generateVictoryMessage: async (userName, tournamentName) =>
		`Victory for ${userName} in ${tournamentName}!`,
	generateWeeklyInspiration: async (userName) => `Inspiration for ${userName}!`,
	generateMonthlyChallenge: async (month, year) => ({
		title: `Challenge ${month}/${year}`,
		description: "A test challenge",
		theme: "wellness",
		goals: [
			{
				id: "goal_1",
				title: "Goal 1",
				description: "Do a thing",
				target: 10,
				unit: "things",
				dailyAmount: 1,
				dailyPrompt: "Did you do the thing?",
			},
		],
	}),
	generateWeeklySprint: async (userName) => ({
		title: `Sprint for ${userName}`,
		tasks: [{ id: "task_1", title: "Do a light task" }],
	}),
	generateNpcDialogs: async () => [],
} as AIService

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
	const inviteCode = `CT-PHASEA-INVITE-${++inviteCounter}`
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

describe("GET /api/admin/content-tuning/types (Phase A rollout)", () => {
	it("includes all Phase A content types", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-phasea-types@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.get("/api/admin/content-tuning/types")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		const keys = res.body.map((t: { key: string }) => t.key)
		expect(keys).toEqual(
			expect.arrayContaining([
				"coach_personality",
				"sprints",
				"monthly_challenge",
				"victory_message",
				"weekly_inspiration",
			]),
		)
	})
})

describe("POST /api/admin/content-tuning/:type/default/generate (Phase A types)", () => {
	it("generates a sprint sample", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-sprint-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/sprints/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { scenario: "active_user" } })
		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("Sprint for Sample User")
	})

	it("generates a monthly challenge sample", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-challenge-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/monthly_challenge/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { month: "3" } })
		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("Challenge 3/")
	})

	it("generates a victory message sample", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-victory-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/victory_message/default/generate")
			.set("Cookie", cookie)
			.send({
				contextParams: { personality: "bro", tournamentType: "step_count" },
			})
		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("Victory for Sample User")
	})

	it("generates a weekly inspiration sample", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-inspiration-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/weekly_inspiration/default/generate")
			.set("Cookie", cookie)
			.send({
				contextParams: { personality: "friendly", scenario: "strong_week" },
			})
		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("Inspiration for Sample User")
	})
})
