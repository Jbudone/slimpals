import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	reactions,
	socialPosts,
	users,
} from "../../server/db/schema.js"
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
	const inviteCode = `ADMIN-SOCIAL-VIEW-INVITE-${++inviteCounter}`
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

async function seedPost(
	userId: string,
	type: (typeof socialPosts.$inferInsert)["type"],
	content: object,
	createdAt?: Date,
) {
	const db = await getTestDb()
	const [row] = await db
		.insert(socialPosts)
		.values({ userId, type, content, createdAt: createdAt ?? new Date() })
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

describe("GET /api/admin/social/posts", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/admin/social/posts")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.get("/api/admin/social/posts")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns an empty list when there are no posts", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.get("/api/admin/social/posts")
			.set("Cookie", adminCookie)
		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})

	it("lists posts with author, type, content, and reaction count", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const postId = await seedPost(memberId, "milestone", {
			badgeName: "First Steps",
			badgeTier: "bronze",
		})
		const db = await getTestDb()
		await db.insert(reactions).values({ postId, userId: memberId, emoji: "🔥" })

		const res = await request(app)
			.get("/api/admin/social/posts")
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(1)
		expect(res.body[0].id).toBe(postId)
		expect(res.body[0].type).toBe("milestone")
		expect(res.body[0].content.badgeName).toBe("First Steps")
		expect(res.body[0].userName).toBe("Member Two")
		expect(res.body[0].reactionCount).toBe(1)
	})

	it("orders posts most-recent-first", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const older = new Date(Date.now() - 60_000)
		const newer = new Date()

		const firstId = await seedPost(
			memberId,
			"ai_message",
			{ message: "first" },
			older,
		)
		const secondId = await seedPost(
			memberId,
			"ai_message",
			{ message: "second" },
			newer,
		)

		const res = await request(app)
			.get("/api/admin/social/posts")
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)
		expect(res.body.map((p: { id: number }) => p.id)).toEqual([
			secondId,
			firstId,
		])
	})
})
