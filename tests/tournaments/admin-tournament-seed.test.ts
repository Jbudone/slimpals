import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	tournamentParticipants,
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
	const inviteCode = `ADMIN-TOURNEY-SEED-INVITE-${++inviteCounter}`
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

async function adminAndMembers() {
	const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
		"a@slimpals.test",
		"Admin Two",
	)
	await makeAdmin(adminId)
	const { userId: memberA } = await registerAndLogin(
		"b@slimpals.test",
		"Member A",
	)
	const { userId: memberB } = await registerAndLogin(
		"c@slimpals.test",
		"Member B",
	)
	return { adminCookie, memberA, memberB }
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

describe("POST /api/admin/tournaments/seed", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/admin/tournaments/seed")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie, userId } = await registerAndLogin(
			"nonadmin@slimpals.test",
			"Non Admin",
		)
		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", cookie)
			.send({ creatorId: userId, type: "streak" })
		expect(res.status).toBe(403)
	})

	it("returns 400 for a missing or invalid type", async () => {
		const { adminCookie, memberA } = await adminAndMembers()
		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", adminCookie)
			.send({ creatorId: memberA, type: "not_a_type" })
		expect(res.status).toBe(400)
	})

	it("returns 404 for an unknown creatorId", async () => {
		const { adminCookie } = await adminAndMembers()
		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", adminCookie)
			.send({ creatorId: "does-not-exist", type: "streak" })
		expect(res.status).toBe(404)
	})

	it("creates a tournament with default dates about one day from ending", async () => {
		const { adminCookie, memberA } = await adminAndMembers()

		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", adminCookie)
			.send({ creatorId: memberA, type: "step_count" })

		expect(res.status).toBe(201)
		const endDate = new Date(res.body.tournament.endDate)
		const hoursUntilEnd = (endDate.getTime() - Date.now()) / (1000 * 60 * 60)
		expect(hoursUntilEnd).toBeGreaterThan(0)
		expect(hoursUntilEnd).toBeLessThan(48)
	})

	it("accepts arbitrary explicit startDate/endDate, including an already-ended tournament", async () => {
		const { adminCookie, memberA } = await adminAndMembers()
		const start = new Date(Date.now() - 30 * 86_400_000)
		start.setUTCMilliseconds(0)
		const end = new Date(Date.now() - 1 * 86_400_000)
		end.setUTCMilliseconds(0)

		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", adminCookie)
			.send({
				creatorId: memberA,
				type: "weight_loss",
				startDate: start.toISOString(),
				endDate: end.toISOString(),
			})

		expect(res.status).toBe(201)
		expect(new Date(res.body.tournament.startDate).getTime()).toBe(
			start.getTime(),
		)
		expect(new Date(res.body.tournament.endDate).getTime()).toBe(end.getTime())
		expect(res.body.tournament.resolvedAt).toBeNull()
	})

	it("auto-joins the creator and any additional participantIds, without duplicates", async () => {
		const { adminCookie, memberA, memberB } = await adminAndMembers()

		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", adminCookie)
			.send({
				creatorId: memberA,
				type: "streak",
				participantIds: [memberA, memberB],
			})

		expect(res.status).toBe(201)
		expect(res.body.participantIds.sort()).toEqual([memberA, memberB].sort())

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(tournamentParticipants)
			.where(eq(tournamentParticipants.tournamentId, res.body.tournament.id))
		expect(rows).toHaveLength(2)
	})

	it("uses a default name and accepts custom name, goalValue, and rewardDescription", async () => {
		const { adminCookie, memberA } = await adminAndMembers()

		const res = await request(app)
			.post("/api/admin/tournaments/seed")
			.set("Cookie", adminCookie)
			.send({
				creatorId: memberA,
				type: "food_challenge",
				name: "Custom Named Battle",
				goalValue: 42,
				rewardDescription: "Bragging rights",
			})

		expect(res.status).toBe(201)
		expect(res.body.tournament.name).toBe("Custom Named Battle")
		expect(res.body.tournament.goalValue).toBe(42)
		expect(res.body.tournament.rewardDescription).toBe("Bragging rights")
	})
})
