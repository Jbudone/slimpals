// Room vibes and styles (gym home). A style is a whole-room look made of the
// paint a room already has (walls, floor style, floor colour), applied in one
// tap through the paint endpoint. A vibe is a mood for a room: it costs
// coins, tints the room's floor with a glow, changes how fast members work
// out in it, adds a small coin bonus to its machines and a little to the
// gym's star score. Pure: the server validates and charges, the client draws
// and shows the same numbers.
import type { FloorStyle } from "./rooms.js"

export type RoomStyle = {
	key: string
	name: string
	wall: string
	floorStyle: FloorStyle
	floorColor: string
}

// Every colour here is in the paint palettes (economy.ts WALL_COLORS and
// FLOOR_TINTS), which the server's paint endpoint accepts.
export const STYLES: readonly RoomStyle[] = [
	{
		key: "industrial",
		name: "Industrial",
		wall: "#cfd6c4",
		floorStyle: "concrete",
		floorColor: "#4a5060",
	},
	{
		key: "neon",
		name: "Neon",
		wall: "#5a6a8a",
		floorStyle: "tile",
		floorColor: "#4a5060",
	},
	{
		key: "zen",
		name: "Zen",
		wall: "#fff1e0",
		floorStyle: "wood",
		floorColor: "#f6e6c8",
	},
	{
		key: "retro",
		name: "Retro",
		wall: "#f7d38a",
		floorStyle: "checker",
		floorColor: "#f3e3cc",
	},
]

/** The style a room's paint matches exactly, or null. */
export function styleOf(paint: {
	wall: string
	floorStyle: string
	floorColor: string
}): RoomStyle | null {
	return (
		STYLES.find(
			(s) =>
				s.wall === paint.wall &&
				s.floorStyle === paint.floorStyle &&
				s.floorColor === paint.floorColor,
		) ?? null
	)
}

export type Vibe = {
	key: string
	name: string
	blurb: string
	/** Glow over the room's floor. */
	color: string
	/** How fast members work out in the room (1 = normal). */
	pace: number
}

export const VIBES: Readonly<Record<string, Vibe>> = {
	chill: {
		key: "chill",
		name: "Chill",
		blurb: "Soft music, warm light. Members take it easy.",
		color: "#7fd6c2",
		pace: 0.85,
	},
	hype: {
		key: "hype",
		name: "Hype",
		blurb: "Loud music, hot lights. Members push harder.",
		color: "#ff5db1",
		pace: 1.2,
	},
	focus: {
		key: "focus",
		name: "Focus",
		blurb: "Steady beat, cool light. Members get in the zone.",
		color: "#7fa8ff",
		pace: 1,
	},
}

export const VIBE = {
	/** Coins to set (or change) a room's vibe; clearing one is free. */
	cost: 200,
	/** Coin bonus any vibe gives its room's machines. */
	bonus: 0.04,
	/** Star score: per room with a vibe, and how many rooms count. */
	scorePoints: 0.5,
	scoreCap: 3,
} as const

export function isVibe(v: unknown): v is string {
	return typeof v === "string" && v in VIBES
}

/** Workout speed factor in a room with `vibe` (null: normal). */
export function vibePace(vibe: string | null | undefined): number {
	return (vibe && VIBES[vibe]?.pace) || 1
}
