import { eq } from "drizzle-orm"
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

async function seedAdmin() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
	await db.insert(invites).values({
		code: "INVITE-A",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	await db.insert(invites).values({
		code: "INVITE-B",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email: string,
	name: string,
	inviteCode: string,
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
	await seedAdmin()
})

afterAll(async () => {
	await closeTestDb()
})

// ── Behavior 2: POST creates a code ──────────────────────────────────────────

describe("POST /api/invites — create", () => {
	it("creates a new invite code expiring ~7 days from now", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const res = await request(app).post("/api/invites").set("Cookie", cookie)

		expect(res.status).toBe(201)
		expect(res.body.code).toMatch(/^SLIM-[A-Z0-9]{8}$/)
		expect(res.body.status).toBe("active")
		expect(res.body.usedByName).toBeNull()

		const expiresAt = new Date(res.body.expiresAt).getTime()
		const sevenDays = 7 * 24 * 60 * 60 * 1000
		expect(expiresAt).toBeGreaterThan(Date.now() + sevenDays - 5000)
		expect(expiresAt).toBeLessThan(Date.now() + sevenDays + 5000)
	})
})

// ── Behavior 7: auth enforcement ─────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/invites returns 401 without session", async () => {
		expect((await request(app).get("/api/invites")).status).toBe(401)
	})

	it("POST /api/invites returns 401 without session", async () => {
		expect((await request(app).post("/api/invites")).status).toBe(401)
	})
})

// ── Behavior 6: multiple codes listed oldest first ───────────────────────────

describe("GET /api/invites — ordering", () => {
	it("lists all codes for the user ordered oldest first", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const r1 = await request(app).post("/api/invites").set("Cookie", cookieA)
		const r2 = await request(app).post("/api/invites").set("Cookie", cookieA)

		const res = await request(app).get("/api/invites").set("Cookie", cookieA)

		expect(res.body).toHaveLength(2)
		expect(res.body[0].code).toBe(r1.body.code)
		expect(res.body[1].code).toBe(r2.body.code)
	})
})

// ── Behavior 5: expired status ───────────────────────────────────────────────

describe("GET /api/invites — expired status", () => {
	it("returns status=expired for codes whose expiresAt is in the past", async () => {
		const db = await getTestDb()
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		// Find Alice in DB so we can insert an expired invite directly
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		await db.insert(invites).values({
			code: "SLIM-EXPIRED",
			createdByUserId: alice.id,
			expiresAt: new Date(Date.now() - 1000), // already expired
		})

		const res = await request(app).get("/api/invites").set("Cookie", cookieA)

		const expired = res.body.find(
			(i: { code: string }) => i.code === "SLIM-EXPIRED",
		)
		expect(expired.status).toBe("expired")
	})
})

// ── Behavior 4: used status + usedByName ─────────────────────────────────────

describe("GET /api/invites — used status", () => {
	it("returns status=used and usedByName when the code has been claimed", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		// Alice generates a code
		const createRes = await request(app)
			.post("/api/invites")
			.set("Cookie", cookieA)
		const code = createRes.body.code as string

		// Register Bob with Alice's code — marks it used
		await request(app).post("/api/auth/sign-up/email").send({
			name: "Bob",
			email: "b@sp.test",
			password: "Password1!",
			inviteCode: code,
		})

		const res = await request(app).get("/api/invites").set("Cookie", cookieA)

		const usedInvite = res.body.find((i: { code: string }) => i.code === code)
		expect(usedInvite.status).toBe("used")
		expect(usedInvite.usedByName).toBe("Bob")
	})
})

// ── Behavior 3: scoped to current user ───────────────────────────────────────

describe("GET /api/invites — user scoping", () => {
	it("returns only codes created by the calling user", async () => {
		// Alice generates one code; Bob generates another
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")

		await request(app).post("/api/invites").set("Cookie", cookieA)
		await request(app).post("/api/invites").set("Cookie", cookieB)

		const resA = await request(app).get("/api/invites").set("Cookie", cookieA)
		const resB = await request(app).get("/api/invites").set("Cookie", cookieB)

		expect(resA.body).toHaveLength(1)
		expect(resB.body).toHaveLength(1)
	})
})

// ── Behavior 1 (tracer): empty list ──────────────────────────────────────────

describe("GET /api/invites — empty", () => {
	it("returns [] when user has created no codes", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const res = await request(app).get("/api/invites").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})
})
