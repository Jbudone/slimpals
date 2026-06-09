import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

// Lazy-import the app AFTER setup.ts has overridden DATABASE_URL
const { createApp } = await import("../../server/app.js")
const app = createApp()

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Setup ──────────────────────────────────────────────────────────────────

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

// ── Behavior 1: Register with a valid invite code ──────────────────────────

describe("POST /api/auth/sign-up/email", () => {
	it("creates a user and session when the invite code is valid", async () => {
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "New User",
			email: "newuser@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		expect(res.status).toBe(200)
		expect(res.body).toHaveProperty("user")
		expect(res.body.user.email).toBe("newuser@slimpals.test")

		// Session cookie must be set
		const cookies = res.headers["set-cookie"] as string[] | string
		const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies
		expect(cookieStr).toMatch(/better-auth\.session_token/i)
	})

	// ── Behavior 2: Missing invite code → 400 ─────────────────────────────

	it("returns 400 when invite code is missing", async () => {
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "No Invite",
			email: "noinvite@slimpals.test",
			password: "Password1!",
		})

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/invite code/i)
	})

	// ── Behavior 3: Invalid invite code → 400 ────────────────────────────

	it("returns 400 when the invite code does not exist", async () => {
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "Wrong Code",
			email: "wrongcode@slimpals.test",
			password: "Password1!",
			inviteCode: "DOES-NOT-EXIST",
		})

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/invalid|expired/i)
	})

	// ── Behavior 4: Used invite code → 400 ───────────────────────────────

	it("returns 400 when the invite code has already been used", async () => {
		// Register once to consume the invite
		await request(app).post("/api/auth/sign-up/email").send({
			name: "First User",
			email: "first@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		// Try again with the same code
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "Second User",
			email: "second@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/invalid|expired/i)
	})

	// ── Behavior 5: Expired invite code → 400 ────────────────────────────

	it("returns 400 when the invite code is expired", async () => {
		const db = await getTestDb()
		await db.insert(invites).values({
			code: "EXPIRED-INVITE",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() - 1000), // already expired
		})

		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "Expired User",
			email: "expired@slimpals.test",
			password: "Password1!",
			inviteCode: "EXPIRED-INVITE",
		})

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/invalid|expired/i)
	})
})

// ── Behavior 6: Sign in with correct credentials ─────────────────────────

describe("POST /api/auth/sign-in/email", () => {
	it("returns a session cookie with correct credentials", async () => {
		// Register first
		await request(app).post("/api/auth/sign-up/email").send({
			name: "Login User",
			email: "loginuser@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		const res = await request(app).post("/api/auth/sign-in/email").send({
			email: "loginuser@slimpals.test",
			password: "Password1!",
		})

		expect(res.status).toBe(200)
		expect(res.body).toHaveProperty("user")
		const cookies = res.headers["set-cookie"] as string[] | string
		const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies
		expect(cookieStr).toMatch(/better-auth\.session_token/i)
	})

	// ── Behavior 7: Wrong password → 401 ─────────────────────────────────

	it("returns 401 with wrong password", async () => {
		await request(app).post("/api/auth/sign-up/email").send({
			name: "Login User",
			email: "loginuser@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		const res = await request(app).post("/api/auth/sign-in/email").send({
			email: "loginuser@slimpals.test",
			password: "WrongPassword!",
		})

		expect(res.status).toBe(401)
	})
})

// ── Behavior 8: Protected route without session → 401 ────────────────────

describe("Protected routes", () => {
	it("returns 401 when accessing /api/me without a session", async () => {
		const res = await request(app).get("/api/me")
		expect(res.status).toBe(401)
	})

	// ── Behavior 9: Protected route with valid session → passes ──────────

	it("allows access to protected routes with a valid session", async () => {
		// Register + get session cookie
		const signUpRes = await request(app).post("/api/auth/sign-up/email").send({
			name: "Auth User",
			email: "authuser@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		const cookies = signUpRes.headers["set-cookie"] as string[]
		const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies

		const meRes = await request(app).get("/api/me").set("Cookie", cookieHeader)

		// /api/me doesn't exist yet so we get 404, but NOT 401
		expect(meRes.status).not.toBe(401)
	})

	// ── Behavior 10: Logout clears session ───────────────────────────────

	it("clears the session on logout", async () => {
		const signUpRes = await request(app).post("/api/auth/sign-up/email").send({
			name: "Logout User",
			email: "logout@slimpals.test",
			password: "Password1!",
			inviteCode: "VALID-INVITE",
		})

		const cookies = signUpRes.headers["set-cookie"] as string[]
		const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies

		const logoutRes = await request(app)
			.post("/api/auth/sign-out")
			.set("Cookie", cookieHeader)

		expect(logoutRes.status).toBe(200)

		// Session should be invalid now
		const meRes = await request(app).get("/api/me").set("Cookie", cookieHeader)

		expect(meRes.status).toBe(401)
	})
})
