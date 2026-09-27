// Room types, spot tables and paint defaults for the 3D gym (ported from the
// Build Lab v3 prototype, art/3d/build-lab.html). Pure data + pure functions:
// no three.js here, so the server can derive layouts and the client can draw
// the same spots from the same tables.

/** Plot (one room cell) width along x, in world units. */
export const PW = 9
/** Plot depth along z, in world units. */
export const PD = 6
/** Path-finding grid cell size. */
export const CELL = 0.5

/** Spot layouts are versioned so a later layout change can migrate rooms
 * that were seeded with an older table (stored as gym_rooms.layout_version). */
export const LAYOUT_VERSION = 1

export type RoomType =
	| "lobby"
	| "cardio"
	| "weights"
	| "boxing"
	| "pool"
	| "recovery"
	| "juice"

export type EquipmentRoomType = Exclude<RoomType, "lobby">

export type RoomLayoutKind = "grid" | "pool" | "ring"

export type RoomTypeDef = {
	name: string
	desc: string
	thumb: string
	layout: RoomLayoutKind
	/** Level 1 spot options (2 x 2). */
	basic: string[]
	/** Bonus-spot options (2 x 2, unlocked at Lv 2 / Lv 3). */
	premium: string[]
	/** Options for the one 3 x 3 spot of a pool / ring layout. */
	big?: string[]
}

// Same room types as the prototype's RT, trimmed to the rooms slice 1 can
// seed from the real upgrade catalog (no Sports court: nothing unlocks it
// yet). Boxing gets a "ring" layout with one 3 x 3 spot because the real
// catalog has a boxing ring, which the prototype only had as a free piece.
export const RT: Record<EquipmentRoomType, RoomTypeDef> = {
	cardio: {
		name: "Cardio",
		thumb: "cardio_treadmill",
		desc: "Treadmills, bikes, rowers",
		layout: "grid",
		basic: [
			"cardio_treadmill",
			"cardio_bikes",
			"cardio_rowing",
			"cardio_stairs",
		],
		premium: ["cardio_cinema", "lagree_megaformer"],
	},
	weights: {
		name: "Weights",
		thumb: "weights_smith",
		desc: "Racks, benches, platforms",
		layout: "grid",
		basic: [
			"weights_dumbbells",
			"weights_barbell",
			"weights_cable",
			"weights_smith",
		],
		premium: ["weights_olympic", "staff_trainer"],
	},
	boxing: {
		name: "Boxing",
		thumb: "punching_bags_heavy_bag_row",
		desc: "Bags, pads, a ring",
		layout: "ring",
		big: ["boxing_ring"],
		basic: [
			"punching_bags_heavy_bag_row",
			"punching_bags_double_end",
			"boxing_mitts_station",
		],
		premium: ["hero_spotlight_stage"],
	},
	pool: {
		name: "Pool",
		thumb: "swimming_lap_pool",
		desc: "One big pool spot + poolside",
		layout: "pool",
		big: ["swimming_lap_pool"],
		basic: ["swimming_poolside_loungers"],
		premium: [],
	},
	recovery: {
		name: "Recovery",
		thumb: "amenity_sauna",
		desc: "Sauna, showers, massage",
		layout: "grid",
		basic: ["amenity_showers", "staff_massage", "amenity_sauna"],
		premium: ["staff_physio"],
	},
	juice: {
		name: "Juice bar",
		thumb: "amenity_juice",
		desc: "Smoothies and water",
		layout: "grid",
		basic: ["amenity_juice", "amenity_water"],
		premium: ["staff_nutrition"],
	},
}

/** A spot row: [x, z, size, unlockLevel], x/z relative to the plot corner. */
export type SpotDef = readonly [number, number, number, number]

export const LAYOUT_GRID: readonly SpotDef[] = [
	[1.5, 1.5, 2, 1],
	[7.5, 1.5, 2, 1],
	[1.5, 4.5, 2, 1],
	[7.5, 4.5, 2, 1],
	[4.5, 1.5, 2, 2],
	[4.5, 4.5, 2, 3],
]
export const LAYOUT_POOL: readonly SpotDef[] = [
	[2, 3, 3, 1],
	[7.5, 1.5, 2, 1],
	[7.5, 4.5, 2, 1],
	[5, 1.5, 2, 2],
	[5, 4.5, 2, 3],
]
// Boxing: the ring sits against the back wall in the middle, bags in the
// corners, so the side doorways (z 2..4) stay open.
export const LAYOUT_RING: readonly SpotDef[] = [
	[4.5, 2, 3, 1],
	[1.5, 1.5, 2, 1],
	[7.5, 1.5, 2, 1],
	[1.5, 4.5, 2, 1],
	[7.5, 4.5, 2, 2],
	[4.5, 4.8, 2, 3],
]
/** Big 18 x 12 rooms (Pool hall / Sports court); unused until slice 2+. */
export const LAYOUT_BIG: readonly SpotDef[] = [
	[5, 6, 7, 1],
	[11.5, 1.75, 2, 1],
	[15.75, 1.75, 2, 1],
	[11.5, 10.25, 2, 1],
	[15.75, 10.25, 2, 1],
	[13.25, 6, 2, 2],
	[16.5, 6, 2, 3],
]

/** Room-level thresholds (points needed for Lv 2..5) from the prototype. */
export const LV_TH: Readonly<Record<number, number>> = {
	2: 3,
	3: 5,
	4: 8,
	5: 12,
}

export type FloorStyle =
	| "checker"
	| "wood"
	| "rubber"
	| "tile"
	| "terrazzo"
	| "concrete"

export type RoomPaint = {
	wall: string
	floorStyle: FloorStyle
	floorColor: string
}

export const PAINT: Record<RoomType | "empty", RoomPaint> = {
	lobby: { wall: "#f4c9a0", floorStyle: "checker", floorColor: "#f3e3cc" },
	empty: { wall: "#efe3d6", floorStyle: "concrete", floorColor: "#cfc6bd" },
	cardio: { wall: "#9fd3cf", floorStyle: "rubber", floorColor: "#4a5060" },
	weights: { wall: "#f4c9a0", floorStyle: "wood", floorColor: "#c98b56" },
	boxing: { wall: "#f2a98f", floorStyle: "rubber", floorColor: "#6a3a3f" },
	pool: { wall: "#bfe3f0", floorStyle: "tile", floorColor: "#d6eef4" },
	recovery: { wall: "#e6d6f0", floorStyle: "wood", floorColor: "#e0c29a" },
	juice: { wall: "#f7d38a", floorStyle: "terrazzo", floorColor: "#f6e6c8" },
}

export const FLOOR_STYLES: readonly FloorStyle[] = [
	"checker",
	"wood",
	"rubber",
	"tile",
	"terrazzo",
	"concrete",
]

export function isRoomType(t: string): t is RoomType {
	return t === "lobby" || t in RT
}

export function roomName(type: string): string {
	if (type === "lobby") return "Lobby"
	if (type in RT) return `${RT[type as EquipmentRoomType].name} room`
	return "Room"
}

/** Footprint (in tiles) of each catalog piece. Everything not listed is 2. */
export const ITEM_SIZE: Readonly<Record<string, number>> = {
	boxing_ring: 3,
	swimming_lap_pool: 3,
}
export const DECOR_SIZE = 0.5

export function itemSize(itemKey: string, kind: "equipment" | "decor"): number {
	if (kind === "decor") return DECOR_SIZE
	return ITEM_SIZE[itemKey] ?? 2
}

export type PlotCell = { px: number; pz: number }

export type Spot = {
	index: number
	/** World x of the spot centre. */
	x: number
	/** World z of the spot centre. */
	z: number
	size: number
	/** Room level at which the spot opens. */
	unlock: number
}

function layoutFor(type: RoomType): readonly SpotDef[] {
	if (type === "lobby") return []
	const kind = RT[type].layout
	return kind === "pool"
		? LAYOUT_POOL
		: kind === "ring"
			? LAYOUT_RING
			: LAYOUT_GRID
}

/** The spots of a room in world coordinates. The first cell gets the full
 * layout; every extra cell of a wide / L / big room adds two spots (as in
 * the prototype's roomLayout). */
export function roomSpots(
	type: RoomType,
	cells: readonly PlotCell[],
	layoutVersion: number = LAYOUT_VERSION,
): Spot[] {
	// Only version 1 exists so far; the parameter pins the table in use.
	void layoutVersion
	const out: Spot[] = []
	const base = layoutFor(type)
	if (!base.length) return out
	cells.forEach((c, k) => {
		const defs: readonly SpotDef[] =
			k === 0
				? base
				: [
						[2.5, 3, 2, 1],
						[6.5, 3, 2, Math.min(5, 2 + k)],
					]
		for (const d of defs) {
			out.push({
				index: out.length,
				x: c.px * PW + d[0],
				z: c.pz * PD + d[1],
				size: d[2],
				unlock: d[3],
			})
		}
	})
	return out
}

/** The smallest room level that opens every spot in `spotIndices`. */
export function levelForSpots(
	spots: readonly Spot[],
	spotIndices: Iterable<number>,
): number {
	let lv = 1
	for (const i of spotIndices) {
		const s = spots[i]
		if (s && s.unlock > lv) lv = s.unlock
	}
	return lv
}

// ── The lobby ───────────────────────────────────────────────────────────────

/** Front-row cell of the lobby; the street door sits in its front wall. */
export const LOBBY_CELL: PlotCell = { px: 1, pz: 2 }
/** Rows of plots in the neighbourhood; the lobby row is the front row. */
export const WORLD_ROWS = 3

/** Fixed lobby furniture, placed whether or not its upgrade is claimed yet.
 * x/z are relative to the lobby plot corner. */
export const LOBBY_FIXTURES: readonly { key: string; x: number; z: number }[] =
	[
		{ key: "staff_reception", x: 7, z: 2.5 },
		{ key: "amenity_lockers", x: 1.5, z: 1 },
	]

/** Extra 2 x 2 places in the lobby for staff pieces that have no room. */
export const LOBBY_EXTRA_SPOTS: readonly { x: number; z: number }[] = [
	{ x: 1.5, z: 4.5 },
]

/** Cells for new rooms, all connected to the lobby through shared walls. */
export const ROOM_CELLS: readonly PlotCell[] = [
	{ px: 1, pz: 1 },
	{ px: 0, pz: 2 },
	{ px: 2, pz: 2 },
	{ px: 0, pz: 1 },
	{ px: 2, pz: 1 },
	{ px: 1, pz: 0 },
	{ px: 0, pz: 0 },
	{ px: 2, pz: 0 },
	{ px: 3, pz: 2 },
	{ px: 3, pz: 1 },
	{ px: 3, pz: 0 },
]

/** Order in which room types claim cells when several appear at once. */
export const ROOM_ORDER: readonly EquipmentRoomType[] = [
	"cardio",
	"weights",
	"boxing",
	"recovery",
	"juice",
	"pool",
]

/** Free-standing decor places (0.5 x 0.5), relative to the plot corner:
 * dead ends of corridors and wall corners, clear of spots and doorways. */
export function decorSlots(
	type: RoomType,
): readonly { x: number; z: number }[] {
	if (type === "lobby")
		return [
			{ x: 3, z: 0.5 },
			{ x: 6, z: 0.5 },
			{ x: 8.5, z: 5 },
			{ x: 6.5, z: 5.5 },
		]
	const kind = RT[type].layout
	if (kind === "pool")
		return [
			{ x: 1, z: 0.5 },
			{ x: 2.5, z: 0.5 },
			{ x: 1, z: 5.5 },
			{ x: 2.5, z: 5.5 },
		]
	if (kind === "ring")
		return [
			{ x: 3, z: 5.5 },
			{ x: 6, z: 5.5 },
		]
	return [
		{ x: 3, z: 0.5 },
		{ x: 6, z: 0.5 },
		{ x: 3, z: 5.5 },
		{ x: 6, z: 5.5 },
	]
}

/** Doorway gaps: every wall between two built plots of different rooms
 * has a 2-unit gap centred on it; the street door is centred on the lobby
 * front wall. */
export const DOOR_HALF = 1
