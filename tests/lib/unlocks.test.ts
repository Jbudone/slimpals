import { describe, expect, it } from "vitest"
import { type LockedGear, upcomingUnlocks } from "../../src/lib/unlocks"

const gear = (key: string, requiredXp: number): LockedGear => ({
	key,
	name: key,
	requiredXp,
	roomType: "cardio",
	size: 1,
})

describe("upcoming unlocks", () => {
	const all = [gear("c", 900), gear("a", 100), gear("b", 400), gear("d", 2000)]

	it("lists what is still locked, soonest first, with the XP to go", () => {
		const u = upcomingUnlocks(all, 250)
		expect(u.map((s) => s.key)).toEqual(["b", "c", "d"])
		expect(u[0].toGo).toBe(150)
	})

	it("the first one shows how far along the way it is from the one before", () => {
		const [first] = upcomingUnlocks(all, 250)
		// between 100 (a, reached) and 400: 150 of 300
		expect(first.k).toBeCloseTo(0.5, 5)
		expect(upcomingUnlocks(all, 0)[0].k).toBe(0)
	})

	it("is empty once everything is reached, and capped at the limit", () => {
		expect(upcomingUnlocks(all, 5000)).toEqual([])
		expect(upcomingUnlocks(all, 0, 2)).toHaveLength(2)
	})
})
