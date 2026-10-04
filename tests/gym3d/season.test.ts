import { describe, expect, it } from "vitest"
import { COSMETICS, cosmeticOf } from "../../shared/gym3d/cosmetics.js"
import { KITCHEN_MENU, menuInSeason } from "../../shared/gym3d/economy.js"
import { stepReward, trackSteps } from "../../shared/gym3d/rewardTrack.js"
import {
	SEASON_HAT,
	SEASONS,
	seasonFromQuery,
	seasonOf,
} from "../../shared/gym3d/season.js"

describe("seasons", () => {
	it("October, November and December each have a season, the rest of the year none", () => {
		expect(seasonOf(10)).toBe("halloween")
		expect(seasonOf(11)).toBe("harvest")
		expect(seasonOf(12)).toBe("winter")
		for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9]) expect(seasonOf(m)).toBeNull()
	})

	it("a query can force a season, or none; ?ghost keeps its old meaning", () => {
		expect(seasonFromQuery("winter", null)).toBe("winter")
		expect(seasonFromQuery("none", null)).toBe("none")
		expect(seasonFromQuery(null, "1")).toBe("halloween")
		expect(seasonFromQuery(null, "0")).toBe("none")
		expect(seasonFromQuery("bogus", null)).toBeNull()
		expect(seasonFromQuery(null, null)).toBeNull()
		// ?season wins over ?ghost
		expect(seasonFromQuery("harvest", "1")).toBe("harvest")
	})

	it("halloween and winter put a hat on people, harvest none", () => {
		expect(SEASONS).toHaveLength(3)
		expect(SEASON_HAT).toEqual({
			halloween: "witch",
			harvest: null,
			winter: "santa",
		})
	})

	it("the track gives each season month three cosmetics that exist in the catalog", () => {
		for (const month of ["2026-10", "2026-11", "2026-12"]) {
			const steps = trackSteps(month)
			const keys = steps.flatMap((s) =>
				s.reward.cosmetic ? [s.reward.cosmetic] : [],
			)
			expect(keys).toHaveLength(3)
			for (const k of keys) expect(cosmeticOf(k)).not.toBeNull()
		}
		expect(stepReward(7, 30, "2026-11").cosmetic).toBe("harvest_basket")
		expect(stepReward(21, 31, "2026-12").cosmetic).toBe("winter_hat")
		// every decor cosmetic has a builder, every outfit none
		for (const c of COSMETICS) expect(!!c.builder).toBe(c.kind === "decor")
	})

	it("winter menu items open in winter only and sit at the end of the menu", () => {
		const cocoa = KITCHEN_MENU.find((m) => m.key === "cocoa")
		if (!cocoa) throw new Error("no cocoa")
		expect(menuInSeason(cocoa, 12)).toBe(true)
		expect(menuInSeason(cocoa, 1)).toBe(true)
		expect(menuInSeason(cocoa, 7)).toBe(false)
		// the menu is a bitmask: existing items keep their positions
		expect(KITCHEN_MENU.slice(0, 6).map((m) => m.key)).toEqual([
			"green",
			"protein",
			"acai",
			"salad",
			"pumpkin",
			"oats",
		])
	})
})
