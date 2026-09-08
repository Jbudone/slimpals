import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, socialPosts, users } from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const EMOJIS = ["❤️", "😂", "💪", "🔥", "😭"] as const

// ── Setup ─────────────────────────────────────────────────────────────────────

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

// ── Behavior 1 (tracer): empty feed ──────────────────────────────────────────

describe("GET /api/social/feed — empty", () => {
	it("returns [] when no posts exist", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const res = await request(app).get("/api/social/feed").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})
})

// ── Behavior 2: posts from all users, newest first ────────────────────────────

describe("GET /api/social/feed — ordering and multi-user", () => {
	it("returns posts from all users ordered newest first", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const _cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")

		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "a@sp.test"))
		const [bob] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "b@sp.test"))

		const older = new Date(Date.now() - 60_000)
		const newer = new Date()

		await seedPost(alice.id, "weight_update", { weightKg: 82 }, older)
		await seedPost(bob.id, "milestone", { text: "Lost 5kg!" }, newer)

		const res = await request(app)
			.get("/api/social/feed")
			.set("Cookie", cookieA)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(2)
		expect(res.body[0].userName).toBe("Bob")
		expect(res.body[1].userName).toBe("Alice")
	})
})

// ── Behavior 3: reaction shape on each post ───────────────────────────────────

describe("GET /api/social/feed — reaction shape", () => {
	it("each post includes all 5 emoji slots with count 0 and userReacted false", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "a@sp.test"))

		await seedPost(alice.id, "weight_update", { weightKg: 80 })

		const res = await request(app).get("/api/social/feed").set("Cookie", cookie)

		const post = res.body[0]
		expect(post.reactions).toBeDefined()
		for (const emoji of EMOJIS) {
			expect(post.reactions[emoji]).toMatchObject({
				count: 0,
				userReacted: false,
			})
		}
	})
})

// ── Behavior 4: POST /api/social/react adds reaction ─────────────────────────

describe("POST /api/social/react — add reaction", () => {
	it("adds a reaction and returns updated counts for that post", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "a@sp.test"))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", cookie)
			.send({ postId, emoji: "❤️" })

		expect(res.status).toBe(200)
		expect(res.body.reactions["❤️"]).toMatchObject({
			count: 1,
			userReacted: true,
		})
		expect(res.body.reactions["💪"]).toMatchObject({
			count: 0,
			userReacted: false,
		})
	})
})

// ── Behavior 5: toggle off ────────────────────────────────────────────────────

describe("POST /api/social/react — toggle off", () => {
	it("reacting again with same emoji removes it", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "a@sp.test"))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		await request(app)
			.post("/api/social/react")
			.set("Cookie", cookie)
			.send({ postId, emoji: "💪" })

		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", cookie)
			.send({ postId, emoji: "💪" })

		expect(res.status).toBe(200)
		expect(res.body.reactions["💪"]).toMatchObject({
			count: 0,
			userReacted: false,
		})
	})
})

// ── Behavior 6: multi-user reaction counts + userReacted scoping ───────────────

describe("POST /api/social/react — multi-user counts", () => {
	it("counts reactions from all users but userReacted is per-caller", async () => {
		const cookieA = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const cookieB = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "a@sp.test"))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		await request(app)
			.post("/api/social/react")
			.set("Cookie", cookieA)
			.send({ postId, emoji: "🔥" })
		await request(app)
			.post("/api/social/react")
			.set("Cookie", cookieB)
			.send({ postId, emoji: "🔥" })

		// Alice: reacted → userReacted true, count 2
		const resA = await request(app)
			.get("/api/social/feed")
			.set("Cookie", cookieA)
		expect(resA.body[0].reactions["🔥"]).toMatchObject({
			count: 2,
			userReacted: true,
		})

		// Bob: also reacted → userReacted true, count still 2
		const resB = await request(app)
			.get("/api/social/feed")
			.set("Cookie", cookieB)
		expect(resB.body[0].reactions["🔥"]).toMatchObject({
			count: 2,
			userReacted: true,
		})
	})
})

// ── Behavior 7: error cases ───────────────────────────────────────────────────

describe("POST /api/social/react — error cases", () => {
	it("returns 404 for a non-existent post", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", cookie)
			.send({ postId: 99999, emoji: "❤️" })
		expect(res.status).toBe(404)
	})

	it("returns 400 for an invalid emoji", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where((await import("drizzle-orm")).eq(users.email, "a@sp.test"))
		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", cookie)
			.send({ postId, emoji: "👍" })
		expect(res.status).toBe(400)
	})
})

// ── Behavior 8: auth enforcement ──────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/social/feed returns 401 without session", async () => {
		expect((await request(app).get("/api/social/feed")).status).toBe(401)
	})

	it("POST /api/social/react returns 401 without session", async () => {
		expect(
			(
				await request(app)
					.post("/api/social/react")
					.send({ postId: 1, emoji: "❤️" })
			).status,
		).toBe(401)
	})
})

// ── Behavior 9: badge-triggered auto-share on reaction ────────────────────────

describe("POST /api/social/react — badge-triggered auto-share", () => {
	it("auto-shares the reactor's first-reaction-given badge as a milestone post", async () => {
		await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const reactorCookie = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))
		const [bob] = await db
			.select()
			.from(users)
			.where(eq(users.email, "b@sp.test"))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", reactorCookie)
			.send({ postId, emoji: "❤️" })

		expect(res.status).toBe(200)
		expect(res.body.newBadges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "social_first_react" }),
			]),
		)

		const bobPosts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, bob.id))
		const milestonePosts = bobPosts.filter((p) => p.type === "milestone")
		expect(milestonePosts).toHaveLength(1)
		expect(milestonePosts[0].content).toMatchObject({
			badgeKey: "social_first_react",
		})
	})

	it("auto-shares the post owner's first-reaction-received badge separately from the reactor's response", async () => {
		await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const reactorCookie = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", reactorCookie)
			.send({ postId, emoji: "🔥" })

		expect(res.status).toBe(200)
		// The post owner's badge isn't part of the reactor's own response...
		expect(res.body.newBadges).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "social_first_reaction_received" }),
			]),
		)

		// ...but it should still have been earned and auto-shared for Alice.
		const alicePosts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, alice.id))
		const milestonePosts = alicePosts.filter((p) => p.type === "milestone")
		expect(milestonePosts).toHaveLength(1)
		expect(milestonePosts[0].content).toMatchObject({
			badgeKey: "social_first_reaction_received",
		})
	})

	it("does not auto-share when the reacting user has autoShareBadges disabled", async () => {
		await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const reactorCookie = await registerAndLogin("b@sp.test", "Bob", "INVITE-B")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))
		const [bob] = await db
			.select()
			.from(users)
			.where(eq(users.email, "b@sp.test"))
		await db
			.update(users)
			.set({ autoShareBadges: false })
			.where(eq(users.id, bob.id))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		const res = await request(app)
			.post("/api/social/react")
			.set("Cookie", reactorCookie)
			.send({ postId, emoji: "❤️" })

		expect(res.status).toBe(200)
		expect(res.body.newBadges.length).toBeGreaterThan(0)

		const bobPosts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, bob.id))
		expect(bobPosts.filter((p) => p.type === "milestone")).toHaveLength(0)
	})

	it("does not auto-share for a self-reaction on the reactor's own post twice", async () => {
		const cookie = await registerAndLogin("a@sp.test", "Alice", "INVITE-A")
		const db = await getTestDb()
		const [alice] = await db
			.select()
			.from(users)
			.where(eq(users.email, "a@sp.test"))

		const postId = await seedPost(alice.id, "weight_update", { weightKg: 80 })

		await request(app)
			.post("/api/social/react")
			.set("Cookie", cookie)
			.send({ postId, emoji: "❤️" })

		const alicePosts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, alice.id))
		const milestonePosts = alicePosts.filter((p) => p.type === "milestone")
		// Reacting on your own post only earns the reactor badge once (the
		// "reaction received" branch is skipped when postOwnerId === userId).
		expect(milestonePosts).toHaveLength(1)
		expect(milestonePosts[0].content).toMatchObject({
			badgeKey: "social_first_react",
		})
	})
})
