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
	const inviteCode = `ADMIN-FOOD-VIEW-INVITE-${++inviteCounter}`
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

async function seedLog(
	userId: string,
	mealType: (typeof foodLogs.$inferInsert)["mealType"],
	loggedAt: Date,
) {
	const db = await getTestDb()
	const [row] = await db
		.insert(foodLogs)
		.values({
			userId,
			photoUrl: "/uploads/test.jpg",
			mealType,
			loggedAt,
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

describe("GET /api/admin/users/:id/food", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/users/x/food")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/users/x/food")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns an empty list for a user with no entries", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/food`)
			.set("Cookie", adminCookie)
		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})

	it("lists entries most-recent-first", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const older = new Date(Date.now() - 86_400_000)
		const newer = new Date()
		const olderId = await seedLog(memberId, "breakfast", older)
		const newerId = await seedLog(memberId, "dinner", newer)

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/food`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.map((e: { id: number }) => e.id)).toEqual([
			newerId,
			olderId,
		])
		expect(res.body[0].mealType).toBe("dinner")
	})

	it("only returns entries for the requested user", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const { userId: otherUserId } = await registerAndLogin(
			"c@slimpals.test",
			"Other User",
		)
		await seedLog(memberId, "lunch", new Date())
		await seedLog(otherUserId, "snack", new Date())

		const res = await request(app)
			.get(`/api/admin/users/${memberId}/food`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(1)
		expect(res.body[0].mealType).toBe("lunch")
	})
})
