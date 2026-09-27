// Pure layout seeding for the 3D gym (slice 1). Turns a set of unlocked
// catalog upgrades into rooms on plots and pieces on spots, deterministically,
// so the same unlocks always give the same gym. The DB layer (layout3dStore.ts)
// persists the result; nothing here touches the database.

import {
	decorSlots,
	type EquipmentRoomType,
	itemSize,
	LOBBY_CELL,
	LOBBY_EXTRA_SPOTS,
	LOBBY_FIXTURES,
	LOBBY_OFFICES,
	levelForSpots,
	PD,
	type PlotCell,
	PW,
	ROOM_CELLS,
	ROOM_ORDER,
	type RoomType,
	roomSpots,
} from "../../../shared/gym3d/rooms.js"

export type UnlockedUpgrade = {
	key: string
	category: string
	sortOrder: number
}

export type PieceKind = "equipment" | "decor"

export type PlanRoom = {
	/** Stable reference inside a plan (the DB id for rooms loaded from DB). */
	ref: number
	/** Set for rooms that already exist in the database. */
	id?: number
	type: RoomType
	/** Lot shape the room was built on (slice 1 seeds only "normal"). */
	shape: string
	level: number
	cells: PlotCell[]
}

export type PlanPiece = {
	/** Set for pieces that already exist in the database. */
	id?: number
	kind: PieceKind
	/** Which builder draws it: the upgrade key for equipment, a decor key for decor. */
	itemKey: string
	/** Null for pieces that do not come from a catalog upgrade. */
	upgradeKey: string | null
	roomRef: number
	spotIndex: number | null
	/** World x * 2 (positions live on a half-unit grid). */
	x2: number
	/** World z * 2. */
	z2: number
	/** Quarter turns. */
	rot: number
	locked: boolean
	/** "stored": unlocked gear with no spot (no room, no position). */
	status: "placed" | "stored" | "upgrading"
}

export type LayoutPlan = {
	rooms: PlanRoom[]
	pieces: PlanPiece[]
	/** Unlocked upgrades that have no place in the 3D gym yet, never dropped. */
	unplaced: string[]
}

export type PlanPlot = {
	px: number
	pz: number
	state: "owned"
	lotShape: "normal"
	roomRef: number
}

type Target =
	| { kind: "room"; room: EquipmentRoomType }
	| { kind: "fixture"; x: number; z: number }
	| { kind: "lobbyExtra" }
	| { kind: "decor"; item: string }
	| { kind: "unplaced" }

/** Catalog key -> room. Keys not listed fall back to their category. */
const KEY_ROOM: Readonly<Record<string, EquipmentRoomType>> = {
	lagree_megaformer: "cardio",
	staff_trainer: "weights",
	boxing_ring: "boxing",
	boxing_mitts_station: "boxing",
	punching_bags_heavy_bag_row: "boxing",
	punching_bags_double_end: "boxing",
	hero_spotlight_stage: "boxing",
	swimming_lap_pool: "pool",
	swimming_poolside_loungers: "pool",
	amenity_juice: "juice",
	amenity_water: "juice",
	staff_nutrition: "juice",
	amenity_sauna: "recovery",
	amenity_showers: "recovery",
	staff_massage: "recovery",
	staff_physio: "recovery",
	// the owner's lounge suite is Juice bar gear (the social hub)
	staff_ownership_suite: "juice",
}

/** Catalog key -> free-standing decor builder. */
export const DECOR_ITEM: Readonly<Record<string, string>> = {
	decor_posters: "poster",
	decor_plants: "palm",
	decor_mirrors: "mirror",
	decor_trophy: "trophy",
	decor_neon: "neon",
	lagree_studio_mirror: "studio_mirror",
}

/** Staff pieces that stand in the lobby (no room of their own yet). */
const LOBBY_EXTRA_KEYS = new Set(["staff_assistant_trainer"])

const CATEGORY_ROOM: Readonly<Record<string, EquipmentRoomType>> = {
	cardio: "cardio",
	lagree: "cardio",
	weights: "weights",
	boxing: "boxing",
	punching_bags: "boxing",
	hero: "boxing",
	swimming: "pool",
	amenities: "recovery",
}

export function targetFor(u: UnlockedUpgrade): Target {
	const fx = LOBBY_FIXTURES.find((f) => f.key === u.key)
	if (fx) return { kind: "fixture", x: fx.x, z: fx.z }
	const office = LOBBY_OFFICES.find((f) => f.key === u.key)
	if (office) return { kind: "fixture", x: office.x, z: office.z }
	if (LOBBY_EXTRA_KEYS.has(u.key)) return { kind: "lobbyExtra" }
	const decor = DECOR_ITEM[u.key]
	if (decor) return { kind: "decor", item: decor }
	const room = KEY_ROOM[u.key] ?? CATEGORY_ROOM[u.category]
	if (room) return { kind: "room", room }
	if (u.category === "decor") return { kind: "decor", item: "plant" }
	return { kind: "unplaced" }
}

const cellKey = (c: PlotCell) => `${c.px},${c.pz}`
const half = (v: number) => Math.round(v * 2)

/** A gym with only the lobby: reception and lockers are fixed furniture. */
export function lobbyOnlyPlan(): LayoutPlan {
	const lobby: PlanRoom = {
		ref: 1,
		type: "lobby",
		shape: "normal",
		level: 1,
		cells: [{ ...LOBBY_CELL }],
	}
	return {
		rooms: [lobby],
		pieces: LOBBY_FIXTURES.map((f) => ({
			kind: "equipment" as const,
			itemKey: f.key,
			upgradeKey: f.key,
			roomRef: lobby.ref,
			spotIndex: null,
			x2: half(LOBBY_CELL.px * PW + f.x),
			z2: half(LOBBY_CELL.pz * PD + f.z),
			rot: 0,
			locked: true,
			status: "placed" as const,
		})),
		unplaced: [],
	}
}

function clonePlan(p: LayoutPlan): LayoutPlan {
	return {
		rooms: p.rooms.map((r) => ({
			...r,
			cells: r.cells.map((c) => ({ ...c })),
		})),
		pieces: p.pieces.map((x) => ({ ...x })),
		unplaced: [...p.unplaced],
	}
}

function byUnlockOrder(a: UnlockedUpgrade, b: UnlockedUpgrade): number {
	return (
		a.sortOrder - b.sortOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
	)
}

export type PlaceOpts = {
	/** Open a room (on the next free cell) for a category with no room yet
	 * and fill bonus spots, raising the room's level: only while seeding a
	 * gym's first layout. Afterwards the player builds rooms, and new gear
	 * goes to an open spot of a room of its type or else to storage. */
	newRooms?: boolean
}

/** The room type a catalog upgrade belongs in, or null (fixtures, lobby
 * offices, decor, lobby staff). */
export function roomTypeFor(u: UnlockedUpgrade): EquipmentRoomType | null {
	const t = targetFor(u)
	return t.kind === "room" ? t.room : null
}

/** Places every upgrade in `missing` that the plan does not already hold
 * (placed, stored or unplaced) and returns the new plan. Idempotent: placing
 * the same keys twice changes nothing. Never mutates `plan`. */
export function placeNewUnlocks(
	plan: LayoutPlan,
	missing: readonly UnlockedUpgrade[],
	opts: PlaceOpts = { newRooms: true },
): LayoutPlan {
	const newRooms = opts.newRooms !== false
	const next = clonePlan(plan)
	const known = new Set<string>([
		...next.pieces.flatMap((p) => (p.upgradeKey ? [p.upgradeKey] : [])),
		...next.unplaced,
	])
	const seen = new Set<string>()
	const todo = missing
		.filter((u) => {
			if (known.has(u.key) || seen.has(u.key)) return false
			seen.add(u.key)
			return true
		})
		.slice()
		.sort(byUnlockOrder)
	if (!todo.length) return next

	const unplace = (key: string) => next.unplaced.push(key)
	let lobby = next.rooms.find((r) => r.type === "lobby")
	if (!lobby) {
		lobby = lobbyOnlyPlan().rooms[0]
		lobby.ref = Math.max(0, ...next.rooms.map((r) => r.ref)) + 1
		next.rooms.push(lobby)
	}
	const lobbyRoom = lobby

	const byRoom = new Map<EquipmentRoomType, UnlockedUpgrade[]>()
	const decor: { u: UnlockedUpgrade; item: string }[] = []
	const extras: UnlockedUpgrade[] = []
	for (const u of todo) {
		const t = targetFor(u)
		if (t.kind === "room") {
			const list = byRoom.get(t.room) ?? []
			list.push(u)
			byRoom.set(t.room, list)
		} else if (t.kind === "fixture") {
			next.pieces.push({
				kind: "equipment",
				itemKey: u.key,
				upgradeKey: u.key,
				roomRef: lobbyRoom.ref,
				spotIndex: null,
				x2: half(lobbyRoom.cells[0].px * PW + t.x),
				z2: half(lobbyRoom.cells[0].pz * PD + t.z),
				rot: 0,
				locked: true,
				status: "placed",
			})
		} else if (t.kind === "lobbyExtra") extras.push(u)
		else if (t.kind === "decor") decor.push({ u, item: t.item })
		else unplace(u.key)
	}

	// Equipment rooms, in the fixed room order so seeding is deterministic.
	const store = (u: UnlockedUpgrade) =>
		next.pieces.push({
			kind: "equipment",
			itemKey: u.key,
			upgradeKey: u.key,
			roomRef: 0,
			spotIndex: null,
			x2: 0,
			z2: 0,
			rot: 0,
			locked: false,
			status: "stored",
		})
	const usedCells = new Set(next.rooms.flatMap((r) => r.cells.map(cellKey)))
	for (const type of ROOM_ORDER) {
		const items = byRoom.get(type)
		if (!items?.length) continue
		// gear fills the rooms of its type in the order they were built
		const rooms = next.rooms
			.filter((r) => r.type === type)
			.sort((a, b) => a.ref - b.ref)
		if (!rooms.length && newRooms) {
			const cell = ROOM_CELLS.find((c) => !usedCells.has(cellKey(c)))
			if (cell) {
				usedCells.add(cellKey(cell))
				const room: PlanRoom = {
					ref: Math.max(0, ...next.rooms.map((r) => r.ref)) + 1,
					type,
					shape: "normal",
					level: 1,
					cells: [{ ...cell }],
				}
				next.rooms.push(room)
				rooms.push(room)
			}
		}
		const state = rooms.map((r) => {
			const spots = roomSpots(type, r.cells)
			return {
				r,
				spots,
				used: new Set(
					next.pieces
						.filter((p) => p.roomRef === r.ref && p.spotIndex != null)
						.map((p) => p.spotIndex as number),
				),
				order: spots
					.filter((sp) => newRooms || sp.unlock <= r.level)
					.sort((a, b) => a.unlock - b.unlock || a.index - b.index),
			}
		})
		for (const u of items) {
			const size = itemSize(u.key, "equipment")
			let placed = false
			for (const st of state) {
				const spot = st.order.find(
					(sp) => sp.size === size && !st.used.has(sp.index),
				)
				if (!spot) continue
				st.used.add(spot.index)
				next.pieces.push({
					kind: "equipment",
					itemKey: u.key,
					upgradeKey: u.key,
					roomRef: st.r.ref,
					spotIndex: spot.index,
					x2: half(spot.x),
					z2: half(spot.z),
					rot: 0,
					locked: false,
					status: "placed",
				})
				placed = true
				break
			}
			if (placed) continue
			// no room had space: seeding lists it (as slice 1 did), later
			// unlocks wait in storage for the player to place
			if (newRooms) unplace(u.key)
			else store(u)
		}
		if (newRooms)
			for (const st of state)
				st.r.level = Math.max(st.r.level, levelForSpots(st.spots, st.used))
	}

	// Staff pieces with no room of their own stand in the lobby.
	const lx = lobbyRoom.cells[0].px * PW
	const lz = lobbyRoom.cells[0].pz * PD
	for (const u of extras) {
		const free = LOBBY_EXTRA_SPOTS.find(
			(s) =>
				!next.pieces.some(
					(p) => p.x2 === half(lx + s.x) && p.z2 === half(lz + s.z),
				),
		)
		if (!free) {
			unplace(u.key)
			continue
		}
		next.pieces.push({
			kind: "equipment",
			itemKey: u.key,
			upgradeKey: u.key,
			roomRef: lobbyRoom.ref,
			spotIndex: null,
			x2: half(lx + free.x),
			z2: half(lz + free.z),
			rot: 0,
			locked: false,
			status: "placed",
		})
	}

	// Decor fills the lobby's decor places first, then each room's in turn.
	if (decor.length) {
		const rooms = [
			lobbyRoom,
			...next.rooms
				.filter((r) => r !== lobbyRoom)
				.sort((a, b) => a.ref - b.ref),
		]
		const slots = rooms.flatMap((r) =>
			decorSlots(r.type).map((s) => ({
				room: r,
				x2: half(r.cells[0].px * PW + s.x),
				z2: half(r.cells[0].pz * PD + s.z),
			})),
		)
		const taken = new Set(next.pieces.map((p) => `${p.x2},${p.z2}`))
		for (const { u, item } of decor) {
			const slot = slots.find((s) => !taken.has(`${s.x2},${s.z2}`))
			if (!slot) {
				unplace(u.key)
				continue
			}
			taken.add(`${slot.x2},${slot.z2}`)
			next.pieces.push({
				kind: "decor",
				itemKey: item,
				upgradeKey: u.key,
				roomRef: slot.room.ref,
				spotIndex: null,
				x2: slot.x2,
				z2: slot.z2,
				rot: 0,
				locked: false,
				status: "placed",
			})
		}
	}
	return next
}

/** The first layout of a gym: the lobby plus a room for every category
 * that has an unlocked upgrade. */
export function deriveInitialLayout(
	unlocked: readonly UnlockedUpgrade[],
): LayoutPlan {
	return placeNewUnlocks(lobbyOnlyPlan(), unlocked)
}

/** Owned plots of a plan: one per room cell. */
export function planPlots(plan: LayoutPlan): PlanPlot[] {
	return plan.rooms.flatMap((r) =>
		r.cells.map((c) => ({
			px: c.px,
			pz: c.pz,
			state: "owned" as const,
			lotShape: "normal" as const,
			roomRef: r.ref,
		})),
	)
}
