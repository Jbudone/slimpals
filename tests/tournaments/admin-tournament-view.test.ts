import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { dailyCheckins, invites, users } from "../../server/db/schema.js"
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
	const inviteCode = `ADMIN-TOURNEY-VIEW-INVITE-${++inviteCounter}`
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
	const { cookie: memberCookie, userId: memberId } = await registerAndLogin(
		"b@slimpals.test",
		"Member Two",
	)
	return { adminCookie, memberCookie, memberId }
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

describe("GET /api/admin/tournaments", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/tournaments")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/tournaments")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("lists tournaments with participant counts", async () => {
		const { adminCookie, memberCookie } = await adminAndMember()

		await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Step Battle",
				startDate: new Date(Date.now() - 86_400_000).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 6).toISOString(),
				type: "step_count",
			})

		const res = await request(app)
			.get("/api/admin/tournaments")
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(1)
		expect(res.body[0].name).toBe("Step Battle")
		expect(res.body[0].participantCount).toBe(1)
	})
})

describe("GET /api/admin/tournaments/:id", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/tournaments/1")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/tournaments/1")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown tournament", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.get("/api/admin/tournaments/999999")
			.set("Cookie", adminCookie)
		expect(res.status).toBe(404)
	})

	it("shows tournament detail with participants, scores, joinedAt, and completed", async () => {
		const { adminCookie, memberCookie, memberId } = await adminAndMember()

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Streak Battle",
				startDate: new Date(Date.now() - 86_400_000 * 7).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 7).toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		const db = await getTestDb()
		await db.insert(dailyCheckins).values({
			userId: memberId,
			date: new Date(Date.now() - 86_400_000),
			streakCount: 5,
		})

		const res = await request(app)
			.get(`/api/admin/tournaments/${tournamentId}`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.tournament.name).toBe("Streak Battle")
		expect(res.body.participants).toHaveLength(1)
		expect(res.body.participants[0].userId).toBe(memberId)
		expect(res.body.participants[0].score).toBe(5)
		expect(res.body.participants[0].completed).toBe(false)
		expect(res.body.participants[0].joinedAt).toBeDefined()
	})

	it("does not auto-resolve an ended, unresolved tournament as a side effect of viewing it", async () => {
		const { adminCookie, memberCookie } = await adminAndMember()

		const pastStart = new Date(Date.now() - 86_400_000 * 14)
		const pastEnd = new Date(Date.now() - 86_400_000)

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Ended Battle",
				startDate: pastStart.toISOString(),
				endDate: pastEnd.toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		const res = await request(app)
			.get(`/api/admin/tournaments/${tournamentId}`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.tournament.resolvedAt).toBeNull()
		expect(res.body.tournament.winnerId).toBeNull()
	})
})
