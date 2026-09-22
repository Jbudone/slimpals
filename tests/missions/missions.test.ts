import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, missionCompletions, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { currentPeriodStart } from "../../server/services/missions/index.js"
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
	generateWeeklyInspiration: async () => "Keep pushing this week!",
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
	await db.insert(invites).values([
		{
			code: "VALID-INVITE",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		},
		{
			code: "VALID-INVITE-B",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		},
	])
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

describe("POST /api/missions", () => {
	it("creates a daily mission", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({
				title: "Read for 20 minutes",
				description: "Fiction or non-fiction, doesn't matter",
				cadence: "daily",
				difficulty: "easy",
			})

		expect(res.status).toBe(201)
		expect(res.body.title).toBe("Read for 20 minutes")
		expect(res.body.description).toBe("Fiction or non-fiction, doesn't matter")
		expect(res.body.cadence).toBe("daily")
		expect(res.body.difficulty).toBe("easy")
		expect(res.body.id).toBeTypeOf("number")
	})

	it("creates a weekly mission with no description", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({
				title: "Deep clean the kitchen",
				cadence: "weekly",
				difficulty: "hard",
			})

		expect(res.status).toBe(201)
		expect(res.body.description).toBeNull()
		expect(res.body.cadence).toBe("weekly")
		expect(res.body.difficulty).toBe("hard")
	})

	it("rejects an empty title", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "   ", cadence: "daily", difficulty: "easy" })

		expect(res.status).toBe(400)
	})

	it("rejects an invalid cadence", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Test", cadence: "monthly", difficulty: "easy" })

		expect(res.status).toBe(400)
	})

	it("rejects an invalid difficulty", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Test", cadence: "daily", difficulty: "impossible" })

		expect(res.status).toBe(400)
	})

	it("returns 401 without auth", async () => {
		const res = await request(app)
			.post("/api/missions")
			.send({ title: "Test", cadence: "daily", difficulty: "easy" })
		expect(res.status).toBe(401)
	})
})

describe("GET /api/missions", () => {
	it("groups missions by cadence and excludes archived ones", async () => {
		const cookies = await registerAndLogin()
		await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Daily A", cadence: "daily", difficulty: "easy" })
		const dailyB = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({
				title: "Daily B (archived)",
				cadence: "daily",
				difficulty: "medium",
			})
		await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Weekly A", cadence: "weekly", difficulty: "hard" })

		await request(app)
			.post(`/api/missions/${dailyB.body.id}/archive`)
			.set("Cookie", cookies)

		const res = await request(app).get("/api/missions").set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.daily).toHaveLength(1)
		expect(res.body.daily[0].title).toBe("Daily A")
		expect(res.body.weekly).toHaveLength(1)
		expect(res.body.weekly[0].title).toBe("Weekly A")
	})

	it("only returns the authenticated user's own missions", async () => {
		const cookiesA = await registerAndLogin("a@slimpals.test", "User A")
		const cookiesB = await registerAndLogin(
			"b@slimpals.test",
			"User B",
			"VALID-INVITE-B",
		)

		await request(app)
			.post("/api/missions")
			.set("Cookie", cookiesA)
			.send({ title: "User A's mission", cadence: "daily", difficulty: "easy" })

		const res = await request(app).get("/api/missions").set("Cookie", cookiesB)
		expect(res.body.daily).toHaveLength(0)
		expect(res.body.weekly).toHaveLength(0)
	})
})

describe("PATCH /api/missions/:id", () => {
	it("edits title, description, and difficulty", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Original", cadence: "daily", difficulty: "easy" })

		const res = await request(app)
			.patch(`/api/missions/${created.body.id}`)
			.set("Cookie", cookies)
			.send({
				title: "Updated",
				description: "New description",
				difficulty: "hard",
			})

		expect(res.status).toBe(200)
		expect(res.body.title).toBe("Updated")
		expect(res.body.description).toBe("New description")
		expect(res.body.difficulty).toBe("hard")
		expect(res.body.cadence).toBe("daily")
	})

	it("returns 404 for a mission owned by another user", async () => {
		const cookiesA = await registerAndLogin("a@slimpals.test", "User A")
		const cookiesB = await registerAndLogin(
			"b@slimpals.test",
			"User B",
			"VALID-INVITE-B",
		)

		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookiesA)
			.send({ title: "A's mission", cadence: "daily", difficulty: "easy" })

		const res = await request(app)
			.patch(`/api/missions/${created.body.id}`)
			.set("Cookie", cookiesB)
			.send({ title: "Hijacked" })

		expect(res.status).toBe(404)
	})

	it("returns 404 for a nonexistent mission", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.patch("/api/missions/999999")
			.set("Cookie", cookies)
			.send({ title: "Nope" })
		expect(res.status).toBe(404)
	})
})

describe("POST /api/missions/:id/archive", () => {
	it("archives a mission so it no longer appears in the active list", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "To archive", cadence: "weekly", difficulty: "medium" })

		const archiveRes = await request(app)
			.post(`/api/missions/${created.body.id}/archive`)
			.set("Cookie", cookies)
		expect(archiveRes.status).toBe(200)

		const listRes = await request(app)
			.get("/api/missions")
			.set("Cookie", cookies)
		expect(listRes.body.weekly).toHaveLength(0)
	})

	it("returns 404 when archiving an already-archived mission", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Double archive", cadence: "daily", difficulty: "easy" })

		await request(app)
			.post(`/api/missions/${created.body.id}/archive`)
			.set("Cookie", cookies)
		const secondAttempt = await request(app)
			.post(`/api/missions/${created.body.id}/archive`)
			.set("Cookie", cookies)

		expect(secondAttempt.status).toBe(404)
	})

	it("returns 404 for a mission owned by another user", async () => {
		const cookiesA = await registerAndLogin("a@slimpals.test", "User A")
		const cookiesB = await registerAndLogin(
			"b@slimpals.test",
			"User B",
			"VALID-INVITE-B",
		)

		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookiesA)
			.send({ title: "A's mission", cadence: "daily", difficulty: "easy" })

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/archive`)
			.set("Cookie", cookiesB)
		expect(res.status).toBe(404)
	})
})

describe("POST /api/missions/:id/complete", () => {
	it("awards the correct XP and marks the mission completed this period", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "medium" })

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.completed).toBe(true)
		expect(res.body.xpAwarded).toBe(10)
		expect(res.body.gym.xp).toBe(10)

		const listRes = await request(app)
			.get("/api/missions")
			.set("Cookie", cookies)
		expect(listRes.body.daily[0].completedThisPeriod).toBe(true)
	})

	it("awards the correct XP for a weekly hard mission", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Deep clean", cadence: "weekly", difficulty: "hard" })

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)

		expect(res.body.xpAwarded).toBe(80)
		expect(res.body.gym.xp).toBe(80)
	})

	it("rejects completing a mission already completed this period", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "easy" })

		await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)
		const second = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)

		expect(second.status).toBe(400)
	})

	it("returns 404 for an archived mission", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "easy" })
		await request(app)
			.post(`/api/missions/${created.body.id}/archive`)
			.set("Cookie", cookies)

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)
		expect(res.status).toBe(404)
	})

	it("returns 404 for a mission owned by another user", async () => {
		const cookiesA = await registerAndLogin("a@slimpals.test", "User A")
		const cookiesB = await registerAndLogin(
			"b@slimpals.test",
			"User B",
			"VALID-INVITE-B",
		)
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookiesA)
			.send({ title: "A's mission", cadence: "daily", difficulty: "easy" })

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookiesB)
		expect(res.status).toBe(404)
	})

	it("allows completing again after the daily period has reset", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "easy" })

		const db = await getTestDb()
		const yesterday = new Date(
			currentPeriodStart("daily").getTime() - 86_400_000,
		)
		await db.insert(missionCompletions).values({
			missionId: created.body.id,
			userId: (
				await db
					.select()
					.from(users)
					.where(eq(users.email, "user@slimpals.test"))
			)[0].id,
			periodStart: yesterday,
			xpAwarded: 5,
		})

		const listRes = await request(app)
			.get("/api/missions")
			.set("Cookie", cookies)
		expect(listRes.body.daily[0].completedThisPeriod).toBe(false)

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)
		expect(res.status).toBe(200)
	})
})

describe("POST /api/missions/:id/uncomplete", () => {
	it("retracts the exact XP that was awarded", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "hard" })

		await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/uncomplete`)
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.completed).toBe(false)
		expect(res.body.xpRetracted).toBe(20)
		expect(res.body.gym.xp).toBe(0)

		const listRes = await request(app)
			.get("/api/missions")
			.set("Cookie", cookies)
		expect(listRes.body.daily[0].completedThisPeriod).toBe(false)
	})

	it("rejects un-completing a mission not completed this period", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "easy" })

		const res = await request(app)
			.post(`/api/missions/${created.body.id}/uncomplete`)
			.set("Cookie", cookies)
		expect(res.status).toBe(400)
	})

	it("can be completed again after un-completing, within the same period", async () => {
		const cookies = await registerAndLogin()
		const created = await request(app)
			.post("/api/missions")
			.set("Cookie", cookies)
			.send({ title: "Read", cadence: "daily", difficulty: "easy" })

		await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)
		await request(app)
			.post(`/api/missions/${created.body.id}/uncomplete`)
			.set("Cookie", cookies)
		const res = await request(app)
			.post(`/api/missions/${created.body.id}/complete`)
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.gym.xp).toBe(5)
	})
})
