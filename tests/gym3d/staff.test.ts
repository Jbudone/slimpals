import { describe, expect, it } from "vitest"
import {
	areaMultiplier,
	BONUS_PER_LEVEL,
	STAFF,
	STAFF_MAX_LEVEL,
	staffBonus,
	staffDef,
	staffStats,
	trainCost,
} from "../../shared/gym3d/staff.js"

describe("staff growth", () => {
	it("knows every staff member once", () => {
		expect(new Set(STAFF.map((s) => s.key)).size).toBe(STAFF.length)
		expect(staffDef("trainer_marcus")?.area).toBe("weights")
		expect(staffDef("regular_derek")).toBeNull()
	})

	it("costs more each level and stops at the top", () => {
		let last = 0
		for (let l = 1; l < STAFF_MAX_LEVEL; l++) {
			const c = trainCost(l)
			expect(c).toBeGreaterThan(last)
			last = c ?? 0
		}
		expect(trainCost(STAFF_MAX_LEVEL)).toBeNull()
		expect(trainCost(0)).toBeNull()
	})

	it("adds one to every stat per level", () => {
		const marcus = staffDef("trainer_marcus")
		if (!marcus) throw new Error("no marcus")
		expect(staffStats(marcus, 1)).toEqual(marcus.stats)
		expect(staffStats(marcus, 3).expertise).toBe(marcus.stats.expertise + 2)
		// levels outside 1..max are clamped
		expect(staffStats(marcus, 99).speed).toBe(
			marcus.stats.speed + STAFF_MAX_LEVEL - 1,
		)
	})

	it("gives no bonus at level 1 and the manager half the rate", () => {
		const marcus = staffDef("trainer_marcus")
		const alex = staffDef("manager_alex")
		if (!marcus || !alex) throw new Error("missing staff")
		expect(staffBonus(marcus, 1)).toBe(0)
		expect(staffBonus(marcus, 3)).toBeCloseTo(2 * BONUS_PER_LEVEL)
		expect(staffBonus(alex, 3)).toBeCloseTo(BONUS_PER_LEVEL)
	})

	it("applies a bonus only to the staff member's own area", () => {
		const none = new Map<string, number>()
		expect(areaMultiplier("weights", none)).toBe(1)
		const levels = new Map([["trainer_marcus", 3]])
		expect(areaMultiplier("weights", levels)).toBeCloseTo(
			1 + 2 * BONUS_PER_LEVEL,
		)
		expect(areaMultiplier("cardio", levels)).toBe(1)
		expect(areaMultiplier("desk", levels)).toBe(1)
	})

	it("the manager lifts every machine but not the desk or kitchen", () => {
		const levels = new Map([["manager_alex", 5]])
		const expected = 1 + 4 * (BONUS_PER_LEVEL / 2)
		for (const room of ["cardio", "weights", "boxing", "recovery"])
			expect(areaMultiplier(room, levels)).toBeCloseTo(expected)
		expect(areaMultiplier("desk", levels)).toBe(1)
		expect(areaMultiplier("kitchen", levels)).toBe(1)
	})

	it("stacks area staff with the manager", () => {
		const levels = new Map([
			["trainer_marcus", 2],
			["manager_alex", 2],
		])
		expect(areaMultiplier("weights", levels)).toBeCloseTo(
			1 + BONUS_PER_LEVEL + BONUS_PER_LEVEL / 2,
		)
	})
})
