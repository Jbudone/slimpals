import { eq } from "drizzle-orm"
import request from "supertest"
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest"
import { invites, users } from "../../server/db/schema.js"
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
	const inviteCode = `IMPERSONATION-INVITE-${++inviteCounter}`
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

function extractCookies(res: request.Response): string {
	const cookies = res.headers["set-cookie"] as string[] | string
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

afterEach(() => {
	delete process.env.DEV_AUTOLOGIN_EMAIL
})

afterAll(async () => {
	await closeTestDb()
})

describe("dev-autologin vs. a real session", () => {
	it("a real session cookie takes priority over DEV_AUTOLOGIN_EMAIL", async () => {
		const { cookie, userId } = await registerAndLogin(
			"real@slimpals.test",
			"Real User",
		)
		process.env.DEV_AUTOLOGIN_EMAIL = "admin@slimpals.test"

		const res = await request(app).get("/api/users/me").set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body.id).toBe(userId)
		expect(res.body.email).toBe("real@slimpals.test")
	})

	it("falls back to the autologin user when there is no session at all", async () => {
		process.env.DEV_AUTOLOGIN_EMAIL = "admin@slimpals.test"

		const res = await request(app).get("/api/users/me")
		expect(res.status).toBe(200)
		expect(res.body.email).toBe("admin@slimpals.test")
	})
})

describe("impersonation", () => {
	it("switches identity to the impersonated user, even with autologin enabled", async () => {
		const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
			"admin2@slimpals.test",
			"Admin Two",
		)
		await makeAdmin(adminId)
		const { userId: memberId } = await registerAndLogin(
			"member@slimpals.test",
			"Member",
		)
		process.env.DEV_AUTOLOGIN_EMAIL = "admin2@slimpals.test"

		const impersonateRes = await request(app)
			.post(`/api/admin/impersonate/${memberId}`)
			.set("Cookie", adminCookie)
		expect(impersonateRes.status).toBe(200)
		const impersonatedCookie = extractCookies(impersonateRes)

		const meRes = await request(app)
			.get("/api/users/me")
			.set("Cookie", impersonatedCookie)
		expect(meRes.status).toBe(200)
		expect(meRes.body.id).toBe(memberId)
		expect(meRes.body.impersonatedBy).toMatchObject({
			id: adminId,
			name: "Admin Two",
		})
	})

	it("stop-impersonating restores the original admin session", async () => {
		const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
			"admin3@slimpals.test",
			"Admin Three",
		)
		await makeAdmin(adminId)
		const { userId: memberId } = await registerAndLogin(
			"member2@slimpals.test",
			"Member Two",
		)

		const impersonateRes = await request(app)
			.post(`/api/admin/impersonate/${memberId}`)
			.set("Cookie", adminCookie)
		const impersonatedCookie = extractCookies(impersonateRes)

		const stopRes = await request(app)
			.post("/api/admin/stop-impersonating")
			.set("Cookie", impersonatedCookie)
		expect(stopRes.status).toBe(200)
		const restoredCookie = extractCookies(stopRes)

		const meRes = await request(app)
			.get("/api/users/me")
			.set("Cookie", restoredCookie)
		expect(meRes.status).toBe(200)
		expect(meRes.body.id).toBe(adminId)
		expect(meRes.body.impersonatedBy).toBeNull()
	})

	it("returns 400 when not currently impersonating", async () => {
		const { cookie } = await registerAndLogin("solo@slimpals.test", "Solo User")
		const res = await request(app)
			.post("/api/admin/stop-impersonating")
			.set("Cookie", cookie)
		expect(res.status).toBe(400)
	})
})
