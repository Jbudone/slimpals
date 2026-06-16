import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import {
	badges,
	foodLogs,
	invites,
	reactions,
	socialPosts,
	users,
	weightEntries,
} from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

// Shared test user fixture
const testUser = {
	id: "user-test-001",
	email: "test@example.com",
	name: "Test User",
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
	await resetSchema()
})

afterEach(async () => {
	await truncateAll()
})

afterAll(async () => {
	await closeTestDb()
})

// ── Behavior 1: Migrations apply and create all tables ────────────────────

describe("migrations", () => {
	it("creates all 20 expected app tables", async () => {
		const mysql = await import("mysql2/promise")
		const pool = mysql.default.createPool(
			process.env.TEST_DATABASE_URL ??
				"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals_test",
		)
		const [rows] = await pool.query<mysql.RowDataPacket[]>(
			"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
		)
		await pool.end()

		const tableNames = rows.map((r) => r.TABLE_NAME as string)
		const expected = [
			"account",
			"badges",
			"challenges",
			"daily_checkins",
			"food_logs",
			"invites",
			"pet_companions",
			"pet_items",
			"reactions",
			"session",
			"social_posts",
			"tournament_participants",
			"tournaments",
			"user_badges",
			"user_challenges",
			"user_pet_items",
			"users",
			"verification",
			"weekly_inspirations",
			"weight_entries",
		]

		for (const table of expected) {
			expect(tableNames, `expected table "${table}" to exist`).toContain(table)
		}
	})
})

// ── Behavior 2: Insert and select a user ──────────────────────────────────

describe("users table", () => {
	it("can insert and retrieve a user by id", async () => {
		const db = await getTestDb()
		await db.insert(users).values(testUser)
		const [found] = await db
			.select()
			.from(users)
			.where(eq(users.id, testUser.id))
		expect(found.email).toBe(testUser.email)
		expect(found.name).toBe(testUser.name)
		expect(found.coachPersonality).toBe("friendly") // default
		expect(found.theme).toBe("midnight") // default
	})
})

// ── Behavior 3: Enum constraint on coach_personality ─────────────────────

describe("users.coach_personality enum", () => {
	it("rejects an invalid personality value at the DB level", async () => {
		const db = await getTestDb()
		// biome-ignore lint/suspicious/noExplicitAny: intentionally passing invalid enum to test DB constraint
		const badValues = { ...testUser, coachPersonality: "wizard" as any }
		await expect(
			db.execute(db.insert(users).values(badValues).getSQL()),
		).rejects.toThrow()
	})
})

// ── Behavior 4: Unique constraint on invites.code ────────────────────────

describe("invites.code unique constraint", () => {
	it("rejects a duplicate invite code", async () => {
		const db = await getTestDb()
		await db.insert(users).values(testUser)

		const invite = {
			code: "SAME-CODE",
			createdByUserId: testUser.id,
			expiresAt: new Date(Date.now() + 86400_000),
		}

		await db.insert(invites).values(invite)
		await expect(db.insert(invites).values(invite)).rejects.toThrow()
	})
})

// ── Behavior 5: Foreign key on weight_entries.user_id ────────────────────

describe("weight_entries foreign key", () => {
	it("rejects an entry referencing a non-existent user", async () => {
		const db = await getTestDb()
		await expect(
			db.insert(weightEntries).values({
				userId: "ghost-user-999",
				weightKg: 80,
			}),
		).rejects.toThrow()
	})
})

// ── Behavior 6: JSON round-trip on food_logs.ai_analysis ─────────────────

describe("food_logs JSON column", () => {
	it("round-trips nested JSON in ai_analysis without loss", async () => {
		const db = await getTestDb()
		await db.insert(users).values(testUser)

		const payload = {
			foods: ["pizza", "salad"],
			macros: { calories: 650, protein: 30, carbs: 80, fat: 20 },
			coachMessage: "Good effort mixing greens with that slice!",
			alternatives: ["whole wheat crust", "more veggies"],
		}

		await db.insert(foodLogs).values({
			userId: testUser.id,
			photoUrl: "/uploads/test.jpg",
			aiAnalysis: payload,
		})

		const [row] = await db
			.select()
			.from(foodLogs)
			.where(eq(foodLogs.userId, testUser.id))
		expect(row.aiAnalysis).toEqual(payload)
	})
})

// ── Behavior 7: Unique constraint on badges.key ──────────────────────────

describe("badges.key unique constraint", () => {
	it("rejects a duplicate badge key", async () => {
		const db = await getTestDb()
		const badge = {
			key: "test_unique_key_constraint",
			name: "Test Badge",
			tier: "bronze" as const,
		}
		await db.insert(badges).values(badge)
		await expect(db.insert(badges).values(badge)).rejects.toThrow()
	})
})

// ── Behavior 8: Reaction emoji enum constraint ────────────────────────────

describe("reactions.emoji enum", () => {
	it("rejects an invalid emoji value at the DB level", async () => {
		const db = await getTestDb()
		await db.insert(users).values(testUser)
		await db.insert(socialPosts).values({
			userId: testUser.id,
			type: "milestone",
			content: { text: "Earned a badge!" },
		})

		const [post] = await db.select().from(socialPosts)
		// biome-ignore lint/suspicious/noExplicitAny: intentionally invalid emoji to test DB enum constraint
		const invalidEmoji = "🚀" as any
		const badReaction = {
			postId: post.id,
			userId: testUser.id,
			emoji: invalidEmoji,
		}
		await expect(
			db.execute(db.insert(reactions).values(badReaction).getSQL()),
		).rejects.toThrow()
	})
})
