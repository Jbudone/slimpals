/**
 * Seed a local dev database with a ready-to-use test account.
 * Run with:  npm run seed
 * Requires:  server running on localhost:3000 (npm run dev)
 *
 * Creates:
 *   Email:    dev@slimpals.test
 *   Password: DevPass1!
 *   + a handful of social posts so the feed has content
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import * as schema from "../server/db/schema.js"

const DB_URL =
	process.env.DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals"

const SERVER = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

const TEST_EMAIL = "dev@slimpals.test"
const TEST_PASSWORD = "DevPass1!"
const TEST_NAME = "Dev User"
const ADMIN_ID = "admin-seed-001"
const INVITE_CODE = "DEV-INVITE"

// ── DB connection ─────────────────────────────────────────────────────────────

const pool = mysql.createPool(DB_URL)
const db = drizzle(pool, { schema, mode: "default" })

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertAdmin() {
	const [existing] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.id, ADMIN_ID))

	if (existing) {
		console.log("  admin user already exists")
		return
	}

	await db.insert(schema.users).values({
		id: ADMIN_ID,
		email: "admin@slimpals.test",
		name: "Admin",
	})
	console.log("  ✓ admin user created")
}

async function upsertInvite() {
	const [existing] = await db
		.select()
		.from(schema.invites)
		.where(eq(schema.invites.code, INVITE_CODE))

	if (existing?.usedByUserId) {
		console.log("  invite already used — inserting a fresh one")
		const fresh = `${INVITE_CODE}-${Date.now()}`
		await db.insert(schema.invites).values({
			code: fresh,
			createdByUserId: ADMIN_ID,
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
		})
		return fresh
	}

	if (!existing) {
		await db.insert(schema.invites).values({
			code: INVITE_CODE,
			createdByUserId: ADMIN_ID,
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
		})
		console.log(`  ✓ invite code created: ${INVITE_CODE}`)
	} else {
		console.log(`  invite code already exists: ${INVITE_CODE}`)
	}

	return INVITE_CODE
}

async function registerTestUser(inviteCode: string): Promise<string | null> {
	// Check if already registered
	const [existing] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, TEST_EMAIL))

	if (existing) {
		console.log(`  test account already exists (${TEST_EMAIL})`)
		return existing.id
	}

	const res = await fetch(`${SERVER}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: SERVER },
		body: JSON.stringify({
			name: TEST_NAME,
			email: TEST_EMAIL,
			password: TEST_PASSWORD,
			inviteCode,
		}),
	})

	if (!res.ok) {
		const body = await res.json().catch(() => ({}))
		console.error("  ✗ registration failed:", JSON.stringify(body))
		return null
	}

	const [user] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, TEST_EMAIL))

	console.log(`  ✓ test account created (id: ${user.id})`)
	return user.id
}

async function seedSocialPosts(userId: string) {
	const existing = await db
		.select({ id: schema.socialPosts.id })
		.from(schema.socialPosts)
		.where(eq(schema.socialPosts.userId, userId))

	if (existing.length > 0) {
		console.log(`  social posts already seeded (${existing.length} post(s))`)
		return
	}

	const now = Date.now()
	await db.insert(schema.socialPosts).values([
		{
			userId,
			type: "weight_update",
			content: { weightKg: 84.5, note: "Morning weigh-in" },
			createdAt: new Date(now - 3 * 3_600_000),
		},
		{
			userId,
			type: "milestone",
			content: { text: "Lost 5kg since joining! 🎉" },
			createdAt: new Date(now - 2 * 3_600_000),
		},
		{
			userId,
			type: "food_photo",
			content: {
				foodName: "Caesar Salad",
				macros: { calories: 350, protein: 12, carbs: 20, fat: 24 },
				mealType: "lunch",
			},
			createdAt: new Date(now - 1 * 3_600_000),
		},
		{
			userId,
			type: "ai_message",
			content: {
				message: "You're on a roll! Three days in a row — keep it up!",
			},
			createdAt: new Date(now),
		},
	])
	console.log("  ✓ social posts seeded (4 posts)")
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("\n🌱 Seeding dev database…\n")

try {
	console.log("→ Admin user")
	await upsertAdmin()

	console.log("→ Invite code")
	const inviteCode = await upsertInvite()

	console.log("→ Test account")
	const userId = await registerTestUser(inviteCode)

	if (userId) {
		console.log("→ Social posts")
		await seedSocialPosts(userId)
	}

	console.log(`
✅ Done!

  URL:      http://localhost:5173
  Email:    ${TEST_EMAIL}
  Password: ${TEST_PASSWORD}
`)
} catch (err) {
	console.error("Seed failed:", err)
	process.exit(1)
} finally {
	await pool.end()
}
