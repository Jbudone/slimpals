import { describe, expect, it } from "vitest"
import {
	computeLevel,
	DAILY_XP_RATE,
	deriveProgressionFromDays,
	deriveUnlockedUpgradeKeys,
	GYM_ERAS,
	getEraForXp,
} from "../../server/services/gym/index.js"

const CATALOG = [
	{ key: "cardio_treadmill", requiredXp: 0 },
	{ key: "weights_barbell", requiredXp: 200 },
	{ key: "staff_reception", requiredXp: 500 },
	{ key: "amenity_sauna", requiredXp: 1500 },
]

describe("deriveUnlockedUpgradeKeys", () => {
	it("includes only entries whose requiredXp is met", () => {
		expect(deriveUnlockedUpgradeKeys(250, CATALOG)).toEqual([
			"cardio_treadmill",
			"weights_barbell",
		])
	})

	it("includes an entry exactly at its threshold", () => {
		expect(deriveUnlockedUpgradeKeys(500, CATALOG)).toContain("staff_reception")
	})

	it("still includes zero-requirement entries at xp 0, but nothing else", () => {
		expect(deriveUnlockedUpgradeKeys(0, CATALOG)).toEqual(["cardio_treadmill"])
	})

	it("returns every key once xp exceeds every threshold", () => {
		expect(deriveUnlockedUpgradeKeys(999_999, CATALOG)).toHaveLength(
			CATALOG.length,
		)
	})
})

describe("deriveProgressionFromDays", () => {
	it("is 0 xp / level 0 / no unlocks beyond the free tier at day 0", () => {
		const snapshot = deriveProgressionFromDays(0, CATALOG)
		expect(snapshot).toMatchObject({
			daysElapsed: 0,
			xp: 0,
			level: 0,
			unlockedUpgradeKeys: ["cardio_treadmill"],
		})
	})

	it("computes xp as daysElapsed * DAILY_XP_RATE, rounded", () => {
		const snapshot = deriveProgressionFromDays(10, CATALOG)
		expect(snapshot.xp).toBe(Math.round(10 * DAILY_XP_RATE))
	})

	it("feeds the derived xp through computeLevel consistently", () => {
		const snapshot = deriveProgressionFromDays(50, CATALOG)
		expect(snapshot.level).toBe(computeLevel(snapshot.xp))
	})

	it("is deterministic — same daysElapsed always produces the same output", () => {
		expect(deriveProgressionFromDays(30, CATALOG)).toEqual(
			deriveProgressionFromDays(30, CATALOG),
		)
	})

	it("is monotonic — xp, level, and unlock count never decrease as daysElapsed increases", () => {
		let prevXp = -1
		let prevLevel = -1
		let prevUnlockCount = -1
		for (let day = 0; day <= 200; day += 3) {
			const snapshot = deriveProgressionFromDays(day, CATALOG)
			expect(snapshot.xp).toBeGreaterThanOrEqual(prevXp)
			expect(snapshot.level).toBeGreaterThanOrEqual(prevLevel)
			expect(snapshot.unlockedUpgradeKeys.length).toBeGreaterThanOrEqual(
				prevUnlockCount,
			)
			prevXp = snapshot.xp
			prevLevel = snapshot.level
			prevUnlockCount = snapshot.unlockedUpgradeKeys.length
		}
	})

	it("never unlocks an upgrade without enough synthetic xp for its real threshold", () => {
		for (let day = 0; day <= 200; day += 3) {
			const snapshot = deriveProgressionFromDays(day, CATALOG)
			for (const key of snapshot.unlockedUpgradeKeys) {
				const entry = CATALOG.find((c) => c.key === key)
				expect(entry).toBeDefined()
				expect(entry?.requiredXp).toBeLessThanOrEqual(snapshot.xp)
			}
		}
	})

	it("eventually unlocks every catalog entry given enough days", () => {
		const snapshot = deriveProgressionFromDays(365, CATALOG)
		expect(snapshot.unlockedUpgradeKeys).toHaveLength(CATALOG.length)
	})

	it("clamps negative daysElapsed to 0 instead of producing invalid xp", () => {
		expect(deriveProgressionFromDays(-10, CATALOG)).toEqual(
			deriveProgressionFromDays(0, CATALOG),
		)
	})

	it("includes the era matching its own xp (gh-65)", () => {
		const snapshot = deriveProgressionFromDays(200, CATALOG)
		expect(snapshot.era).toEqual(getEraForXp(snapshot.xp))
	})
})

describe("GYM_ERAS / getEraForXp (gh-65)", () => {
	it("defines at least 5-6 eras spanning a long engagement horizon", () => {
		expect(GYM_ERAS.length).toBeGreaterThanOrEqual(5)
	})

	it("starts at xp 0 so every gym has a valid starting era", () => {
		expect(GYM_ERAS[0].minXp).toBe(0)
		expect(getEraForXp(0).id).toBe(GYM_ERAS[0].id)
	})

	it("is sorted ascending by minXp with no gaps or duplicate thresholds", () => {
		for (let i = 1; i < GYM_ERAS.length; i++) {
			expect(GYM_ERAS[i].minXp).toBeGreaterThan(GYM_ERAS[i - 1].minXp)
		}
	})

	it("has unique, stable ids and non-empty names", () => {
		const ids = GYM_ERAS.map((e) => e.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const era of GYM_ERAS) {
			expect(era.name.length).toBeGreaterThan(0)
		}
	})

	it("no era beyond the first is reachable within days of normal play", () => {
		// DAILY_XP_RATE models a consistently-engaged user; every era after
		// the starting one should take well over a week (7 days) to reach.
		const oneWeekXp = DAILY_XP_RATE * 7
		for (const era of GYM_ERAS.slice(1)) {
			expect(era.minXp).toBeGreaterThan(oneWeekXp)
		}
	})

	it("returns the exact matching era at its own threshold, and the prior era just below it", () => {
		for (let i = 0; i < GYM_ERAS.length; i++) {
			expect(getEraForXp(GYM_ERAS[i].minXp).id).toBe(GYM_ERAS[i].id)
			if (i > 0) {
				expect(getEraForXp(GYM_ERAS[i].minXp - 1).id).toBe(GYM_ERAS[i - 1].id)
			}
		}
	})

	it("is monotonic — era index never decreases as xp increases", () => {
		let prevIndex = -1
		for (let xp = 0; xp <= 30_000; xp += 250) {
			const index = GYM_ERAS.findIndex((e) => e.id === getEraForXp(xp).id)
			expect(index).toBeGreaterThanOrEqual(prevIndex)
			prevIndex = index
		}
	})

	it("reaches the top era well beyond a year of consistent engagement, not within weeks", () => {
		const topEra = GYM_ERAS[GYM_ERAS.length - 1]
		const daysToTopEra = topEra.minXp / DAILY_XP_RATE
		expect(daysToTopEra).toBeGreaterThan(365)
	})
})
