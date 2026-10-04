import { describe, expect, it } from "vitest"
import {
	CHALLENGE_TIERS,
	isTier,
	tierCoins,
	tierGoals,
	tierTarget,
} from "../../shared/challenges/tiers.js"

describe("challenge tiers", () => {
	it("scales targets by tier, silver being the challenge as generated", () => {
		expect(CHALLENGE_TIERS).toEqual(["bronze", "silver", "gold"])
		expect(tierTarget(10, "silver")).toBe(10)
		expect(tierTarget(10, "bronze")).toBe(6)
		expect(tierTarget(10, "gold")).toBe(14)
		// never below 1, always whole
		expect(tierTarget(1, "bronze")).toBe(1)
		expect(Number.isInteger(tierTarget(7, "gold"))).toBe(true)
		const goals = [
			{ id: "a", target: 100 },
			{ id: "b", target: 5 },
		]
		expect(tierGoals(goals, "gold").map((g) => g.target)).toEqual([140, 7])
		// the originals are left alone
		expect(goals[0].target).toBe(100)
	})

	it("lets a goal set its own bronze and gold targets", () => {
		const o = { bronze: 3, gold: 30 }
		expect(tierTarget(20, "bronze", o)).toBe(3)
		expect(tierTarget(20, "silver", o)).toBe(20)
		expect(tierTarget(20, "gold", o)).toBe(30)
		// a tier it leaves out is scaled as usual
		expect(tierTarget(20, "gold", { bronze: 3 })).toBe(28)
		const goals = [
			{ id: "a", target: 20, tiers: o },
			{ id: "b", target: 10 },
		]
		expect(tierGoals(goals, "bronze").map((g) => g.target)).toEqual([3, 6])
	})

	it("pays more coins at higher tiers, silver being the base, and knows what a tier is", () => {
		expect(tierCoins(100, "bronze")).toBe(75)
		expect(tierCoins(100, "silver")).toBe(100)
		expect(tierCoins(100, "gold")).toBe(150)
		expect(isTier("gold")).toBe(true)
		expect(isTier("platinum")).toBe(false)
		expect(isTier(undefined)).toBe(false)
	})
})
