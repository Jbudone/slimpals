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
	const inviteCode = `ADMIN-SOCIAL-DELETE-INVITE-${++inviteCounter}`
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
) {
	const db = await getTestDb()
	const [row] = await db
		.insert(socialPosts)
		.values({ userId, type, content })
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

describe("DELETE /api/admin/social/posts/:id", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).delete("/api/admin/social/posts/1")
		expect(res.status).toBe(401)
	})

	it("returns 403 for a non-admin caller", async () => {
		const { cookie } = await registerAndLogin("nonadmin@slimpals.test", "X")
		const res = await request(app)
			.delete("/api/admin/social/posts/1")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
	})

	it("returns 404 for an unknown post", async () => {
		const { adminCookie } = await adminAndMember()
		const res = await request(app)
			.delete("/api/admin/social/posts/999999")
			.set("Cookie", adminCookie)
		expect(res.status).toBe(404)
	})

	it("deletes a post and its reactions", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const postId = await seedPost(memberId, "milestone", {
			badgeName: "First Steps",
		})
		const db = await getTestDb()
		await db.insert(reactions).values({ postId, userId: memberId, emoji: "🔥" })

		const res = await request(app)
			.delete(`/api/admin/social/posts/${postId}`)
			.set("Cookie", adminCookie)

		expect(res.status).toBe(200)

		const postRows = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.id, postId))
		expect(postRows).toHaveLength(0)

		const reactionRows = await db
			.select()
			.from(reactions)
			.where(eq(reactions.postId, postId))
		expect(reactionRows).toHaveLength(0)
	})

	it("does not affect another post", async () => {
		const { adminCookie, memberId } = await adminAndMember()

		const keepId = await seedPost(memberId, "milestone", {
			badgeName: "Keep Me",
		})
		const deleteId = await seedPost(memberId, "milestone", {
			badgeName: "Delete Me",
		})

		await request(app)
			.delete(`/api/admin/social/posts/${deleteId}`)
			.set("Cookie", adminCookie)

		const db = await getTestDb()
		const remaining = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.id, keepId))
		expect(remaining).toHaveLength(1)
	})
})
