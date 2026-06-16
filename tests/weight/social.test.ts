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

async function registerAndLogin(email: string, name: string, code: string) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: code,
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

// ── Behavior 6: auth enforcement ─────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/weight/social returns 401 without session", async () => {
		expect((await request(app).get("/api/weight/social")).status).toBe(401)
	})
})

// ── Behavior 5: users with no entries are excluded ────────────────────────────

describe("GET /api/weight/social — excludes users without entries", () => {
	it("does not include users who have never logged weight", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		// Bob registers but never logs weight
		await registerAndLogin("b@sp.test", "Bob", "INVITE-B")

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieA)
			.send({ weightKg: 80, recordedAt: new Date().toISOString() })

		const res = await request(app)
			.get("/api/weight/social")
			.set("Cookie", cookieA)

		expect(res.body).toHaveLength(1)
		expect(res.body[0].userName).toBe("Alice")
	})
})

// ── Behavior 4: PATCH /api/users/me saves goal fields ────────────────────────

describe("PATCH /api/users/me — goal fields", () => {
	it("saves goalWeightKg and goalDate; GET returns them", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const goalDate = "2026-12-31"

		const patchRes = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ goalWeightKg: 75, goalDate })

		expect(patchRes.status).toBe(200)
		expect(patchRes.body.goalWeightKg).toBe(75)
		expect(patchRes.body.goalDate).toBeDefined()

		const getRes = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(getRes.body.goalWeightKg).toBe(75)
		expect(getRes.body.goalDate).toBeDefined()
	})
})

// ── Behavior 3: colors are distinct per user ──────────────────────────────────

describe("GET /api/weight/social — colors", () => {
	it("assigns distinct colors to different users", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieA)
			.send({ weightKg: 80, recordedAt: new Date().toISOString() })
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieB)
			.send({ weightKg: 90, recordedAt: new Date().toISOString() })

		const res = await request(app)
			.get("/api/weight/social")
			.set("Cookie", cookieA)

		const colors = res.body.map((u: { color: string }) => u.color)
		// All colors are valid hex strings
		for (const c of colors) {
			expect(c).toMatch(/^#[0-9a-f]{6}$/i)
		}
		// Colors are distinct
		expect(new Set(colors).size).toBe(colors.length)
	})
})

// ── Behavior 2: grouped entries with userName, color, entries[] ───────────────

describe("GET /api/weight/social — grouped shape", () => {
	it("returns one object per user with userName, color, and entries array", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieA)
			.send({ weightKg: 80, recordedAt: new Date().toISOString() })
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieB)
			.send({ weightKg: 90, recordedAt: new Date().toISOString() })

		const res = await request(app)
			.get("/api/weight/social")
			.set("Cookie", cookieA)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(2)

		for (const user of res.body) {
			expect(user).toHaveProperty("userId")
			expect(user).toHaveProperty("userName")
			expect(user).toHaveProperty("color")
			expect(user).toHaveProperty("entries")
			expect(Array.isArray(user.entries)).toBe(true)
		}

		const alice = res.body.find(
			(u: { userName: string }) => u.userName === "Alice",
		)
		expect(alice.entries[0].weightKg).toBe(80)

		const bob = res.body.find((u: { userName: string }) => u.userName === "Bob")
		expect(bob.entries[0].weightKg).toBe(90)
	})
})

// ── Behavior 1 (tracer): empty social feed ────────────────────────────────────

describe("GET /api/weight/social — empty", () => {
	it("returns [] when no weight entries exist", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const res = await request(app)
			.get("/api/weight/social")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})
})
