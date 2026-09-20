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
	generateVictoryMessage: async (userName) => `Congrats ${userName}!`,
	generateWeeklyInspiration: async (userName) => `Great week ${userName}!`,
	generateMonthlyChallenge: async (month, year) => ({
		title: `Test Challenge ${month}/${year}`,
		description: "A test challenge",
		theme: "wellness",
		goals: [],
	}),
	generateNpcDialogs: async () => [],
	generateCoachSample: async (systemInstruction, scenarioText) =>
		`[${systemInstruction.slice(0, 10)}] response to: ${scenarioText}`,
	refineTuningDoc: async ({ currentDoc }) => ({
		updatedDoc: `${currentDoc}\n(refined)`,
		changelog: "Test refinement",
	}),
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
	const inviteCode = `CT-GEN-INVITE-${++inviteCounter}`
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

describe("GET /api/admin/content-tuning/types", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/content-tuning/types")
		expect(res.status).toBe(401)
	})

	it("returns the registered content types for an admin", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-types@slimpals.test",
			"Admin Types",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.get("/api/admin/content-tuning/types")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		const coach = res.body.find(
			(t: { key: string }) => t.key === "coach_personality",
		)
		expect(coach).toBeTruthy()
		expect(coach.subcategories).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: "friendly" })]),
		)
		expect(coach.feedbackTags.length).toBeGreaterThan(0)
	})
})

describe("POST /api/admin/content-tuning/:type/:subcategory/generate", () => {
	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin(
			"nonadmin-ct@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.post("/api/admin/content-tuning/coach_personality/friendly/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { scenario: "healthy_salad" } })
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown subcategory", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-gen-404@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/coach_personality/nonexistent/generate")
			.set("Cookie", cookie)
			.send({ contextParams: {} })
		expect(res.status).toBe(404)
	})

	it("generates a sample using the current tuning doc", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.post("/api/admin/content-tuning/coach_personality/friendly/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { scenario: "healthy_salad" } })

		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("response to: Grilled chicken salad")
	})
})
