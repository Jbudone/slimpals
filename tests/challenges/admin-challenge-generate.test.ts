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
				title: "Goal 1",
				description: "Do a thing",
				target: 10,
				unit: "things",
				dailyAmount: 1,
				dailyPrompt: "Did you do the thing?",
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
	const inviteCode = `ADMIN-GEN-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/challenges/generate", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/challenges/generate")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.post("/api/admin/challenges/generate")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("generates a challenge for the current month as an admin", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin2@slimpals.test",
			"Admin2",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.post("/api/admin/challenges/generate")
			.set("Cookie", cookie)

		expect(res.status).toBe(201)
		expect(res.body.title).toContain("Test Challenge")
		expect(res.body.goals).toHaveLength(1)
	})

	it("returns 409 if a challenge already exists for the current month", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin3@slimpals.test",
			"Admin3",
		)
		await makeAdmin(userId)

		await request(app)
			.post("/api/admin/challenges/generate")
			.set("Cookie", cookie)
		const res = await request(app)
			.post("/api/admin/challenges/generate")
			.set("Cookie", cookie)

		expect(res.status).toBe(409)
	})
})
