import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	dailyCheckins,
	foodLogs,
	invites,
	users,
	weeklyInspirations,
} from "../../server/db/schema.js"
import type { AIService, WeeklyStats } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

let allInspirationCalls: {
	userName: string
	stats: WeeklyStats
	personality: string
}[] = []

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
	generateWeeklyInspiration: async (userName, stats, personality) => {
		allInspirationCalls.push({ userName, stats, personality })
		return `Great week ${userName}! You checked in ${stats.checkins} times.`
	},
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
	await db.insert(invites).values({
		code: "INVITE-A",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	await db.insert(invites).values({
		code: "INVITE-B",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email: string,
	name: string,
	inviteCode: string,
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

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
	allInspirationCalls = []
})

afterAll(async () => {
	await closeTestDb()
})

describe("POST /api/inspiration/generate", () => {
	it("creates a weekly_inspirations row for each user", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const _cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")

		const res = await request(app)
			.post("/api/inspiration/generate")
			.set("Cookie", cookieA)

		expect(res.status).toBe(200)
		// admin + Alice + Bob = 3 users
		expect(res.body.generated).toBe(3)
		expect(res.body.weekStart).toBeDefined()

		const db = await getTestDb()
		const rows = await db.select().from(weeklyInspirations)
		expect(rows.length).toBe(3)
	})

	it("does not duplicate messages if called twice for the same week", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		await request(app).post("/api/inspiration/generate").set("Cookie", cookie)

		const res = await request(app)
			.post("/api/inspiration/generate")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.generated).toBe(0)
	})

	it("passes user stats to the AI service", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()

		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		// Seed activity in the middle of the previous week
		const lastWeek = new Date()
		const dayOfWeek = lastWeek.getUTCDay()
		const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
		lastWeek.setUTCDate(lastWeek.getUTCDate() - daysSinceMonday - 4)

		await db.insert(dailyCheckins).values({
			userId: alice.id,
			date: lastWeek,
			streakCount: 1,
		})
		await db.insert(foodLogs).values({
			userId: alice.id,
			photoUrl: "/uploads/test.jpg",
			aiAnalysis: { foodName: "Test" },
			mealType: "lunch",
			loggedAt: lastWeek,
		})

		await request(app).post("/api/inspiration/generate").set("Cookie", cookie)

		const aliceCall = allInspirationCalls.find((c) => c.userName === "Alice")
		expect(aliceCall).toBeDefined()
		expect(aliceCall?.stats.checkins).toBeGreaterThanOrEqual(1)
		expect(aliceCall?.stats.foodLogs).toBeGreaterThanOrEqual(1)
	})

	it("uses the user's coach personality", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		// Set personality to roaster
		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ coachPersonality: "roaster" })

		await request(app).post("/api/inspiration/generate").set("Cookie", cookie)

		// The last call should be for Alice with "roaster" personality
		// (admin is generated first with "friendly", then Alice with "roaster")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))
		const [row] = await db
			.select()
			.from(weeklyInspirations)
			.where(eq(weeklyInspirations.userId, alice.id))

		expect(row).toBeDefined()
		expect(row.message).toContain("Alice")
	})
})

describe("GET /api/inspiration/weekly", () => {
	it("returns null when no inspiration exists for the current week", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const res = await request(app)
			.get("/api/inspiration/weekly")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toBeNull()
	})

	it("returns the inspiration message after generation", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		// Generate
		await request(app).post("/api/inspiration/generate").set("Cookie", cookie)

		// Fetch
		const res = await request(app)
			.get("/api/inspiration/weekly")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.message).toContain("Alice")
		expect(res.body.weekStart).toBeDefined()
		expect(res.body.coachPersonality).toBe("friendly")
	})

	it("returns the correct coach personality", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ coachPersonality: "bro" })

		await request(app).post("/api/inspiration/generate").set("Cookie", cookie)

		const res = await request(app)
			.get("/api/inspiration/weekly")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.coachPersonality).toBe("bro")
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/inspiration/weekly")
		expect(res.status).toBe(401)
	})
})

describe("POST /api/inspiration/generate — no auth required", () => {
	it("succeeds without auth (cron-style endpoint)", async () => {
		const res = await request(app).post("/api/inspiration/generate")
		expect(res.status).toBe(200)
	})
})
