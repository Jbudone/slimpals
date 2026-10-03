import { describe, expect, it } from "vitest"
import { RATING, ratingOf } from "../../shared/gym3d/rating.js"
import {
	openWallCost,
	sharedWalls,
	type WallPlot,
	wallKey,
} from "../../shared/gym3d/walls.js"

const plot = (
	px: number,
	pz: number,
	roomId: number,
	state = "owned",
): WallPlot => ({
	px,
	pz,
	state,
	roomId,
})
const room = (id: number, type = "cardio", building = false) => ({
	id,
	type,
	building,
})

describe("shared walls", () => {
	it("names a wall from the far plot, per axis", () => {
		const walls = sharedWalls(
			[plot(1, 1, 1), plot(2, 1, 2), plot(1, 0, 3)],
			[room(1), room(2), room(3)],
		)
		expect(walls.map((w) => wallKey(w.ref)).sort()).toEqual([
			"1,1:z", // the wall between (1,0) and (1,1)
			"2,1:x", // the wall between (1,1) and (2,1)
		])
		const east = walls.find((w) => w.ref.axis === "x")
		expect(east).toMatchObject({ near: 1, far: 2 })
	})

	it("offers nothing inside one room, or towards rooms not finished", () => {
		const same = sharedWalls([plot(1, 1, 1), plot(2, 1, 1)], [room(1)])
		expect(same).toEqual([])
		const plots = [plot(1, 1, 1), plot(2, 1, 2), plot(3, 1, 3, "building")]
		const rooms = [room(1), room(2, "empty"), room(3, "cardio", true)]
		expect(sharedWalls(plots, rooms)).toEqual([])
	})

	it("costs more for each wall already open", () => {
		expect(openWallCost(1)).toBeGreaterThan(openWallCost(0))
		expect(openWallCost(-3)).toBe(openWallCost(0))
	})
})

describe("open walls in the rating", () => {
	const base = { rooms: [], pieces: [] }
	it("score one each, up to a cap", () => {
		expect(ratingOf({ ...base, openWalls: 2 }).parts.openWalls).toBe(
			2 * RATING.openWallPoints,
		)
		expect(ratingOf({ ...base, openWalls: 99 }).parts.openWalls).toBe(
			RATING.openWallCap * RATING.openWallPoints,
		)
		expect(ratingOf(base).parts.openWalls).toBe(0)
	})
})
