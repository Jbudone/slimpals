// One layout pass for every bubble drawn over the gym canvas: the tap chip
// (info card), job timer cards, coin bubbles and speech / ambient lines.
// Pure (no DOM): the label layer feeds it screen anchors and measured sizes
// each frame and writes back the transforms it returns.
//
// Rules, in order:
//  - higher priority places first (the player's chip, then timers, coins,
//    lines the player caused, then ambient chatter); ties keep input order
//  - each box is kept inside the view (HUD above, sheet / tab bar below)
//  - a box that would cover one already placed slides up, or sideways, by
//    as little as it can (within its kind's reach); failing that it hides
//  - at most `caps.talk` speech + ambient lines and `caps.total` boxes show
//  - a box whose anchor left the screen hides, unless it is an edge box
//    (timer cards stay pinned to the nearest edge)

export type BubbleKind = "info" | "timer" | "coin" | "speech" | "ambient"

/** Base priority per kind; `boost` on an item lifts it within or above. */
export const KIND_PRIO: Record<BubbleKind, number> = {
	info: 100,
	timer: 80,
	coin: 70,
	speech: 50,
	ambient: 30,
}

/** A line the player caused (a ticked task, a claim) outranks chatter
 * but not the cards the player acts on. */
export const PLAYER_BOOST = 15

/** How far (px) a box may slide away from its anchor to dodge another. */
const REACH: Record<BubbleKind, { x: number; y: number }> = {
	info: { x: 0, y: 0 },
	timer: { x: 120, y: 140 },
	coin: { x: 70, y: 70 },
	speech: { x: 110, y: 110 },
	ambient: { x: 90, y: 90 },
}

/** How close (px) a tail may get to a box's side. */
const TAIL_IN = 14

/** Space kept between two boxes. */
export const BUBBLE_GAP = 4

export type BubbleIn = {
	id: number
	kind: BubbleKind
	/** Extra priority (player-triggered lines). */
	boost?: number
	/** Anchor on screen (the tail's tip), CSS px. */
	ax: number
	ay: number
	/** Measured box size. */
	w: number
	h: number
	/** Space between the anchor and the box's bottom (the tail). */
	tail: number
	/** Pinned to the nearest edge when the anchor is off screen. */
	edge?: boolean
	/** Offset used last frame, kept while it still works (no jitter). */
	prev?: { dx: number; dy: number } | null
}

export type BubbleOut = {
	id: number
	vis: boolean
	/** Top-left of the box. */
	x: number
	y: number
	/** Offset from where the anchor alone would put it (after clamping). */
	dx: number
	dy: number
	/** Not where its anchor puts it (clamped or slid aside). */
	moved: boolean
	/** Its tail cannot reach the anchor (the box sits higher or lower than
	 * the tail allows, or the anchor is past its side): hide the tail. */
	tailless: boolean
	/** Where the tail goes, from the box's left edge (follows the anchor
	 * when the box was pushed sideways). */
	tx: number
}

export type BubbleView = {
	w: number
	h: number
	/** Space kept free at the top (HUD, coach) and bottom (sheet, tabs). */
	top: number
	bottom: number
	/** Margin from the edges. */
	pad?: number
}

export type BubbleCaps = { talk: number; total: number }

/** Phones get fewer lines at once. */
export function capsFor(w: number): BubbleCaps {
	return w < 520 ? { talk: 2, total: 8 } : { talk: 3, total: 12 }
}

export type Box = { x0: number; y0: number; x1: number; y1: number }

export function overlaps(a: Box, b: Box, gap = 0): boolean {
	return (
		a.x0 < b.x1 + gap &&
		b.x0 < a.x1 + gap &&
		a.y0 < b.y1 + gap &&
		b.y0 < a.y1 + gap
	)
}

export function priorityOf(b: Pick<BubbleIn, "kind" | "boost">): number {
	return KIND_PRIO[b.kind] + (b.boost ?? 0)
}

const hidden = (id: number): BubbleOut => ({
	id,
	vis: false,
	x: 0,
	y: 0,
	dx: 0,
	dy: 0,
	moved: false,
	tailless: true,
	tx: 0,
})

export function layoutBubbles(
	items: readonly BubbleIn[],
	view: BubbleView,
	caps: BubbleCaps = capsFor(view.w),
): BubbleOut[] {
	const pad = view.pad ?? 6
	const minY = view.top + pad
	const maxY = view.h - view.bottom - pad
	const order = items
		.map((b, i) => ({ b, i, p: priorityOf(b) }))
		.sort((a, c) => c.p - a.p || a.i - c.i)
	const placed: Box[] = []
	const out = new Map<number, BubbleOut>()
	let talk = 0
	for (const { b } of order) {
		const isTalk = b.kind === "speech" || b.kind === "ambient"
		if (
			placed.length >= caps.total ||
			(isTalk && talk >= caps.talk) ||
			b.w <= 0 ||
			b.h <= 0 ||
			b.w > view.w - pad * 2 ||
			b.h > maxY - minY
		) {
			out.set(b.id, hidden(b.id))
			continue
		}
		// anchor off screen: hide, or (edge boxes) pin to the nearest edge
		const off =
			b.ax < -b.w / 2 ||
			b.ax > view.w + b.w / 2 ||
			b.ay < minY ||
			b.ay - b.tail - b.h > maxY
		if (off && !b.edge) {
			out.set(b.id, hidden(b.id))
			continue
		}
		const clampX = (x: number) => Math.min(Math.max(x, pad), view.w - pad - b.w)
		const clampY = (y: number) => Math.min(Math.max(y, minY), maxY - b.h)
		const bx = clampX(b.ax - b.w / 2)
		const by = clampY(b.ay - b.tail - b.h)
		const clamped =
			Math.abs(bx - (b.ax - b.w / 2)) > 1 ||
			Math.abs(by - (b.ay - b.tail - b.h)) > 1
		const tip = b.ay - b.tail - b.h
		const reach = REACH[b.kind]
		const fits = (x: number, y: number): boolean => {
			const box = { x0: x, y0: y, x1: x + b.w, y1: y + b.h }
			for (const q of placed) if (overlaps(box, q, BUBBLE_GAP)) return false
			return true
		}
		let pick: { x: number; y: number } | null = null
		if (fits(bx, by)) pick = { x: bx, y: by }
		else {
			// last frame's offset first, so a box does not hop about
			const pv = b.prev
			if (pv && (pv.dx || pv.dy)) {
				const x = clampX(bx + pv.dx)
				const y = clampY(by + pv.dy)
				if (
					Math.abs(x - bx) <= reach.x &&
					Math.abs(y - by) <= reach.y &&
					fits(x, y)
				)
					pick = { x, y }
			}
		}
		if (!pick && (reach.x || reach.y)) {
			// candidate edges: just above / beside every box placed so far
			const xs = [bx]
			const ys = [by]
			for (const q of placed) {
				ys.push(q.y0 - BUBBLE_GAP - b.h - 0.5, q.y1 + BUBBLE_GAP + 0.5)
				xs.push(q.x1 + BUBBLE_GAP + 0.5, q.x0 - BUBBLE_GAP - b.w - 0.5)
			}
			let best = Number.POSITIVE_INFINITY
			for (const x0 of xs)
				for (const y0 of ys) {
					const x = clampX(x0)
					const y = clampY(y0)
					const dx = Math.abs(x - bx)
					const dy = y - by
					if (dx > reach.x || Math.abs(dy) > reach.y) continue
					// up is cheaper than down (down covers the person), and
					// straight up cheaper than sideways
					const cost = dx * 1.3 + (dy < 0 ? -dy : dy * 2.5)
					if (cost >= best || !fits(x, y)) continue
					best = cost
					pick = { x, y }
				}
		}
		if (!pick) {
			out.set(b.id, hidden(b.id))
			continue
		}
		const x = Math.round(pick.x)
		const y = Math.round(pick.y)
		placed.push({ x0: x, y0: y, x1: x + b.w, y1: y + b.h })
		if (isTalk) talk++
		const dx = x - Math.round(bx)
		const dy = y - Math.round(by)
		out.set(b.id, {
			id: b.id,
			vis: true,
			x,
			y,
			dx,
			dy,
			moved: clamped || Math.abs(dx) > 1 || Math.abs(dy) > 1,
			tailless:
				Math.abs(y - tip) > 1 || b.ax < x + TAIL_IN || b.ax > x + b.w - TAIL_IN,
			tx: Math.round(Math.min(Math.max(b.ax - x, TAIL_IN), b.w - TAIL_IN)),
		})
	}
	return items.map((b) => out.get(b.id) ?? hidden(b.id))
}

/** True when no two shown boxes overlap (tests, tooling). */
export function noOverlap(
	boxes: readonly { x: number; y: number; w: number; h: number }[],
): boolean {
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i]
			const b = boxes[j]
			if (
				overlaps(
					{ x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h },
					{ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h },
				)
			)
				return false
		}
	return true
}
