import { describe, expect, it } from "vitest"
import {
	computeLevel,
	DAILY_XP_RATE,
	deriveProgressionFromDays,
	deriveUnlockedUpgradeKeys,
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
})
