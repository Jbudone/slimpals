import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, userGyms, users } from "../../server/db/schema.js"
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
	const inviteCode = `ADMIN-GYM-HOUR-INVITE-${++inviteCounter}`
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

describe("GET /api/admin/users/:id/gym/hour-override", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get(
			"/api/admin/users/x/gym/hour-override",
		)
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/users/x/gym/hour-override")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns hasGym: false and hourOverride: null for a user with no gym", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.get(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
		expect(res.status).toBe(200)
		expect(res.body.hasGym).toBe(false)
		expect(res.body.hourOverride).toBeNull()
		expect(typeof res.body.currentHour).toBe("number")
	})
})

describe("PATCH /api/admin/users/:id/gym/hour-override", () => {
	it("rejects an out-of-range hour with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: 24 })
		expect(res.status).toBe(400)
	})

	it("rejects a negative hour with 400", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: -1 })
		expect(res.status).toBe(400)
	})

	it("sets an hour override, creating the gym if it doesn't exist yet", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: 3 })
		expect(res.status).toBe(200)
		expect(res.body.hourOverride).toBe(3)

		const db = await getTestDb()
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, memberId))
		expect(gym.simulatedHourOverride).toBe(3)
	})

	it("clears an override by sending hour: null", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: 3 })

		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: null })
		expect(res.status).toBe(200)
		expect(res.body.hourOverride).toBeNull()

		const getRes = await request(app)
			.get(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
		expect(getRes.body.hourOverride).toBeNull()
	})

	it("accepts hour 0 (midnight) as a valid override", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: 0 })
		expect(res.status).toBe(200)
		expect(res.body.hourOverride).toBe(0)
	})
})

describe("GET /api/gym/sim-state honors the hour override", () => {
	it("reflects the overridden simTime hour for the requesting user", async () => {
		const { adminCookie, memberCookie, memberId } = await adminAndMember()
		await request(app)
			.patch(`/api/admin/users/${memberId}/gym/hour-override`)
			.set("Cookie", adminCookie)
			.send({ hour: 4 })

		const res = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", memberCookie)
		expect(res.status).toBe(200)
		expect(res.body.hourOverride).toBe(4)
		expect(new Date(res.body.simTime).getHours()).toBe(4)
	})
})
