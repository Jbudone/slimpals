import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
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

// ── Behavior 1+2: GET /api/weight returns entries ordered by date ─────────────

describe("GET /api/weight", () => {
	it("returns entries for the current user ordered by recordedAt", async () => {
		const cookie = await registerAndLogin()

		// Post two entries out of chronological order
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 85.0, recordedAt: "2026-01-10T08:00:00Z" })
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 83.2, recordedAt: "2026-01-05T08:00:00Z" })

		const res = await request(app).get("/api/weight").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(2)
		// Earlier date must come first
		expect(res.body[0].weightKg).toBe(83.2)
		expect(res.body[1].weightKg).toBe(85.0)
	})

	it("returns an empty array when the user has no entries", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/weight").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})
})

// ── Behavior 5: auth enforcement ─────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/weight returns 401 without a session", async () => {
		const res = await request(app).get("/api/weight")
		expect(res.status).toBe(401)
	})

	it("POST /api/weight returns 401 without a session", async () => {
		const res = await request(app).post("/api/weight").send({ weightKg: 80 })
		expect(res.status).toBe(401)
	})
})

// ── Behavior 3: entries are scoped to the requesting user ────────────────────

describe("GET /api/weight user isolation", () => {
	it("does not return another user's entries", async () => {
		// Seed a second invite so user B can register
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

		// User A logs a weight
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieA)
			.send({ weightKg: 90.0 })

		// User B should see an empty list
		const res = await request(app).get("/api/weight").set("Cookie", cookieB)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(0)
	})
})

// ── Behavior 1: POST /api/weight creates an entry ────────────────────────────

describe("POST /api/weight", () => {
	it("returns 400 when weightKg is missing", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ note: "forgot the weight" })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/weightKg/i)
	})

	it("returns 400 when weightKg is zero or negative", async () => {
		const cookie = await registerAndLogin()

		const zero = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 0 })
		expect(zero.status).toBe(400)

		const neg = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: -5 })
		expect(neg.status).toBe(400)
	})

	it("creates a weight entry and returns it", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 82.5 })

		expect(res.status).toBe(201)
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			weightKg: 82.5,
			source: "manual",
		})
	})
})
