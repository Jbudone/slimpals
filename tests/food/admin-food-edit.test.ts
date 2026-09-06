import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { foodLogs, invites, users } from "../../server/db/schema.js"
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
	const inviteCode = `ADMIN-FOOD-EDIT-INVITE-${++inviteCounter}`
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

async function seedLog(userId: string) {
	const db = await getTestDb()
	const [row] = await db
		.insert(foodLogs)
		.values({
			userId,
			photoUrl: "/uploads/test.jpg",
			mealType: "breakfast",
			loggedAt: new Date(),
		})
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

describe("PATCH /api/admin/food/:id", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).patch("/api/admin/food/1").send({})
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.patch("/api/admin/food/1")
			.set("Cookie", cookie)
			.send({})
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown entry", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.patch("/api/admin/food/999999")
			.set("Cookie", adminCookie)
			.send({ mealType: "lunch" })
		expect(res.status).toBe(404)
	})

	it("returns 400 for an invalid mealType", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const entryId = await seedLog(memberId)
		const res = await request(app)
			.patch(`/api/admin/food/${entryId}`)
			.set("Cookie", adminCookie)
			.send({ mealType: "brunch" })
		expect(res.status).toBe(400)
	})

	it("updates mealType and loggedAt", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const entryId = await seedLog(memberId)
		const newDate = new Date("2026-01-01T00:00:00.000Z")

		const res = await request(app)
			.patch(`/api/admin/food/${entryId}`)
			.set("Cookie", adminCookie)
			.send({ mealType: "dinner", loggedAt: newDate.toISOString() })

		expect(res.status).toBe(200)
		expect(res.body.mealType).toBe("dinner")
		expect(new Date(res.body.loggedAt).toISOString()).toBe(
			newDate.toISOString(),
		)
	})
})
