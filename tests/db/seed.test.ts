import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { badges, gymUpgradesCatalog } from "../../server/db/schema.js"
import { deriveUnlockedUpgradeKeys } from "../../server/services/gym/index.js"
import { GYM_UPGRADE_CATEGORIES } from "../../shared/types.js"
import { closeTestDb, getTestDb, resetSchema } from "../helpers/db.js"

// ── Behavior 8: Badge seed populates the catalog ──────────────────────────

describe("badge seed", () => {
	beforeAll(async () => {
		await resetSchema()
	})

	afterAll(async () => {
		await closeTestDb()
	})

	it("inserts at least 50 badges into the catalog", async () => {
		const { seedBadges } = await import("../../server/db/seed.js")
		const db = await getTestDb()
		await seedBadges(db)

		const all = await db.select().from(badges)
		expect(all.length).toBeGreaterThanOrEqual(50)
	})

	it("each badge has a unique key, name, and tier", async () => {
		const db = await getTestDb()
		const all = await db.select().from(badges)

		const keys = all.map((b) => b.key)
		const uniqueKeys = new Set(keys)
		expect(uniqueKeys.size).toBe(keys.length)

		for (const badge of all) {
			expect(badge.name.length).toBeGreaterThan(0)
			expect(["bronze", "silver", "gold", "platinum"]).toContain(badge.tier)
		}
	})

	it("is idempotent — running seed twice does not duplicate badges", async () => {
		const { seedBadges } = await import("../../server/db/seed.js")
		const db = await getTestDb()
		await seedBadges(db)
		await seedBadges(db) // second run

		const all = await db.select().from(badges)
		const keys = all.map((b) => b.key)
		const uniqueKeys = new Set(keys)
		expect(uniqueKeys.size).toBe(keys.length) // no duplicates
	})
})

// ── Gym upgrades seed — open-ended content categories (gh-112+) ───────────
//
// Generalized over GYM_UPGRADE_CATEGORIES rather than hardcoded to one
// category name, so each new category issue (gh-113 lagree, gh-114
// swimming, gh-115 punching bags, gh-116 staff, gh-117 offices) that adds
// a catalog proof set + an allowlist entry is automatically covered here
// without further test-file edits.
const ORIGINAL_FIVE_CATEGORIES = new Set([
	"cardio",
	"weights",
	"amenities",
	"decor",
	"staff",
])

describe("gym upgrades seed", () => {
	beforeAll(async () => {
		await resetSchema()
	})

	afterAll(async () => {
		await closeTestDb()
	})

	it("seeds at least one entry for every open-ended category added beyond the original five", async () => {
		const { seedGymUpgrades } = await import("../../server/db/seed.js")
		const db = await getTestDb()
		await seedGymUpgrades(db)

		const all = await db.select().from(gymUpgradesCatalog)
		const newCategories = GYM_UPGRADE_CATEGORIES.filter(
			(c) => !ORIGINAL_FIVE_CATEGORIES.has(c),
		)
		expect(newCategories.length).toBeGreaterThanOrEqual(1)

		for (const category of newCategories) {
			const entries = all.filter((u) => u.category === category)
			expect(entries.length).toBeGreaterThanOrEqual(1)
		}
		for (const entry of all) {
			expect(GYM_UPGRADE_CATEGORIES).toContain(entry.category)
		}
	})

	it("every new-category entry unlocks exactly at its own requiredXp threshold, not before", async () => {
		const db = await getTestDb()
		const all = await db.select().from(gymUpgradesCatalog)
		const catalog = all.map((u) => ({ key: u.key, requiredXp: u.requiredXp }))
		const newCategories = GYM_UPGRADE_CATEGORIES.filter(
			(c) => !ORIGINAL_FIVE_CATEGORIES.has(c),
		)
		const newEntries = all.filter((u) => newCategories.includes(u.category))
		expect(newEntries.length).toBeGreaterThanOrEqual(1)

		for (const entry of newEntries) {
			const justBelow = deriveUnlockedUpgradeKeys(entry.requiredXp - 1, catalog)
			const atThreshold = deriveUnlockedUpgradeKeys(entry.requiredXp, catalog)
			expect(justBelow).not.toContain(entry.key)
			expect(atThreshold).toContain(entry.key)
		}
	})

	it("is idempotent — running seed twice does not duplicate any entries", async () => {
		const { seedGymUpgrades } = await import("../../server/db/seed.js")
		const db = await getTestDb()
		await seedGymUpgrades(db)
		await seedGymUpgrades(db) // second run

		const all = await db.select().from(gymUpgradesCatalog)
		const keys = all.map((u) => u.key)
		const uniqueKeys = new Set(keys)
		expect(uniqueKeys.size).toBe(keys.length)
	})
})
