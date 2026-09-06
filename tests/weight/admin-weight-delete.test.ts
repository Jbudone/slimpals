import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users, weightEntries } from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
}

async function createInvite(code: string) {
	const db = await getTestDb()
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

let inviteCounter = 0

async function registerAndLogin(email: string, name: string) {
	const inviteCode = `ADMIN-WEIGHT-DELETE-INVITE-${++inviteCounter}`
	await createInvite(inviteCode)
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	const userId = res.body.user.id as string
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId,
	}
}

async function makeAdmin(userId: string) {
	const db = await getTestDb()
	await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId))
}

async function adminAndMember() {
	const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
		"a@slimpals.test",
		"Admin Two",
	)
	await makeAdmin(adminId)
	const { cookie: memberCookie, userId: memberId } = await registerAndLogin(
		"b@slimpals.test",
		"Member Two",
	)
	return { adminCookie, memberCookie, memberId }
}

async function seedEntry(userId: string, weightKgTenths: number) {
	const db = await getTestDb()
	const [row] = await db
		.insert(weightEntries)
		.values({ userId, weightKg: weightKgTenths, recordedAt: new Date() })
		.$returningId()
	return row.id
}

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

describe("DELETE /api/admin/weight/:id", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).delete("/api/admin/weight/1")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.delete("/api/admin/weight/1")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown entry", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.delete("/api/admin/weight/999999")
			.set("Cookie", adminCookie)
		expect(res.status).toBe(404)
	})

	it("deletes the entry", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const entryId = await seedEntry(memberId, 800)

		const res = await request(app)
			.delete(`/api/admin/weight/${entryId}`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(weightEntries)
			.where(eq(weightEntries.id, entryId))
		expect(rows).toHaveLength(0)
	})

	it("does not affect another entry", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const keepId = await seedEntry(memberId, 800)
		const deleteId = await seedEntry(memberId, 900)

		await request(app)
			.delete(`/api/admin/weight/${deleteId}`)
			.set("Cookie", adminCookie)

		const db = await getTestDb()
		const remaining = await db
			.select()
			.from(weightEntries)
			.where(eq(weightEntries.id, keepId))
		expect(remaining).toHaveLength(1)
	})
})
