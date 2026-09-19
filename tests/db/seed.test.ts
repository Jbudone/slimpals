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

// ── Gym upgrades seed — boxing category proof set (gh-112) ────────────────

describe("gym upgrades seed", () => {
	beforeAll(async () => {
		await resetSchema()
	})

	afterAll(async () => {
		await closeTestDb()
	})

	it("seeds at least one boxing catalog entry, using a valid open-ended category", async () => {
		const { seedGymUpgrades } = await import("../../server/db/seed.js")
		const db = await getTestDb()
		await seedGymUpgrades(db)

		const all = await db.select().from(gymUpgradesCatalog)
		const boxingEntries = all.filter((u) => u.category === "boxing")

		expect(boxingEntries.length).toBeGreaterThanOrEqual(1)
		for (const entry of all) {
			expect(GYM_UPGRADE_CATEGORIES).toContain(entry.category)
		}
	})

	it("boxing entries unlock exactly at their own requiredXp threshold, not before", async () => {
		const db = await getTestDb()
		const all = await db.select().from(gymUpgradesCatalog)
		const catalog = all.map((u) => ({ key: u.key, requiredXp: u.requiredXp }))
		const boxingEntries = all.filter((u) => u.category === "boxing")
		expect(boxingEntries.length).toBeGreaterThanOrEqual(1)

		for (const entry of boxingEntries) {
			const justBelow = deriveUnlockedUpgradeKeys(entry.requiredXp - 1, catalog)
			const atThreshold = deriveUnlockedUpgradeKeys(entry.requiredXp, catalog)
			expect(justBelow).not.toContain(entry.key)
			expect(atThreshold).toContain(entry.key)
		}
	})

	it("is idempotent — running seed twice does not duplicate the boxing entries", async () => {
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
