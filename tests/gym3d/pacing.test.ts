import { describe, expect, it } from "vitest"
import {
	ARCHETYPES,
	arrival,
	droughtIn,
	fitPower,
	ladderDays,
	levelOfXp,
	rng,
	simulate,
	xpOfLevel,
} from "../../shared/gym3d/pacing"

describe("pacing simulator", () => {
	it("is deterministic for a seed", () => {
		const a = simulate(ARCHETYPES[0]!, { players: 5, days: 60, seed: 3 })
		const b = simulate(ARCHETYPES[0]!, { players: 5, days: 60, seed: 3 })
		expect([...a[0]!.cum]).toEqual([...b[0]!.cum])
	})
	it("xp never goes down and more committed players are faster", () => {
		const hi = simulate(ARCHETYPES[0]!, { players: 60, days: 200, seed: 1 })
		const lo = simulate(ARCHETYPES[2]!, { players: 60, days: 200, seed: 1 })
		for (const r of hi)
			for (let i = 1; i < r.cum.length; i++)
				expect(r.cum[i]!).toBeGreaterThanOrEqual(r.cum[i - 1]!)
		expect(arrival(hi, xpOfLevel(6)).p50).toBeLessThan(
			arrival(lo, xpOfLevel(6)).p50,
		)
	})
	it("matches the live level rule", () => {
		expect(levelOfXp(xpOfLevel(9))).toBe(9)
		expect(levelOfXp(xpOfLevel(9) - 1)).toBe(8)
	})
	it("measures droughts", () => {
		expect(droughtIn([5, 6, 30], 1, 40)).toEqual({
			longest: 23,
			weeksWithEvent: 2 / 5,
		})
	})
	it("ladders get sparser and a power law fits itself", () => {
		const d = ladderDays(200)
		expect(d[1]! - d[0]!).toBeLessThan(d[d.length - 1]! - d[d.length - 2]!)
		const f = fitPower(
			[1, 2, 3, 4].map((l) => ({ level: l, xp: 10 * l ** 1.5 })),
		)
		expect(f.p).toBeCloseTo(1.5, 5)
		expect(rng(1)()).toBeGreaterThanOrEqual(0)
	})
})
