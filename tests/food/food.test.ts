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

// Stub AI service — returns a fixed analysis without hitting Gemini
const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Caesar Salad",
		macros: { calories: 350, protein: 12, carbs: 20, fat: 24 },
		coachMessage: "Good choice! Lots of greens.",
		alternatives: ["Add grilled chicken for more protein"],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) =>
		`Congrats ${userName}, you crushed it!`,
	generateWeeklyInspiration: async () => "Keep pushing this week!",
}

// Minimal valid 1×1 PNG for upload tests
const TINY_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
)

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
	await db.insert(invites).values({
		code: "VALID-INVITE",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email = "user@slimpals.test",
	name = "Test User",
	inviteCode = "VALID-INVITE",
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
}

// ── Setup ─────────────────────────────────────────────────────────────────────

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

// ── Behavior 4: auth enforcement ─────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/food/logs returns 401 without session", async () => {
		expect((await request(app).get("/api/food/logs")).status).toBe(401)
	})

	it("POST /api/food/analyze returns 401 without session", async () => {
		const res = await request(app)
			.post("/api/food/analyze")
			.attach("photo", TINY_PNG, "meal.png")
		expect(res.status).toBe(401)
	})
})

// ── Behavior 3: user isolation ────────────────────────────────────────────────

describe("GET /api/food/logs user isolation", () => {
	it("does not return another user's food logs", async () => {
		const db = await getTestDb()
		await db.insert(invites).values({
			code: "INVITE-B",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})

		const cookieA = await registerAndLogin(
			"usera@slimpals.test",
			"User A",
			"VALID-INVITE",
		)
		const cookieB = await registerAndLogin(
			"userb@slimpals.test",
			"User B",
			"INVITE-B",
		)

		// User A logs a meal
		await request(app)
			.post("/api/food/analyze")
			.set("Cookie", cookieA)
			.attach("photo", TINY_PNG, "meal.png")

		// User B should see nothing
		const res = await request(app).get("/api/food/logs").set("Cookie", cookieB)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(0)
	})
})

// ── Behavior 2: POST /api/food/analyze stores and returns analysis ────────────

describe("POST /api/food/analyze", () => {
	it("returns 201 with analysis and photoUrl on success", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/food/analyze")
			.set("Cookie", cookie)
			.attach("photo", TINY_PNG, "meal.png")
			.field("mealType", "breakfast")

		expect(res.status).toBe(201)
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			photoUrl: expect.stringContaining("/uploads/"),
			mealType: "breakfast",
			aiAnalysis: {
				foodName: "Caesar Salad",
				macros: expect.objectContaining({ calories: 350 }),
				coachMessage: expect.any(String),
				alternatives: expect.any(Array),
				rating: 7,
			},
		})
	})

	it("returns 400 when no photo is attached", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/food/analyze")
			.set("Cookie", cookie)
			.send({})

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/photo/i)
	})
})

// ── Behavior 1: GET /api/food/logs returns empty array ────────────────────────

describe("GET /api/food/logs", () => {
	it("returns the log created by POST /api/food/analyze", async () => {
		const cookie = await registerAndLogin()

		await request(app)
			.post("/api/food/analyze")
			.set("Cookie", cookie)
			.attach("photo", TINY_PNG, "meal.png")
			.field("mealType", "lunch")

		const res = await request(app).get("/api/food/logs").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(1)
		expect(res.body[0]).toMatchObject({
			mealType: "lunch",
			aiAnalysis: expect.objectContaining({ foodName: "Caesar Salad" }),
		})
	})

	it("returns an empty array for a user with no food logs", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/food/logs").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})
})
