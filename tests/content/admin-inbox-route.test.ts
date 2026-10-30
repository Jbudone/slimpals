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
	const code = `INBOX-${++n}`
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

describe("admin inbox API", () => {
	it("is for admins only", async () => {
		const cookie = await login("player@slimpals.test", false)
		expect(
			(await request(app).get("/api/admin/inbox").set("Cookie", cookie)).status,
		).toBe(403)
	})
	it("lists the manual checks and counts waiting candidates", async () => {
		const cookie = await login("boss@slimpals.test", true)
		const res = await request(app).get("/api/admin/inbox").set("Cookie", cookie)
		expect(res.status).toBe(200)
		const ids = res.body.tasks.map((t: { id: string }) => t.id)
		expect(ids).toContain("check-pacing")
		expect(ids).not.toContain("review-queue")
	})
})
