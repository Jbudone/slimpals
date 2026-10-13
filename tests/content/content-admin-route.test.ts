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

let n = 0
async function login(email: string, admin: boolean) {
	const db = await getTestDb()
	const code = `CONTENT-ADMIN-${++n}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name: "T",
		email,
		password: "Password1!",
		inviteCode: code,
	})
	const id = res.body.user.id as string
	if (admin)
		await db.update(users).set({ isAdmin: true }).where(eq(users.id, id))
	const c = res.headers["set-cookie"] as string[]
	return Array.isArray(c) ? c.join("; ") : c
}

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "admin@slimpals.test", name: "Admin" })
})
afterAll(async () => {
	await closeTestDb()
})

describe("content admin API", () => {
	it("is for admins only", async () => {
		const cookie = await login("player@slimpals.test", false)
		const res = await request(app)
			.get("/api/admin/content/overview")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
		expect((await request(app).get("/api/admin/content/overview")).status).toBe(
			401,
		)
	})

	it("shows the budget, today's spend and which keys are set", async () => {
		const cookie = await login("boss@slimpals.test", true)
		const res = await request(app)
			.get("/api/admin/content/overview")
			.set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body.budget.steps).toEqual([
			{ fromDay: 0, usd: 5 },
			{ fromDay: 7, usd: 1 },
		])
		expect(res.body.capToday).toBe(5)
		expect(res.body.spentToday).toBe(0)
		expect(res.body.report.cadence).toBe("daily")
		expect(typeof res.body.keys.openrouter).toBe("boolean")
	})

	it("changes the budget and the report, and rejects nonsense", async () => {
		const cookie = await login("boss2@slimpals.test", true)
		const o = await request(app)
			.get("/api/admin/content/overview")
			.set("Cookie", cookie)
		const ok = await request(app)
			.put("/api/admin/content/budget")
			.set("Cookie", cookie)
			.send({ ...o.body.budget, steps: [{ fromDay: 0, usd: 2 }] })
		expect(ok.status).toBe(200)
		expect(
			(
				await request(app)
					.get("/api/admin/content/overview")
					.set("Cookie", cookie)
			).body.capToday,
		).toBe(2)
		const bad = await request(app)
			.put("/api/admin/content/budget")
			.set("Cookie", cookie)
			.send({ steps: [] })
		expect(bad.status).toBe(400)
		const rep = await request(app)
			.put("/api/admin/content/report")
			.set("Cookie", cookie)
			.send({ cadence: "weekly", hourUtc: 9 })
		expect(rep.status).toBe(200)
		expect(rep.body.cadence).toBe("weekly")
		expect(
			(
				await request(app)
					.put("/api/admin/content/report")
					.set("Cookie", cookie)
					.send({ hourUtc: 40 })
			).status,
		).toBe(400)
	})

	it("validates a test call before making it", async () => {
		const cookie = await login("boss3@slimpals.test", true)
		const res = await request(app)
			.post("/api/admin/content/test-call")
			.set("Cookie", cookie)
			.send({ provider: "carrier-pigeon" })
		expect(res.status).toBe(400)
	})
})
