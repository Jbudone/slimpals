import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { badges } from "../../server/db/schema.js"
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
