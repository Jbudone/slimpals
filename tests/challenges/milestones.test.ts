import { describe, expect, it } from "vitest"
import {
	CHALLENGE_MILESTONES,
	challengeFraction,
	milestoneSource,
	reachedMilestones,
} from "../../shared/challenges/milestones.js"

describe("challenge milestones", () => {
	const goals = [
		{ id: "a", target: 10 },
		{ id: "b", target: 20 },
		{ id: "c", target: 5 },
		{ id: "d", target: 4 },
	]

	it("averages how far each goal is, capped at its target", () => {
		expect(challengeFraction(goals, {})).toBe(0)
		expect(challengeFraction(goals, { a: 10, b: 20, c: 5, d: 4 })).toBe(1)
		// an overshoot counts as done, not as extra
		expect(challengeFraction(goals, { a: 100 })).toBe(0.25)
		expect(challengeFraction([], {})).toBe(0)
	})

	it("reaches a milestone at exactly its percentage", () => {
		const pcts = (f: number) => reachedMilestones(f).map((m) => m.pct)
		expect(pcts(0.2499)).toEqual([])
		expect(pcts(0.25)).toEqual([25])
		expect(pcts(0.5)).toEqual([25, 50])
		expect(pcts(0.999)).toEqual([25, 50, 75])
		expect(pcts(1)).toEqual([25, 50, 75, 100])
		// summed from fractions it still lands on 0.25
		expect(pcts(0.1 + 0.15)).toEqual([25])
	})

	it("pays more at each step and names each payout uniquely", () => {
		const coins = CHALLENGE_MILESTONES.map((m) => m.coins)
		expect(coins).toEqual([...coins].sort((x, y) => x - y))
		expect(new Set(coins).size).toBe(coins.length)
		expect(milestoneSource(7, 50)).toBe("challenge:7:m50")
	})
})
