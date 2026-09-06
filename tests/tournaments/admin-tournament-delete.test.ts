import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	tournamentParticipants,
	tournaments,
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
	const inviteCode = `ADMIN-TOURNEY-DELETE-INVITE-${++inviteCounter}`
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

describe("DELETE /api/admin/tournaments/:id", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).delete("/api/admin/tournaments/1")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.delete("/api/admin/tournaments/1")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown tournament", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.delete("/api/admin/tournaments/999999")
			.set("Cookie", adminCookie)
		expect(res.status).toBe(404)
	})

	it("deletes a tournament and its participant rows", async () => {
		const { adminCookie, memberCookie } = await adminAndMember()

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "To Be Deleted",
				startDate: new Date(Date.now() - 86_400_000).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 6).toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		const res = await request(app)
			.delete(`/api/admin/tournaments/${tournamentId}`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)

		const db = await getTestDb()
		const tournamentRows = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))
		expect(tournamentRows).toHaveLength(0)

		const participantRows = await db
			.select()
			.from(tournamentParticipants)
			.where(eq(tournamentParticipants.tournamentId, tournamentId))
		expect(participantRows).toHaveLength(0)
	})

	it("deleting a resolved tournament with a winner also works", async () => {
		const { adminCookie, memberCookie } = await adminAndMember()

		const createRes = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Resolved Then Deleted",
				startDate: new Date(Date.now() - 86_400_000 * 2).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 30).toISOString(),
				type: "streak",
			})
		const tournamentId = createRes.body.id

		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/resolve`)
			.set("Cookie", adminCookie)

		const res = await request(app)
			.delete(`/api/admin/tournaments/${tournamentId}`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
	})

	it("does not affect another tournament", async () => {
		const { adminCookie, memberCookie } = await adminAndMember()

		const res1 = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Keep Me",
				startDate: new Date(Date.now() - 86_400_000).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 6).toISOString(),
				type: "streak",
			})
		const res2 = await request(app)
			.post("/api/tournaments")
			.set("Cookie", memberCookie)
			.send({
				name: "Delete Me",
				startDate: new Date(Date.now() - 86_400_000).toISOString(),
				endDate: new Date(Date.now() + 86_400_000 * 6).toISOString(),
				type: "streak",
			})

		await request(app)
			.delete(`/api/admin/tournaments/${res2.body.id}`)
			.set("Cookie", adminCookie)

		const db = await getTestDb()
		const remaining = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, res1.body.id))
		expect(remaining).toHaveLength(1)
	})
})
