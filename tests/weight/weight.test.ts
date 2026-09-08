import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	socialPosts,
	userGyms,
	users,
} from "../../server/db/schema.js"
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
		code: "VALID-INVITE",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email = "user@slimpals.test",
	name = "Test User",
	inviteCode = "VALID-INVITE",
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

async function getUserId(cookie: string) {
	const res = await request(app).get("/api/users/me").set("Cookie", cookie)
	return res.body.id as string
}

async function getGymXp(userId: string): Promise<number | null> {
	const db = await getTestDb()
	const [gym] = await db
		.select({ xp: userGyms.xp })
		.from(userGyms)
		.where(eq(userGyms.userId, userId))
	return gym?.xp ?? null
}

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

// ── Behavior 1+2: GET /api/weight returns entries ordered by date ─────────────

describe("GET /api/weight", () => {
	it("returns entries for the current user ordered by recordedAt", async () => {
		const cookie = await registerAndLogin()

		// Post two entries out of chronological order
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 85.0, recordedAt: "2026-01-10T08:00:00Z" })
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 83.2, recordedAt: "2026-01-05T08:00:00Z" })

		const res = await request(app).get("/api/weight").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(2)
		// Earlier date must come first
		expect(res.body[0].weightKg).toBe(83.2)
		expect(res.body[1].weightKg).toBe(85.0)
	})

	it("returns an empty array when the user has no entries", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app).get("/api/weight").set("Cookie", cookie)

		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})
})

// ── Behavior 5: auth enforcement ─────────────────────────────────────────────

describe("Auth enforcement", () => {
	it("GET /api/weight returns 401 without a session", async () => {
		const res = await request(app).get("/api/weight")
		expect(res.status).toBe(401)
	})

	it("POST /api/weight returns 401 without a session", async () => {
		const res = await request(app).post("/api/weight").send({ weightKg: 80 })
		expect(res.status).toBe(401)
	})
})

// ── Behavior 3: entries are scoped to the requesting user ────────────────────

describe("GET /api/weight user isolation", () => {
	it("does not return another user's entries", async () => {
		// Seed a second invite so user B can register
		const db = await getTestDb()
		await db.insert(invites).values({
			code: "INVITE-B",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})

		const cookieA = await registerAndLogin(
			"usera@slimpals.test",
			"User A",
			"VALID-INVITE",
		)
		const cookieB = await registerAndLogin(
			"userb@slimpals.test",
			"User B",
			"INVITE-B",
		)

		// User A logs a weight
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookieA)
			.send({ weightKg: 90.0 })

		// User B should see an empty list
		const res = await request(app).get("/api/weight").set("Cookie", cookieB)

		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(0)
	})
})

// ── Behavior 1: POST /api/weight creates an entry ────────────────────────────

describe("POST /api/weight", () => {
	it("returns 400 when weightKg is missing", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ note: "forgot the weight" })

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/weightKg/i)
	})

	it("returns 400 when weightKg is zero or negative", async () => {
		const cookie = await registerAndLogin()

		const zero = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 0 })
		expect(zero.status).toBe(400)

		const neg = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: -5 })
		expect(neg.status).toBe(400)
	})

	it("creates a weight entry and returns it", async () => {
		const cookie = await registerAndLogin()

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 82.5 })

		expect(res.status).toBe(201)
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			weightKg: 82.5,
			source: "manual",
		})
	})
})

// ── Behavior: stored-value rounding (tenths-of-kg fixed point) ────────────────

describe("POST /api/weight — decimal rounding", () => {
	it("rounds to the nearest tenth of a kg on the way in and back out", async () => {
		const cookie = await registerAndLogin()

		const roundsDown = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 82.53 })
		expect(roundsDown.body.weightKg).toBe(82.5)

		const roundsUp = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 82.57 })
		expect(roundsUp.body.weightKg).toBe(82.6)
	})
})

// ── Behavior: weight-loss badge thresholds (goal-progress math) ───────────────

describe("POST /api/weight — weight-loss badges", () => {
	it("awards every loss badge threshold crossed in one drop, not just the highest", async () => {
		const cookie = await registerAndLogin()
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		// 6kg drop from the first entry crosses both the 2kg and 5kg
		// thresholds but not 10kg.
		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 84 })

		const badgeKeys = res.body.newBadges.map((b: { key: string }) => b.key)
		expect(badgeKeys).toEqual(expect.arrayContaining(["loss_2kg", "loss_5kg"]))
		expect(badgeKeys).not.toContain("loss_10kg")
	})

	it("does not award a loss badge when weight goes up", async () => {
		const cookie = await registerAndLogin()
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 80 })

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 82 })

		const badgeKeys = res.body.newBadges.map((b: { key: string }) => b.key)
		expect(badgeKeys.some((k: string) => k.startsWith("loss_"))).toBe(false)
	})

	it("awards loss_goal only once the logged weight reaches the user's goal", async () => {
		const cookie = await registerAndLogin()
		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ goalWeightKg: 85 })
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		const aboveGoal = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 87 })
		expect(
			aboveGoal.body.newBadges.map((b: { key: string }) => b.key),
		).not.toContain("loss_goal")

		const atGoal = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 85 })
		expect(atGoal.body.newBadges.map((b: { key: string }) => b.key)).toContain(
			"loss_goal",
		)
	})
})

// ── Behavior: gym XP awarded for weight-logging badges ────────────────────────

describe("POST /api/weight — gym XP effects", () => {
	it("awards 10 XP for the first-log badge on the very first entry", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		expect(res.body.newBadges.map((b: { key: string }) => b.key)).toContain(
			"weight_first_log",
		)
		expect(await getGymXp(userId)).toBe(10)
	})

	it("awards 10 XP per non-5kg badge and 50 XP for crossing the 5kg threshold", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })
		// XP after the first entry: 10 (weight_first_log)

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 84 })
		// This drop earns loss_2kg (10 XP) and loss_5kg (50 XP): +60

		expect(await getGymXp(userId)).toBe(70)
	})

	it("awards no additional XP when a log earns no badges", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })
		const xpAfterFirst = await getGymXp(userId)

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 91 })

		expect(await getGymXp(userId)).toBe(xpAfterFirst)
	})
})

// ── Behavior: auto-share-to-feed on weight logging ────────────────────────────

describe("POST /api/weight — auto-share to social feed", () => {
	it("auto-shares an earned badge as a milestone post (autoShareBadges defaults to true)", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)

		const res = await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })
		expect(res.body.newBadges.map((b: { key: string }) => b.key)).toContain(
			"weight_first_log",
		)

		const db = await getTestDb()
		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, userId))
		const milestonePosts = posts.filter((p) => p.type === "milestone")
		expect(milestonePosts).toHaveLength(1)
		expect(milestonePosts[0].content).toMatchObject({
			badgeKey: "weight_first_log",
		})
	})

	it("does not auto-share the badge when autoShareBadges is disabled", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ autoShareBadges: false })

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		const db = await getTestDb()
		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, userId))
		expect(posts.filter((p) => p.type === "milestone")).toHaveLength(0)
	})

	it("posts a weight_update milestone entry when autoShareWeightMilestones is enabled and a loss threshold is crossed", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await request(app)
			.patch("/api/users/me")
			.set("Cookie", cookie)
			.send({ autoShareWeightMilestones: true })
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		// 6kg drop crosses the 5kg milestone
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 84 })

		const db = await getTestDb()
		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, userId))
		const weightUpdatePosts = posts.filter((p) => p.type === "weight_update")
		expect(weightUpdatePosts).toHaveLength(1)
		expect(weightUpdatePosts[0].content).toMatchObject({
			milestoneKg: 5,
			currentWeightKg: 84,
			text: "Lost 5kg!",
		})
	})

	it("does not post a weight_update entry when autoShareWeightMilestones is disabled (the default)", async () => {
		const cookie = await registerAndLogin()
		const userId = await getUserId(cookie)
		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 90 })

		await request(app)
			.post("/api/weight")
			.set("Cookie", cookie)
			.send({ weightKg: 84 })

		const db = await getTestDb()
		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, userId))
		expect(posts.filter((p) => p.type === "weight_update")).toHaveLength(0)
	})
})
