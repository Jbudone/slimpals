import { ne } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	dailyCheckins,
	foodLogs,
	invites,
	users,
	weightEntries,
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

async function createInvite(code: string) {
	const db = await getTestDb()
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
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

describe("GET /api/tournaments", () => {
	it("returns empty list when no tournaments exist", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/tournaments")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/tournaments")
		expect(res.status).toBe(401)
	})
})

describe("POST /api/tournaments", () => {
	it("creates a tournament and auto-joins creator", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Summer Shred",
				startDate: "2026-07-01",
				endDate: "2026-08-01",
				type: "weight_loss",
				rewardDescription: "Bragging rights",
			})

		expect(res.status).toBe(201)
		expect(res.body.name).toBe("Summer Shred")
		expect(res.body.type).toBe("weight_loss")
		expect(res.body.participantCount).toBe(1)
		expect(res.body.rewardDescription).toBe("Bragging rights")
	})

	it("awards tournament_first_join badge on create", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Test Tourney",
				startDate: "2026-07-01",
				endDate: "2026-08-01",
				type: "streak",
			})

		expect(res.status).toBe(201)
		expect(res.body.newBadges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "tournament_first_join" }),
			]),
		)
	})

	it("rejects missing required fields", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({ name: "Incomplete" })

		expect(res.status).toBe(400)
		expect(res.body.error).toContain("required")
	})

	it("rejects invalid tournament type", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Bad Type",
				startDate: "2026-07-01",
				endDate: "2026-08-01",
				type: "invalid_type",
			})

		expect(res.status).toBe(400)
		expect(res.body.error).toContain("type must be one of")
	})

	it("rejects endDate before startDate", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Backwards",
				startDate: "2026-08-01",
				endDate: "2026-07-01",
				type: "weight_loss",
			})

		expect(res.status).toBe(400)
		expect(res.body.error).toContain("endDate must be after startDate")
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/tournaments").send({
			name: "No Auth",
			startDate: "2026-07-01",
			endDate: "2026-08-01",
			type: "weight_loss",
		})
		expect(res.status).toBe(401)
	})
})

describe("POST /api/tournaments/:id/join", () => {
	it("allows a second user to join", async () => {
		const cookies1 = await registerAndLogin("user1@test.com", "User One")
		await request(app).post("/api/tournaments").set("Cookie", cookies1).send({
			name: "Join Test",
			startDate: "2026-07-01",
			endDate: "2026-08-01",
			type: "streak",
		})

		await createInvite("INVITE-2")
		const cookies2 = await registerAndLogin(
			"user2@test.com",
			"User Two",
			"INVITE-2",
		)

		const tournamentsRes = await request(app)
			.get("/api/tournaments")
			.set("Cookie", cookies2)
		const tournamentId = tournamentsRes.body[0].id

		const joinRes = await request(app)
			.post(`/api/tournaments/${tournamentId}/join`)
			.set("Cookie", cookies2)

		expect(joinRes.status).toBe(201)
		expect(joinRes.body.joined).toBe(true)
	})

	it("prevents duplicate join", async () => {
		const cookies = await registerAndLogin()
		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Dup Test",
				startDate: "2026-07-01",
				endDate: "2026-08-01",
				type: "weight_loss",
			})

		const joinRes = await request(app)
			.post(`/api/tournaments/${createRes.body.id}/join`)
			.set("Cookie", cookies)

		expect(joinRes.status).toBe(400)
		expect(joinRes.body.error).toContain("Already joined")
	})

	it("returns 404 for nonexistent tournament", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/tournaments/99999/join")
			.set("Cookie", cookies)

		expect(res.status).toBe(404)
	})
})

describe("GET /api/tournaments/:id/leaderboard", () => {
	it("returns leaderboard with scores", async () => {
		const db = await getTestDb()

		const cookies1 = await registerAndLogin("user1@test.com", "User One")
		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies1)
			.send({
				name: "Streak Battle",
				startDate: new Date(Date.now() - 86_400_000 * 7).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 7).toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		// Seed a checkin with streak during the tournament period for user one
		const [user1] = await db
			.select()
			.from(users)
			.where(ne(users.id, "admin-001"))

		await db.insert(dailyCheckins).values({
			userId: user1.id,
			date: new Date(Date.now() - 86_400_000),
			streakCount: 5,
		})

		const lbRes = await request(app)
			.get(`/api/tournaments/${tournamentId}/leaderboard`)
			.set("Cookie", cookies1)

		expect(lbRes.status).toBe(200)
		expect(lbRes.body.tournament.name).toBe("Streak Battle")
		expect(lbRes.body.leaderboard).toHaveLength(1)
		expect(lbRes.body.leaderboard[0].score).toBe(5)
	})

	it("resolves ended tournament and picks winner", async () => {
		const db = await getTestDb()

		const cookies1 = await registerAndLogin("user1@test.com", "User One")

		// Create a tournament that already ended
		const pastStart = new Date(Date.now() - 86_400_000 * 14)
		const pastEnd = new Date(Date.now() - 86_400_000 * 1)

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies1)
			.send({
				name: "Past Battle",
				startDate: pastStart.toISOString(),
				endDate: pastEnd.toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		// Seed a checkin within the tournament period
		const [user1] = await db
			.select()
			.from(users)
			.where(ne(users.id, "admin-001"))

		await db.insert(dailyCheckins).values({
			userId: user1.id,
			date: new Date(Date.now() - 86_400_000 * 7),
			streakCount: 10,
		})

		const lbRes = await request(app)
			.get(`/api/tournaments/${tournamentId}/leaderboard`)
			.set("Cookie", cookies1)

		expect(lbRes.status).toBe(200)
		expect(lbRes.body.tournament.winnerId).toBe(user1.id)
		expect(lbRes.body.tournament.victoryMessage).toContain("User One")
		expect(lbRes.body.tournament.resolvedAt).toBeTruthy()
	})

	it("returns 404 for nonexistent tournament", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/tournaments/99999/leaderboard")
			.set("Cookie", cookies)

		expect(res.status).toBe(404)
	})

	it("weight_loss scoring returns percentage lost", async () => {
		const db = await getTestDb()
		const cookies = await registerAndLogin("wl@test.com", "WL User")

		const start = new Date(Date.now() - 86_400_000 * 14)
		const end = new Date(Date.now() + 86_400_000 * 7)

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Weight Battle",
				startDate: start.toISOString(),
				endDate: end.toISOString(),
				type: "weight_loss",
			})
		const tournamentId = createRes.body.id

		const [user] = await db
			.select()
			.from(users)
			.where(ne(users.id, "admin-001"))

		// Seed weight entries within tournament period
		await db.insert(weightEntries).values([
			{
				userId: user.id,
				weightKg: 1000,
				recordedAt: new Date(Date.now() - 86_400_000 * 10),
			},
			{
				userId: user.id,
				weightKg: 950,
				recordedAt: new Date(Date.now() - 86_400_000 * 2),
			},
		])

		const lbRes = await request(app)
			.get(`/api/tournaments/${tournamentId}/leaderboard`)
			.set("Cookie", cookies)

		expect(lbRes.status).toBe(200)
		expect(lbRes.body.leaderboard[0].score).toBe(5)
	})

	it("food_challenge scoring returns average rating", async () => {
		const db = await getTestDb()
		const cookies = await registerAndLogin("fc@test.com", "FC User")

		const start = new Date(Date.now() - 86_400_000 * 14)
		const end = new Date(Date.now() + 86_400_000 * 7)

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", cookies)
			.send({
				name: "Food Battle",
				startDate: start.toISOString(),
				endDate: end.toISOString(),
				type: "food_challenge",
			})
		const tournamentId = createRes.body.id

		const [user] = await db
			.select()
			.from(users)
			.where(ne(users.id, "admin-001"))

		await db.insert(foodLogs).values([
			{
				userId: user.id,
				photoUrl: "/uploads/test1.jpg",
				aiAnalysis: { rating: 8 },
				loggedAt: new Date(Date.now() - 86_400_000 * 5),
			},
			{
				userId: user.id,
				photoUrl: "/uploads/test2.jpg",
				aiAnalysis: { rating: 6 },
				loggedAt: new Date(Date.now() - 86_400_000 * 3),
			},
		])

		const lbRes = await request(app)
			.get(`/api/tournaments/${tournamentId}/leaderboard`)
			.set("Cookie", cookies)

		expect(lbRes.status).toBe(200)
		expect(lbRes.body.leaderboard[0].score).toBe(7)
	})
})
