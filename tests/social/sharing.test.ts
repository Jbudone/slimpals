import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	badges,
	foodLogs,
	invites,
	socialPosts,
	userBadges,
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
		foodName: "Test Salad",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Nice!",
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
	await db.insert(invites).values({
		code: "INVITE-A",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	await db.insert(invites).values({
		code: "INVITE-B",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email: string,
	name: string,
	inviteCode: string,
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
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

describe("GET /api/users/me — auto-share defaults", () => {
	it("returns auto-share fields with correct defaults", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const res = await request(app).get("/api/users/me").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body.autoShareFoodLogs).toBe(false)
		expect(res.body.autoShareBadges).toBe(true)
		expect(res.body.autoShareWeightMilestones).toBe(false)
	})
})

describe("PATCH /api/users/me — auto-share preferences", () => {
	it("updates autoShareFoodLogs and persists it", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ autoShareFoodLogs: true })

		expect(res.status).toBe(200)
		expect(res.body.autoShareFoodLogs).toBe(true)

		const getRes = await request(app).get("/api/users/me").set("Cookie", cookie)
		expect(getRes.body.autoShareFoodLogs).toBe(true)
	})

	it("updates autoShareBadges to false", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ autoShareBadges: false })

		expect(res.status).toBe(200)
		expect(res.body.autoShareBadges).toBe(false)
	})

	it("updates autoShareWeightMilestones", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const res = await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ autoShareWeightMilestones: true })

		expect(res.status).toBe(200)
		expect(res.body.autoShareWeightMilestones).toBe(true)
	})
})

describe("Auto-share: badges on checkin", () => {
	it("creates a social post when autoShareBadges is true and a badge is earned", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()

		// autoShareBadges defaults to true, so just do a checkin that earns a badge
		// streak_3 badge requires 3 consecutive checkins
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		// Seed prior checkins so next one triggers streak_3
		await db
			.insert((await import("../../server/db/schema.js")).dailyCheckins)
			.values({
				userId: alice.id,
				date: new Date(Date.now() - 2 * 86_400_000),
				streakCount: 1,
			})
		await db
			.insert((await import("../../server/db/schema.js")).dailyCheckins)
			.values({
				userId: alice.id,
				date: new Date(Date.now() - 86_400_000),
				streakCount: 2,
			})

		const res = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({ mood: "good" })

		expect(res.status).toBe(201)
		expect(res.body.newBadges.length).toBeGreaterThan(0)

		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, alice.id))
		const milestonePosts = posts.filter((p) => p.type === "milestone")
		expect(milestonePosts.length).toBeGreaterThan(0)
	})

	it("does NOT create a social post when autoShareBadges is false", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()

		// Turn off badge sharing
		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ autoShareBadges: false })

		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		await db
			.insert((await import("../../server/db/schema.js")).dailyCheckins)
			.values({
				userId: alice.id,
				date: new Date(Date.now() - 2 * 86_400_000),
				streakCount: 1,
			})
		await db
			.insert((await import("../../server/db/schema.js")).dailyCheckins)
			.values({
				userId: alice.id,
				date: new Date(Date.now() - 86_400_000),
				streakCount: 2,
			})

		await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({ mood: "good" })

		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, alice.id))
		expect(posts.length).toBe(0)
	})
})

describe("Auto-shared posts appear in feed", () => {
	it("auto-shared badge posts appear in GET /api/social/feed", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()

		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		// Seed prior checkins for streak badge
		await db
			.insert((await import("../../server/db/schema.js")).dailyCheckins)
			.values({
				userId: alice.id,
				date: new Date(Date.now() - 2 * 86_400_000),
				streakCount: 1,
			})
		await db
			.insert((await import("../../server/db/schema.js")).dailyCheckins)
			.values({
				userId: alice.id,
				date: new Date(Date.now() - 86_400_000),
				streakCount: 2,
			})

		await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({ mood: "good" })

		const feedRes = await request(app)
			.get("/api/social/feed")
			.set("Cookie", cookie)

		expect(feedRes.status).toBe(200)
		expect(feedRes.body.length).toBeGreaterThan(0)
		expect(feedRes.body[0].type).toBe("milestone")
		expect(feedRes.body[0].userName).toBe("Alice")
	})
})

describe("POST /api/social/share — manual sharing", () => {
	it("manually shares a food log to the feed", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()

		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		// Insert a food log directly
		const [inserted] = await db
			.insert(foodLogs)
			.values({
				userId: alice.id,
				photoUrl: "/uploads/test.jpg",
				aiAnalysis: { foodName: "Salad", macros: { calories: 100 } },
				mealType: "lunch",
			})
			.$returningId()

		const res = await request(app)
			.post("/api/social/share")
			.set("Cookie", cookie)
			.send({ source_type: "food_log", source_id: inserted.id })

		expect(res.status).toBe(201)
		expect(res.body.postId).toBeDefined()

		// Verify it appears in the feed
		const feedRes = await request(app)
			.get("/api/social/feed")
			.set("Cookie", cookie)

		expect(feedRes.body.length).toBe(1)
		expect(feedRes.body[0].type).toBe("food_photo")
	})

	it("manually shares a badge to the feed", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()

		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		// Find a badge and insert a userBadge
		const [badge] = await db.select().from(badges).limit(1)
		const [ub] = await db
			.insert(userBadges)
			.values({ userId: alice.id, badgeId: badge.id })
			.$returningId()

		const res = await request(app)
			.post("/api/social/share")
			.set("Cookie", cookie)
			.send({ source_type: "badge", source_id: ub.id })

		expect(res.status).toBe(201)
		expect(res.body.postId).toBeDefined()

		const feedRes = await request(app)
			.get("/api/social/feed")
			.set("Cookie", cookie)

		expect(feedRes.body.length).toBe(1)
		expect(feedRes.body[0].type).toBe("milestone")
	})

	it("returns 404 when sharing another user's food log", async () => {
		const _cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")
		const db = await getTestDb()

		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		const [inserted] = await db
			.insert(foodLogs)
			.values({
				userId: alice.id,
				photoUrl: "/uploads/test.jpg",
				aiAnalysis: { foodName: "Pizza" },
				mealType: "dinner",
			})
			.$returningId()

		// Bob tries to share Alice's food log
		const res = await request(app)
			.post("/api/social/share")
			.set("Cookie", cookieB)
			.send({ source_type: "food_log", source_id: inserted.id })

		expect(res.status).toBe(404)
	})

	it("returns 400 for missing fields", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const res = await request(app)
			.post("/api/social/share")
			.set("Cookie", cookie)
			.send({})

		expect(res.status).toBe(400)
	})

	it("returns 400 for invalid source_type", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")

		const res = await request(app)
			.post("/api/social/share")
			.set("Cookie", cookie)
			.send({ source_type: "weight", source_id: 1 })

		expect(res.status).toBe(400)
	})

	it("returns 401 without auth", async () => {
		const res = await request(app)
			.post("/api/social/share")
			.send({ source_type: "food_log", source_id: 1 })

		expect(res.status).toBe(401)
	})
})
