import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, socialPosts, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) =>
		`Congrats ${userName}, you crushed it!`,
	generateWeeklyInspiration: async () => "Keep pushing this week!",
	generateNpcDialogs: async () => [],
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

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
	const inviteCode = `ADMIN-SOCIAL-INJECT-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/social/posts", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app)
			.post("/api/admin/social/posts")
			.send({
				userId: "x",
				type: "milestone",
				content: { text: "hi" },
			})
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", cookie)
			.send({ userId: "x", type: "milestone", content: { text: "hi" } })
		expect(res.status).toBe(403)
	})

	it("returns 400 when userId is missing", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({ type: "milestone", content: { text: "hi" } })
		expect(res.status).toBe(400)
	})

	it("returns 400 when type is missing", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({ userId: memberId, content: { text: "hi" } })
		expect(res.status).toBe(400)
	})

	it("returns 400 for an invalid type", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({ userId: memberId, type: "not_a_type", content: { text: "hi" } })
		expect(res.status).toBe(400)
	})

	it("returns 400 when content is missing", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({ userId: memberId, type: "milestone" })
		expect(res.status).toBe(400)
	})

	it("returns 400 when content is not a plain object", async () => {
		const { adminCookie, memberId } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({ userId: memberId, type: "milestone", content: "not an object" })
		expect(res.status).toBe(400)
	})

	it("returns 404 for an unknown userId", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({
				userId: "does-not-exist",
				type: "milestone",
				content: { text: "hi" },
			})
		expect(res.status).toBe(404)
	})

	it("injects a post that shows up in the admin list and the real feed", async () => {
		const { adminCookie, memberCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({
				userId: memberId,
				type: "milestone",
				content: { badgeName: "Test Badge", badgeTier: "gold" },
			})

		expect(res.status).toBe(201)
		expect(res.body.userId).toBe(memberId)
		expect(res.body.userName).toBe("Member Two")
		expect(res.body.type).toBe("milestone")
		expect(res.body.content.badgeName).toBe("Test Badge")

		const db = await getTestDb()
		const rows = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, memberId))
		expect(rows).toHaveLength(1)

		const adminListRes = await request(app)
			.get("/api/admin/social/posts")
			.set("Cookie", adminCookie)
		expect(adminListRes.body.map((p: { id: number }) => p.id)).toContain(
			res.body.id,
		)

		const feedRes = await request(app)
			.get("/api/social/feed")
			.set("Cookie", memberCookie)
		expect(feedRes.body.map((p: { id: number }) => p.id)).toContain(res.body.id)
	})

	it.each([
		["food_photo", { foodName: "Pizza" }],
		["ai_message", { message: "Nice work!" }],
		["weight_update", { text: "Lost 2kg!" }],
		["challenge_completion", { challengeName: "October Challenge" }],
	])("supports injecting a %s post", async (type, content) => {
		const { adminCookie, memberId } = await adminAndMember()

		const res = await request(app)
			.post("/api/admin/social/posts")
			.set("Cookie", adminCookie)
			.send({ userId: memberId, type, content })

		expect(res.status).toBe(201)
		expect(res.body.type).toBe(type)
	})
})
