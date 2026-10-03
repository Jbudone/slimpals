import { describe, expect, it } from "vitest"
import {
	GOAL_SOURCE,
	GOALS,
	goalMet,
	goalState,
	goalsDto,
	metGoalIds,
} from "../../shared/gym3d/goals.js"
import {
	gymScore,
	RATING,
	type RatingInput,
	ratingOf,
	starsFromScore,
} from "../../shared/gym3d/rating.js"

const room = (
	type: string,
	level = 1,
	cells = 1,
	building = false,
): RatingInput["rooms"][number] => ({
	type,
	level,
	building,
	cells: Array.from({ length: cells }, (_, i) => ({ px: i, pz: 0 })),
})
const lobby = room("lobby")
const decor = (n: number): RatingInput["pieces"] =>
	Array.from({ length: n }, (_, i) => ({
		kind: "decor" as const,
		itemKey: `plant${i}`,
		tier: 1,
		status: "placed",
	}))
const gear = (
	itemKey: string,
	tier = 1,
	status = "placed",
): RatingInput["pieces"][number] => ({
	kind: "equipment",
	itemKey,
	tier,
	status,
})

describe("gym star rating", () => {
	it("a bare lobby is one star with a score of zero", () => {
		const r = ratingOf({ rooms: [lobby], pieces: [] })
		expect(r.score).toBe(0)
		expect(r.stars).toBe(1)
		expect(r.next).toBe(RATING.thresholds[1])
		expect(r.k).toBe(0)
	})

	it("scores room levels, variety, decor, staff and big rooms", () => {
		const parts = gymScore({
			rooms: [
				lobby,
				room("cardio", 3),
				room("weights", 1, 2),
				room("boxing", 1, 1, true), // still being built: counts for nothing
			],
			pieces: [
				...decor(2),
				gear("staff_massage"),
				gear("staff_massage"), // the same staff piece twice counts once
				gear("staff_physio"),
				gear("cardio_treadmill"),
				gear("staff_trainer", 1, "stored"), // not on a spot
			],
		})
		expect(parts.levels).toBe(4) // cardio 3 + weights 1
		expect(parts.variety).toBe(2)
		expect(parts.decor).toBe(1) // 2 x 0.5
		expect(parts.staff).toBe(2)
		expect(parts.bigRooms).toBe(2)
		expect(parts.total).toBe(11)
	})

	it("caps what decor can score", () => {
		const few = gymScore({ rooms: [lobby], pieces: decor(RATING.decorCap) })
		const many = gymScore({
			rooms: [lobby],
			pieces: decor(RATING.decorCap + 10),
		})
		expect(many.decor).toBe(few.decor)
	})

	it("maps scores to 1..5 stars at the thresholds", () => {
		expect(starsFromScore(0)).toBe(1)
		expect(starsFromScore(RATING.thresholds[1] - 0.5)).toBe(1)
		expect(starsFromScore(RATING.thresholds[1])).toBe(2)
		expect(starsFromScore(RATING.thresholds[2])).toBe(3)
		expect(starsFromScore(RATING.thresholds[3])).toBe(4)
		expect(starsFromScore(RATING.thresholds[4])).toBe(5)
		expect(starsFromScore(9999)).toBe(5)
	})

	it("reports progress to the next star and none at five", () => {
		const half = ratingOf({
			rooms: [lobby, room("cardio", 3), room("weights", 3)],
			pieces: [],
		}) // 6 levels + 2 variety = 8: between 6 and 14
		expect(half.stars).toBe(2)
		expect(half.next).toBe(14)
		expect(half.k).toBeCloseTo((8 - 6) / (14 - 6))
		const top = ratingOf({
			rooms: [lobby, ...Array.from({ length: 8 }, () => room("cardio", 5))],
			pieces: [],
		})
		expect(top.stars).toBe(5)
		expect(top.next).toBeNull()
		expect(top.k).toBe(1)
	})

	it("is reachable: a full gym gets five stars", () => {
		const types = ["cardio", "weights", "boxing", "recovery", "juice", "pool"]
		const r = ratingOf({
			rooms: [lobby, ...types.map((t) => room(t, 4, 2))],
			pieces: [...decor(6), gear("staff_massage"), gear("staff_physio")],
		})
		expect(r.stars).toBe(5)
	})
})

describe("gym goals", () => {
	const empty = goalState({ rooms: [lobby], pieces: [] })

	it("has unique ids, rewards and a positive target for every goal", () => {
		expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length)
		for (const g of GOALS) {
			expect(g.reward.sweat + g.reward.greens).toBeGreaterThan(0)
			expect(g.progress(empty).target).toBeGreaterThan(0)
			expect(GOAL_SOURCE(g.id).length).toBeLessThanOrEqual(64)
		}
	})

	it("starts with nothing met on a bare lobby", () => {
		expect(metGoalIds(empty)).toEqual([])
	})

	it("meets goals from what the layout holds", () => {
		const s = goalState({
			rooms: [lobby, room("cardio", 2), room("weights", 1)],
			pieces: [...decor(1), gear("cardio_treadmill", 2)],
		})
		const met = metGoalIds(s)
		expect(met).toContain("rooms-2")
		expect(met).toContain("decor-1")
		expect(met).toContain("room-lv2")
		expect(met).toContain("upgrade-t2")
		expect(met).not.toContain("stars-2") // 3 + 2 + 0.5 = 5.5, just short of 6
	})

	it("does not count rooms still being built", () => {
		const s = goalState({
			rooms: [lobby, room("cardio"), room("weights", 1, 1, true)],
			pieces: [],
		})
		const rooms2 = GOALS.find((g) => g.id === "rooms-2")
		expect(rooms2 && goalMet(rooms2, s)).toBe(false)
	})

	it("lists every goal; paid ones stay done even if the gym changed", () => {
		const list = goalsDto(empty, new Set(["rooms-2"]))
		expect(list).toHaveLength(GOALS.length)
		const g = list.find((x) => x.id === "rooms-2")
		expect(g?.done).toBe(true)
		expect(g?.value).toBe(g?.target)
		const open = list.find((x) => x.id === "stars-3")
		expect(open?.done).toBe(false)
		expect(open?.value).toBeLessThan(open?.target ?? 0)
	})
})
