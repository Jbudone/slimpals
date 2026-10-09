import { describe, expect, it } from "vitest"
import {
	type LockedGear,
	levelAtXp,
	REVEALED,
	unlockRail,
	upcomingUnlocks,
} from "../../src/lib/unlocks"

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

describe("the unlock rail", () => {
	const gearList = [100, 400, 900, 2000, 3000, 5000].map((x) =>
		gear(`g${x}`, x),
	)

	it("shows three in full, hints at the fourth and hides the rest", () => {
		const r = unlockRail(gearList, 0)
		expect(REVEALED).toBe(3)
		expect(r.shown.map((s) => s.key)).toEqual(["g100", "g400", "g900"])
		expect(r.hint).toEqual({ requiredXp: 2000, level: 6, toGo: 2000 })
		// nothing about the fifth or sixth leaks out
		expect(JSON.stringify(r)).not.toContain("g3000")
		expect(JSON.stringify(r)).not.toContain("g5000")
	})

	it("moves on as XP is earned, so a new hint always appears", () => {
		const r = unlockRail(gearList, 500)
		expect(r.shown.map((s) => s.key)).toEqual(["g900", "g2000", "g3000"])
		expect(r.hint?.requiredXp).toBe(5000)
		expect(unlockRail(gearList, 2500).hint).toBeNull()
		expect(unlockRail(gearList, 9999).shown).toEqual([])
	})

	it("names the level an XP total falls in", () => {
		expect(levelAtXp(0)).toBe(0)
		expect(levelAtXp(49)).toBe(0)
		expect(levelAtXp(50)).toBe(1)
		expect(levelAtXp(450)).toBe(3)
	})
})
