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

// Everyone's weights used to be readable by any signed-in user. It is gone for
// good (docs/audits/2026-11-10-behaviour-health.md): weight is health data.
describe("no endpoint shows other people's weights", () => {
	it("GET /api/weight/social does not exist, even when signed in", async () => {
		const a = await registerAndLogin("a@test.com", "Ann", "INVITE-A")
		await request(app)
			.post("/api/weight")
			.set("Cookie", a)
			.send({ weightKg: 80, recordedAt: new Date().toISOString() })
		const b = await registerAndLogin("b@test.com", "Bob", "INVITE-B")
		const res = await request(app).get("/api/weight/social").set("Cookie", b)
		expect(res.status).toBe(404)
		expect(JSON.stringify(res.body)).not.toContain("Ann")
	})
})
