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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Register a user and return their session cookie. */
async function registerAndLogin(
	email = "user@slimpals.test",
	name = "Test User",
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: "VALID-INVITE",
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

// ── Behavior 1: GET /api/users/me returns profile with theme ─────────────────

describe("GET /api/users/me", () => {
	it("returns user profile including theme for authenticated user", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			email: "user@slimpals.test",
			name: "Test User",
			theme: expect.any(String),
		})
	})

	it("returns midnight as the default theme for new users", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.theme).toBe("midnight")
	})
})

// ── Behavior 4+5: Auth enforcement ───────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/users/me returns 401 without a session", async () => {
		const res = await request(app).get("/api/users/me")
		expect(res.status).toBe(401)
	})

	it("PATCH /api/users/me returns 401 without a session", async () => {
		const res = await request(app)
			.patch("/api/users/me")
			.send({ theme: "ocean" })
		expect(res.status).toBe(401)
	})
})

// ── Behavior 3: PATCH /api/users/me persists theme ───────────────────────────

describe("PATCH /api/users/me", () => {
	it("returns 400 for an unrecognised theme value", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ theme: "vaporwave" })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/invalid theme/i)
	})

	it("updates theme and returns the updated profile", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ theme: "forest" })

		expect(res.status).toBe(200)
		expect(res.body.theme).toBe("forest")

		// Verify it persisted — GET should now return the new theme
		const getRes = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(getRes.body.theme).toBe("forest")
	})

	it("returns 'simple' as default viewMode for new users", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.viewMode).toBe("simple")
	})

	it("updates viewMode to technical and persists it", async () => {
		const cookie = await registerAndLogin()

		const patch = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ viewMode: "technical" })

		expect(patch.status).toBe(200)
		expect(patch.body.viewMode).toBe("technical")

		const get = await request(app).get("/api/users/me").set("Cookie", cookie)
		expect(get.body.viewMode).toBe("technical")
	})

	it("returns 400 for an invalid viewMode value", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ viewMode: "advanced" })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/invalid viewMode/i)
	})

	it("returns null as default heightCm for new users", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.heightCm).toBeNull()
	})

	it("updates heightCm with a valid value and persists it", async () => {
		const cookie = await registerAndLogin()

		const patch = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ heightCm: 175 })

		expect(patch.status).toBe(200)
		expect(patch.body.heightCm).toBe(175)

		const get = await request(app).get("/api/users/me").set("Cookie", cookie)
		expect(get.body.heightCm).toBe(175)
	})

	it("clears heightCm when set to null", async () => {
		const cookie = await registerAndLogin()

		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ heightCm: 175 })

		const patch = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ heightCm: null })

		expect(patch.status).toBe(200)
		expect(patch.body.heightCm).toBeNull()
	})

	it("returns 400 for a negative heightCm", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ heightCm: -10 })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/heightCm/i)
	})
})
