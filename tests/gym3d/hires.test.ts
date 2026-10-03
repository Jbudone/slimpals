import { describe, expect, it } from "vitest"
import {
	canHireIn,
	HIRE,
	HIRE_ROLES,
	hireBonus,
	hireCost,
	hireIntro,
	hireName,
	hirePost,
} from "../../shared/gym3d/hires.js"

describe("hires", () => {
	it("costs more for every hire made", () => {
		expect(hireCost(0)).toBe(HIRE.base)
		expect(hireCost(2)).toBe(HIRE.base + 2 * HIRE.step)
		expect(hireCost(-5)).toBe(HIRE.base)
	})

	it("hires for every equipment room type, never the lobby", () => {
		for (const t of [
			"cardio",
			"weights",
			"boxing",
			"pool",
			"recovery",
			"juice",
		])
			expect(canHireIn(t)).toBe(true)
		expect(canHireIn("lobby")).toBe(false)
		expect(canHireIn("empty")).toBe(false)
	})

	it("names hires in turn from the room's list and introduces them", () => {
		const names = HIRE_ROLES.cardio.names
		expect(hireName("cardio", 0)).toBe(names[0])
		expect(hireName("cardio", names.length)).toBe(names[0])
		expect(hireIntro("cardio", "Nia")).toMatch(/^Hi, I'm Nia\./)
	})

	it("adds a base bonus that grows with training", () => {
		expect(hireBonus(1)).toBe(HIRE.bonus)
		expect(hireBonus(3)).toBeGreaterThan(hireBonus(2))
	})

	it("puts the two hires of a room at different posts", () => {
		const a = hirePost(0, { px: 1, pz: 1 }, 9, 6)
		const b = hirePost(1, { px: 1, pz: 1 }, 9, 6)
		expect(a.z).toBe(b.z)
		expect(a.x).not.toBe(b.x)
	})
})
