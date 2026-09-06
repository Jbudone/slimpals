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
	const inviteCode = `ADMIN-TOURNEY-RESOLVE-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/tournaments/:id/resolve", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/tournaments/1/resolve")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.post("/api/admin/tournaments/1/resolve")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown tournament", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/tournaments/999999/resolve")
			.set("Cookie", adminCookie)
		expect(res.status).toBe(404)
	})

	it("force-resolves a tournament that hasn't reached its endDate yet, awarding the winner and badge", async () => {
		const { adminCookie, memberCookie, memberId } = await adminAndMember()

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Force Resolve Battle",
				startDate: new Date(Date.now() - 86_400_000).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 30).toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		const db = await getTestDb()
		await db.insert(dailyCheckins).values({
			userId: memberId,
			date: new Date(),
			streakCount: 7,
		})

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/resolve`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.tournament.winnerId).toBe(memberId)
		expect(res.body.tournament.resolvedAt).not.toBeNull()
		expect(res.body.tournament.victoryMessage).toContain("Member Two")

		const badgesRes = await request(app)
			.get("/api/badges/mine")
			.set("Cookie", memberCookie)
		const badgeKeys = badgesRes.body.map((b: { key: string }) => b.key)
		expect(badgeKeys).toContain("tournament_first_win")
	})

	it("returns 409 if the tournament is already resolved", async () => {
		const { adminCookie, memberCookie } = await adminAndMember()

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Already Resolved Battle",
				startDate: new Date(Date.now() - 86_400_000).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 30).toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/resolve`)
			.set("Cookie", adminCookie)

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/resolve`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(409)
	})
})
