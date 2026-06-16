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

async function getUserId(cookie: string) {
	const res = await request(app).get("/api/users/me").set("Cookie", cookie)
	return res.body.id as string
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

// ── Behavior 1 (tracer): GET /api/checkins/today ──────────────────────────────

describe("GET /api/checkins/today — new user", () => {
	it("returns checkedInToday:false and streakCount:0", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app)
			.get("/api/checkins/today")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ checkedInToday: false, streakCount: 0 })
	})
})

// ── Behavior 2: POST /api/checkins ────────────────────────────────────────────

describe("POST /api/checkins", () => {
	it("creates first check-in with streakCount 1", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({ mood: "great" })

		expect(res.status).toBe(201)
		expect(res.body).toMatchObject({ streakCount: 1, mood: "great" })
	})

	it("is idempotent — second POST today returns same check-in", async () => {
		const cookie = await registerAndLogin()
		await request(app).post("/api/checkins").set("Cookie", cookie).send({})
		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({ mood: "okay" })

		expect(res.status).toBe(200)
		expect(res.body.streakCount).toBe(1)
	})
})

// ── Behavior 3: GET reflects check-in ────────────────────────────────────────

describe("GET /api/checkins/today after checking in", () => {
	it("returns checkedInToday:true with correct streak", async () => {
		const cookie = await registerAndLogin()
		await request(app).post("/api/checkins").set("Cookie", cookie).send({})

		const res = await request(app)
			.get("/api/checkins/today")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ checkedInToday: true, streakCount: 1 })
	})
})

// ── Behavior 4: Consecutive days ─────────────────────────────────────────────

describe("Streak: consecutive days", () => {
	it("increments streak when checking in on consecutive day", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await seedCheckin(userId, 1, 4) // checked in yesterday, streak was 4

		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})

		expect(res.status).toBe(201)
		expect(res.body.streakCount).toBe(5)
	})
})

// ── Behavior 5: Grace period ──────────────────────────────────────────────────

describe("Streak: grace period", () => {
	it("GET shows frozen streak when exactly one day was missed (2 days ago)", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await seedCheckin(userId, 2, 7) // last check-in was 2 days ago (missed yesterday)

		const res = await request(app)
			.get("/api/checkins/today")
			.set("Cookie", cookie)

		expect(res.body).toMatchObject({ checkedInToday: false, streakCount: 7 })
	})

	it("POST continues streak when used within grace window (2 days since last)", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await seedCheckin(userId, 2, 7) // grace window open

		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})

		expect(res.status).toBe(201)
		expect(res.body.streakCount).toBe(8)
	})
})

// ── Behavior 6: Grace expiry ──────────────────────────────────────────────────

describe("Streak: grace expired (3+ days since last)", () => {
	it("GET shows streakCount 0 when two or more days were missed", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await seedCheckin(userId, 3, 10) // grace expired

		const res = await request(app)
			.get("/api/checkins/today")
			.set("Cookie", cookie)

		expect(res.body).toMatchObject({ checkedInToday: false, streakCount: 0 })
	})

	it("POST resets streak to 1 after grace has expired", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await seedCheckin(userId, 3, 10)

		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})

		expect(res.status).toBe(201)
		expect(res.body.streakCount).toBe(1)
	})
})

// ── Behavior 7: Auto check-in from weight logging ─────────────────────────────

describe("Auto check-in from weight logging", () => {
	it("logging weight creates a check-in for today", async () => {
		const cookie = await registerAndLogin()
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 82.5 })

		const res = await request(app)
			.get("/api/checkins/today")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.checkedInToday).toBe(true)
	})
})

// ── Behavior 8: Auth enforcement ──────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/checkins/today returns 401 without session", async () => {
		const res = await request(app).get("/api/checkins/today")
		expect(res.status).toBe(401)
	})

	it("POST /api/checkins returns 401 without session", async () => {
		const res = await request(app).post("/api/checkins").send({})
		expect(res.status).toBe(401)
	})
})
