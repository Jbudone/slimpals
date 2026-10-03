// What a tap on the gym means. Pure (no three.js): app.ts raycasts and
// sorts the hits into categories; this file decides which one wins and
// whether a press was a tap at all.
//
// Priority: people > equipment > room > floor. Within a category the
// nearest hit wins. "Equipment" is anything the player builds on (pieces,
// empty spots, construction sites, the kitchen kiosk); "room" is a room's
// floor or walls and lots for sale; "floor" is open ground (no selection).
//
// One exception keeps busy gear tappable: a member (not a named NPC)
// working out on the very piece the ray also hit gives way to that piece.
// Named NPCs always win (Talk).

export type HitCat = "person" | "gear" | "room" | "floor"

export const HIT_RANK: Readonly<Record<HitCat, number>> = {
	person: 0,
	gear: 1,
	room: 2,
	floor: 3,
}

export type Hit<S> = {
	cat: HitCat
	/** Distance along the ray (world units). */
	dist: number
	/** What selecting it means (null: nothing, e.g. open ground). */
	sel: S | null
	/** A piece hit: its id. */
	piece?: number
	/** A person hit: the piece they are working out on, when they are an
	 * unnamed member (they give way to it). */
	busyOn?: number
}

/** The hit a tap selects: the best category, then the nearest. */
export function bestHit<
	H extends { cat: HitCat; dist: number; piece?: number; busyOn?: number },
>(hits: readonly H[]): H | null {
	let best: H | null = null
	for (const h of hits) {
		if (
			h.busyOn != null &&
			hits.some((q) => q.cat === "gear" && q.piece === h.busyOn)
		)
			continue
		if (
			!best ||
			HIT_RANK[h.cat] < HIT_RANK[best.cat] ||
			(HIT_RANK[h.cat] === HIT_RANK[best.cat] && h.dist < best.dist)
		)
			best = h
	}
	return best
}

/** Pixels a pointer may move before the press turns into a pan. The same
 * number decides when the camera starts to move, so whatever panned the
 * view was never a tap. */
export const TAP_SLOP = 6

/** A press longer than this is not a tap (ms). */
export const TAP_MS = 600

/** True when a released press counts as a tap: it stayed within the slop,
 * was short, never panned, and no other finger is still down. */
export function isTap(p: {
	moved: number
	ms: number
	panned: boolean
	others: number
}): boolean {
	return !p.panned && p.others === 0 && p.moved <= TAP_SLOP && p.ms < TAP_MS
}
