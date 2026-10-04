import { describe, expect, it } from "vitest"
import {
	GHOST_LINES,
	GHOST_LOCKER_LINES,
	GHOST_STAY_CHANCE,
	ghostLine,
	ghostSeason,
	STAY_LINES,
	stayLine,
} from "../../shared/gym3d/ghost.js"

describe("the October ghost", () => {
	it("haunts only in October", () => {
		expect(ghostSeason(10)).toBe(true)
		for (const m of [1, 5, 9, 11, 12]) expect(ghostSeason(m)).toBe(false)
	})

	it("is supportive and dry: short lines, no exclamation marks", () => {
		for (const l of [...GHOST_LINES, ...GHOST_LOCKER_LINES]) {
			expect(l.length).toBeLessThanOrEqual(60)
			expect(l).not.toContain("!")
		}
		expect(ghostLine(() => 0)).toBe(GHOST_LINES[0])
		expect(ghostLine(() => 0, true)).toBe(GHOST_LOCKER_LINES[0])
		expect(ghostLine(() => 0.999)).toBe(GHOST_LINES[GHOST_LINES.length - 1])
	})

	it("talks half of the leavers into one more set, in short dry lines", () => {
		expect(GHOST_STAY_CHANCE).toBe(0.5)
		for (const l of STAY_LINES) {
			expect(l.length).toBeLessThanOrEqual(60)
			expect(l).not.toContain("!")
		}
		expect(stayLine(() => 0)).toBe(STAY_LINES[0])
		expect(stayLine(() => 0.999)).toBe(STAY_LINES[STAY_LINES.length - 1])
	})
})
