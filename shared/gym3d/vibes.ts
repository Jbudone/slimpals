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

// ── vibe vfx: what floats up out of a room's floor ──────────────────────────
// Motes (tiny glowing bits) rise from the floor of a room with a vibe: soft
// and slow for Chill, quick sparks for Hype, still cool dust for Focus. Pure
// (position, spawn and step), the world only draws them.

export type VibeFx = {
	/** Seconds between spawns per plot of the room. */
	every: number
	/** Upward speed (units per second). */
	rise: number
	/** Sideways sway (units). */
	sway: number
	/** Mote size (units). */
	size: number
	/** Seconds a mote lives. */
	life: number
	color: string
	/** How much a mote pulses in size (0 = steady). */
	pulse: number
}

export const VIBE_FX: Readonly<Record<string, VibeFx>> = {
	chill: {
		every: 0.7,
		rise: 0.35,
		sway: 0.5,
		size: 0.22,
		life: 5,
		color: "#c9fff3",
		pulse: 0.2,
	},
	hype: {
		every: 0.22,
		rise: 1.5,
		sway: 0.15,
		size: 0.17,
		life: 1.7,
		color: "#ffc2e6",
		pulse: 0.6,
	},
	focus: {
		every: 0.9,
		rise: 0.12,
		sway: 0.9,
		size: 0.14,
		life: 6,
		color: "#d6e4ff",
		pulse: 0,
	},
}

export type Mote = {
	x: number
	y: number
	z: number
	x0: number
	age: number
	life: number
	size: number
	/** Sway phase. */
	ph: number
	vibe: string
}

/** A new mote on the floor of a plot (`rect`: centre and size). */
export function spawnMote(
	vibe: string,
	rect: { x: number; z: number; w: number; d: number },
	rng: () => number,
): Mote | null {
	const fx = VIBE_FX[vibe]
	if (!fx) return null
	const x = rect.x + (rng() - 0.5) * rect.w * 0.9
	return {
		x,
		y: 0.05,
		z: rect.z + (rng() - 0.5) * rect.d * 0.9,
		x0: x,
		age: 0,
		life: fx.life * (0.75 + rng() * 0.5),
		size: fx.size * (0.7 + rng() * 0.6),
		ph: rng() * Math.PI * 2,
		vibe,
	}
}

/** Moves a mote on; false once it is spent. */
export function stepMote(m: Mote, dt: number): boolean {
	const fx = VIBE_FX[m.vibe]
	if (!fx) return false
	m.age += dt
	if (m.age >= m.life) return false
	m.y += fx.rise * dt
	m.x = m.x0 + Math.sin(m.age * 1.3 + m.ph) * fx.sway * 0.5
	return true
}

/** Size now: grows in, fades out, and pulses for the lively vibes. */
export function moteScale(m: Mote): number {
	const fx = VIBE_FX[m.vibe]
	const k = Math.sin(Math.PI * Math.min(1, m.age / m.life))
	return m.size * k * (1 + (fx?.pulse ?? 0) * Math.sin(m.age * 9 + m.ph))
}
