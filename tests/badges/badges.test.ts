import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { dailyCheckins, invites, users } from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

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

function startOfDayUtc(daysAgo = 0): Date {
	const d = new Date()
	d.setUTCHours(0, 0, 0, 0)
	d.setUTCDate(d.getUTCDate() - daysAgo)
	return d
}

async function seedCheckin(
	userId: string,
	daysAgo: number,
	streakCount: number,
) {
	const db = await getTestDb()
	await db.insert(dailyCheckins).values({
		userId,
		date: startOfDayUtc(daysAgo),
		streakCount,
	})
}

async function getUserId(cookie: string): Promise<string> {
	const res = await request(app).get("/api/users/me").set("Cookie", cookie)
	return res.body.id as string
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

// ── Behavior 1 (tracer): GET /api/badges returns the full catalog ─────────────

describe("GET /api/badges — catalog", () => {
	it("returns all seeded badges", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app).get("/api/badges").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(Array.isArray(res.body)).toBe(true)
		expect(res.body.length).toBeGreaterThanOrEqual(40)

		const badge = res.body.find((b: { key: string }) => b.key === "streak_7")
		expect(badge).toMatchObject({
			key: "streak_7",
			name: "7-Day Streak",
			tier: "bronze",
		})
	})

	it("returns 401 without session", async () => {
		expect((await request(app).get("/api/badges")).status).toBe(401)
	})
})

// ── Behavior 2: GET /api/badges/mine — empty for new user ────────────────────

describe("GET /api/badges/mine — new user", () => {
	it("returns an empty array when the user has no earned badges", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app).get("/api/badges/mine").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})

	it("returns 401 without session", async () => {
		expect((await request(app).get("/api/badges/mine")).status).toBe(401)
	})
})

// ── Behavior 3: 7-day streak awards streak_7 badge ───────────────────────────

describe("Streak badge — 7-day milestone", () => {
	it("awards streak_7 when check-in brings streak to 7", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)

		// Seed 6 prior consecutive check-ins (streak was 6 yesterday)
		await seedCheckin(userId, 1, 6)

		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})

		expect(res.status).toBe(201)
		expect(res.body.streakCount).toBe(7)
		expect(res.body.newBadges).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: "streak_7" })]),
		)
	})

	it("does not award streak_7 when streak is below 7", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)

		await seedCheckin(userId, 1, 3)

		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})

		expect(res.body.streakCount).toBe(4)
		const keys = (res.body.newBadges ?? []).map((b: { key: string }) => b.key)
		expect(keys).not.toContain("streak_7")
	})

	it("awards streak_7 exactly once (idempotent)", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)

		// First time reaching 7
		await seedCheckin(userId, 1, 6)
		const first = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})
		expect(
			first.body.newBadges.some((b: { key: string }) => b.key === "streak_7"),
		).toBe(true)

		// Simulate next day's check-in that also has streak ≥ 7
		// (truncate checkins, re-seed at streak=7 yesterday, check in again)
		const db = await getTestDb()
		await db.delete(dailyCheckins)
		await seedCheckin(userId, 1, 7)

		const second = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})
		const keys = (second.body.newBadges ?? []).map(
			(b: { key: string }) => b.key,
		)
		expect(keys).not.toContain("streak_7")
	})
})

// ── Behavior 4: weight loss badge ─────────────────────────────────────────────

describe("Weight loss badge — loss_5kg", () => {
	it("awards loss_5kg when user loses ≥ 5 kg from starting weight", async () => {
		const cookie = await registerAndLogin()

		// Starting weight: 90 kg
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		// Current weight: 84 kg (lost 6 kg)
		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 84 })

		expect(res.status).toBe(201)
		expect(res.body.newBadges).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: "loss_5kg" })]),
		)
	})

	it("does not award loss_5kg when user has not lost enough weight", async () => {
		const cookie = await registerAndLogin()

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		// Only lost 2 kg — not enough
		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 88 })

		const keys = (res.body.newBadges ?? []).map((b: { key: string }) => b.key)
		expect(keys).not.toContain("loss_5kg")
	})

	it("does not award loss_5kg when current weight is higher than start", async () => {
		const cookie = await registerAndLogin()

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 80 })

		// Weight went up
		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 85 })

		const keys = (res.body.newBadges ?? []).map((b: { key: string }) => b.key)
		expect(keys).not.toContain("loss_5kg")
	})

	it("awards loss_5kg exactly once (idempotent)", async () => {
		const cookie = await registerAndLogin()

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		// First drop past 5 kg threshold
		const first = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 84 })
		expect(
			first.body.newBadges.some((b: { key: string }) => b.key === "loss_5kg"),
		).toBe(true)

		// Another entry still below starting weight — should not re-award
		const second = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 83 })
		const keys = (second.body.newBadges ?? []).map(
			(b: { key: string }) => b.key,
		)
		expect(keys).not.toContain("loss_5kg")
	})
})

// ── Behavior 5: GET /api/badges/mine reflects earned badges ──────────────────

describe("GET /api/badges/mine — after earning", () => {
	it("returns earned badge with earnedAt after a streak milestone", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)

		await seedCheckin(userId, 1, 6)
		await request(app).post("/api/checkins").set("Cookie", cookie).send({})

		const res = await request(app).get("/api/badges/mine").set("Cookie", cookie)

		expect(res.status).toBe(200)
		const earned = res.body.find((b: { key: string }) => b.key === "streak_7")
		expect(earned).toBeDefined()
		expect(earned.earnedAt).toBeDefined()
	})

	it("is scoped to the requesting user", async () => {
		const db = await getTestDb()
		await db.insert(invites).values({
			code: "INVITE-B",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})

		const cookieA = await registerAndLogin(
			"a@slimpals.test",
			"Alice",
			"VALID-INVITE",
		)
		const cookieB = await registerAndLogin("b@slimpals.test", "Bob", "INVITE-B")
		const userAId = await getUserId(cookieA)

		await seedCheckin(userAId, 1, 6)
		await request(app).post("/api/checkins").set("Cookie", cookieA).send({})

		// Bob should see no earned badges
		const resB = await request(app)
			.get("/api/badges/mine")
			.set("Cookie", cookieB)
		expect(resB.body).toEqual([])
	})
})
