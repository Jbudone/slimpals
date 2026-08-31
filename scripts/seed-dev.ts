/**
 * Seed a local dev database with ready-to-use admin and test accounts.
 * Run with:  npm run seed
 * Requires:  server running on localhost:3000 (npm run dev)
 *
 * Creates:
 *   Admin — Email: admin@slimpals.test  Password: AdminPass1!  (isAdmin: true)
 *   Dev   — Email: dev@slimpals.test    Password: DevPass1!    (regular user)
 *   + a handful of social posts on the dev account so the feed has content
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import * as schema from "../server/db/schema.js"

const DB_URL =
	process.env.DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals"

const SERVER = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

const ADMIN_EMAIL = "admin@slimpals.test"
const ADMIN_PASSWORD = "AdminPass1!"
const ADMIN_NAME = "Admin"
const ADMIN_INVITE_CODE = "ADMIN-INVITE"

const TEST_EMAIL = "dev@slimpals.test"
const TEST_PASSWORD = "DevPass1!"
const TEST_NAME = "Dev User"
const DEV_INVITE_CODE = "DEV-INVITE"

// System account used only as the invite-code creator — never meant to be
// logged into. Kept distinct from the real admin account (below) so there's
// no confusion between "an account named Admin" and "the account flagged
// isAdmin: true".
const SYSTEM_ID = "system-seed-001"
const SYSTEM_EMAIL = "system@slimpals.test"
const SYSTEM_NAME = "System"

// ── DB connection ─────────────────────────────────────────────────────────────

const pool = mysql.createPool(DB_URL)
const db = drizzle(pool, { schema, mode: "default" })

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertSystemUser() {
	const [existing] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.id, SYSTEM_ID))

	if (existing) {
		console.log("  system user already exists")
		return
	}

	await db.insert(schema.users).values({
		id: SYSTEM_ID,
		email: SYSTEM_EMAIL,
		name: SYSTEM_NAME,
	})
	console.log("  ✓ system user created")
}

async function upsertInvite(code: string): Promise<string> {
	const [existing] = await db
		.select()
		.from(schema.invites)
		.where(eq(schema.invites.code, code))

	if (existing?.usedByUserId) {
		console.log("  invite already used — inserting a fresh one")
		const fresh = `${code}-${Date.now()}`
		await db.insert(schema.invites).values({
			code: fresh,
			createdByUserId: SYSTEM_ID,
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
		})
		return fresh
	}

	if (!existing) {
		await db.insert(schema.invites).values({
			code,
			createdByUserId: SYSTEM_ID,
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
		})
		console.log(`  ✓ invite code created: ${code}`)
	} else {
		console.log(`  invite code already exists: ${code}`)
	}

	return code
}

async function registerAdminUser(inviteCode: string): Promise<string | null> {
	const [existing] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, ADMIN_EMAIL))

	if (existing) {
		console.log(`  admin account already exists (${ADMIN_EMAIL})`)
		if (!existing.isAdmin) {
			await db
				.update(schema.users)
				.set({ isAdmin: true })
				.where(eq(schema.users.id, existing.id))
			console.log("  ✓ isAdmin set to true")
		}
		return existing.id
	}

	const res = await fetch(`${SERVER}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: SERVER },
		body: JSON.stringify({
			name: ADMIN_NAME,
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD,
			inviteCode,
		}),
	})

	if (!res.ok) {
		const body = await res.json().catch(() => ({}))
		console.error("  ✗ admin registration failed:", JSON.stringify(body))
		return null
	}

	const [user] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, ADMIN_EMAIL))

	await db
		.update(schema.users)
		.set({ isAdmin: true })
		.where(eq(schema.users.id, user.id))

	console.log(`  ✓ admin account created (id: ${user.id}), isAdmin: true`)
	return user.id
}

async function registerTestUser(inviteCode: string): Promise<string | null> {
	// Check if already registered
	const [existing] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, TEST_EMAIL))

	if (existing) {
		console.log(`  test account already exists (${TEST_EMAIL})`)
		if (existing.isAdmin) {
			// Correct any state left over from before admin/dev were split.
			await db
				.update(schema.users)
				.set({ isAdmin: false })
				.where(eq(schema.users.id, existing.id))
			console.log("  ✓ isAdmin cleared — this is the non-admin test account")
		}
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
	console.log("→ System user")
	await upsertSystemUser()

	console.log("→ Admin invite code")
	const adminInviteCode = await upsertInvite(ADMIN_INVITE_CODE)

	console.log("→ Admin account")
	await registerAdminUser(adminInviteCode)

	console.log("→ Dev invite code")
	const devInviteCode = await upsertInvite(DEV_INVITE_CODE)

	console.log("→ Test account")
	const userId = await registerTestUser(devInviteCode)

	if (userId) {
		console.log("→ Social posts")
		await seedSocialPosts(userId)
	}

	console.log(`
✅ Done!

  URL:      http://localhost:5173

  Admin — Email: ${ADMIN_EMAIL}  Password: ${ADMIN_PASSWORD}
  Dev   — Email: ${TEST_EMAIL}  Password: ${TEST_PASSWORD}
`)
} catch (err) {
	console.error("Seed failed:", err)
	process.exit(1)
} finally {
	await pool.end()
}
