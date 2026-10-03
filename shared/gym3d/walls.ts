// Open walls: knocking out the wall between two finished rooms joins them
// into one space (people walk through it freely) and counts towards the
// gym's star rating. Pure: the server validates and charges with these
// functions, the client draws the same walls and lists the same choices.
//
// A wall is named from the plot on its far side: `axis` "x" is the wall on
// that plot's -x side (a vertical wall), "z" the one on its -z side. Every
// wall between two plots has exactly one such name (the same one the
// world draws it by), so it can be stored and compared as a plain key.
import { ECONOMY } from "./economy.js"

export type WallAxis = "x" | "z"

export type WallRef = { px: number; pz: number; axis: WallAxis }

export type WallPlot = {
	px: number
	pz: number
	state: string
	roomId: number | null
}

export type WallRoom = { id: number; type: string; building: boolean }

export type SharedWall = {
	ref: WallRef
	/** The room on the -x / -z side of the wall. */
	near: number
	/** The room the wall is named from (its +x / +z side). */
	far: number
}

export function wallKey(w: WallRef): string {
	return `${w.px},${w.pz}:${w.axis}`
}

export function isWallAxis(a: unknown): a is WallAxis {
	return a === "x" || a === "z"
}

/** Coins to open the next wall when `opened` are open already. */
export function openWallCost(opened: number): number {
	const w = ECONOMY.walls
	return w.base + w.step * Math.max(0, opened)
}

/** Every wall between two different finished, typed rooms. Walls to a room
 * still being built, or bought but not yet typed, are not offered. */
export function sharedWalls(
	plots: readonly WallPlot[],
	rooms: readonly WallRoom[],
): SharedWall[] {
	const ok = new Set(
		rooms.filter((r) => !r.building && r.type !== "empty").map((r) => r.id),
	)
	const at = new Map<string, WallPlot>()
	for (const p of plots)
		if (p.state === "owned" && p.roomId != null && ok.has(p.roomId))
			at.set(`${p.px},${p.pz}`, p)
	const out: SharedWall[] = []
	for (const far of at.values()) {
		for (const [axis, dx, dz] of [
			["x", -1, 0],
			["z", 0, -1],
		] as const) {
			const near = at.get(`${far.px + dx},${far.pz + dz}`)
			if (!near || near.roomId === far.roomId) continue
			out.push({
				ref: { px: far.px, pz: far.pz, axis },
				near: near.roomId as number,
				far: far.roomId as number,
			})
		}
	}
	return out
}
