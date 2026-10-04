// Shared shapes of the 3D gym world: stations (where a person works out),
// pieces (placed equipment / decor) and people.
import type * as T from "three"
import type { Outfit } from "../people/outfits"
import type { Rig } from "../people/rig"

export type TickFn = (dt: number) => void

export type PoseName =
	| "idle"
	| "walk"
	| "run"
	| "bench"
	| "curl"
	| "sit"
	| "stand_work"
	| "bike"
	| "sitstool"
	| "stretch"
	| "row"
	| "climb"
	| "punch"
	| "mitts"
	| "lie"
	| "swim"
	| "lift"
	| "seated"
	| "coach"
	| "flex"
	| "fly"
	| "lunge"
	| "hammer"

/** A place on a piece where one person works out (or works). Coordinates are
 * world space once the piece is placed; lx/lz/lface keep the local ones. */
export type Station = {
	type?:
		| "run"
		| "bench"
		| "curl"
		| "bike"
		| "sit"
		| "sitstool"
		| "stretch"
		| "staff"
	pose?: PoseName
	x: number
	y: number
	z: number
	face: number
	lx: number
	lz: number
	lface: number
	label: string
	/** Worked by staff, not members. */
	staff?: boolean
	/** Sit variant: stand at the counter instead. */
	stand?: boolean
	busy: Person | null
	piece: Piece | null
	skip?: boolean
	closed?: boolean
	// pose options
	dz?: number
	bar?: T.Object3D
	barRest?: T.Vector3
	barAxis?: "y"
	benchGroup?: T.Object3D
	lift?: "squat" | "dead"
	footZ?: number
	frontZ?: number
	prop?: "board" | "tablet" | "none"
	prone?: boolean
	recline?: number
	legLift?: boolean
	work?: boolean
	talk?: boolean
	/** Punch phase offset so two sparring partners alternate. */
	sync?: number
	/** Set by the punch pose (0..1), read by bags to swing. */
	hit?: number
	/** Swim laps remember where they started. */
	x0?: number | null
	z0?: number | null
	tick?: (p: Person, t: number, dt: number) => void
}

export type PieceKind = "equipment" | "decor"

export type BakeSrc = { geo: T.BufferGeometry; m: T.Matrix4; mat: T.Material }

export type Piece = {
	/** Layout piece id from the server. */
	id: number
	itemKey: string
	kind: PieceKind
	upgradeKey: string | null
	name: string
	size: number
	tier: number
	x: number
	z: number
	rot: number
	roomId: number | null
	locked: boolean
	/** placed | upgrading */
	status: string
	/** Room type this gear goes in (null: fixtures, decor, lobby staff). */
	roomType: string | null
	spotIndex: number | null
	root: T.Group
	inner: T.Group
	hit: T.Mesh
	ticks: TickFn[]
	stations: Station[]
	bakeSrc?: BakeSrc[]
	bakeMesh?: T.Mesh
	deco?: T.Group
}

/** npc: named, from the sim; staff: anonymous on staff stations (and
 * swimmers); member: ambient crowd; extra: class groups and the cast
 * lineup (fixed on a floor station, no AI). */
export type PersonKind = "npc" | "staff" | "member" | "extra"

export type Person = {
	/** Identity across polls: npc:<key>, staff:<piece>:<i>, member:<n>. */
	key: string
	kind: PersonKind
	name: string
	npcKey: string | null
	role: string | null
	out: Outfit
	rig: Rig
	proxy: T.Mesh
	path: [number, number][]
	state: "idle" | "walk" | "use"
	idle: number
	t: number
	station: Station | null
	/** A station this person keeps (staff, swimmers, named NPCs on a target). */
	fixed: Station | null
	after: "use" | "leave" | "idle" | "enter" | "wait" | null
	dest: [number, number, number | undefined] | null
	fin: [number, number] | null
	exitFrom: Station | null
	timer: number
	onscr?: boolean
	needRepath?: boolean
	/** Where a named NPC with nothing to do hangs out. */
	home: { x: number; z: number; face: number } | null
	/** Marked for removal (walking out of the door). */
	leaving: boolean
	/** Pose used instead of the station's (a hero flexing on the stage). */
	poseAs?: PoseName | null
	/** The October ghost already talked this member into one more station. */
	stayed?: boolean
	/** A dog on a lead beside a passer-by (a child of the rig root). */
	dog?: T.Mesh
	/** Walk speed factor (mood). */
	speed?: number
	/** Workout speed factor while being hustled (decays back to 1). */
	boost?: number
	/** Workout speed factor of the room they work out in (its vibe). */
	pace?: number
	/** Extra chip line (the class a member is in). */
	note?: string | null
	/** A trip to someone (a staff round, the ghost haunting): they walk over,
	 * stay a moment, then go back to their post. */
	visit?: {
		kind: "round" | "haunt"
		target: Person
		dwell: number
		onArrive?: () => void
	}
	/** A playful reaction to a tap, playing over their pose. */
	fx?: { kind: "hop" | "trip" | "spin"; t: number; dur: number; y0: number }
}
