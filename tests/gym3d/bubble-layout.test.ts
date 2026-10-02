import { describe, expect, it } from "vitest"
import {
	type BubbleIn,
	type BubbleOut,
	type BubbleView,
	capsFor,
	KIND_PRIO,
	layoutBubbles,
	noOverlap,
	overlaps,
	PLAYER_BOOST,
	priorityOf,
} from "../../src/components/gym3d/world/bubbleLayout.js"

// a phone (390x844) with the HUD + coach on top and the tab bar below
const PHONE: BubbleView = { w: 390, h: 844, top: 120, bottom: 110 }

let ids = 1
const b = (over: Partial<BubbleIn> & Pick<BubbleIn, "kind">): BubbleIn => ({
	id: ids++,
	ax: 195,
	ay: 400,
	w: 120,
	h: 40,
	tail: 8,
	...over,
})

const shown = (items: BubbleIn[], out: BubbleOut[]) =>
	out
		.filter((o) => o.vis)
		.map((o) => {
			const it = items.find((q) => q.id === o.id) as BubbleIn
			return { x: o.x, y: o.y, w: it.w, h: it.h }
		})

const byId = (out: BubbleOut[], id: number) =>
	out.find((o) => o.id === id) as BubbleOut

describe("bubble layout: placement and clamping", () => {
	it("sits centred over its anchor, tail below", () => {
		const s = b({ kind: "speech" })
		const [o] = layoutBubbles([s], PHONE)
		expect(o.vis).toBe(true)
		expect(o.x).toBe(195 - 60)
		expect(o.y).toBe(400 - 8 - 40)
		expect(o.moved).toBe(false)
	})

	it("clamps inside the screen edges and below the HUD", () => {
		const left = b({ kind: "coin", ax: 10, ay: 400 })
		const right = b({ kind: "coin", ax: 385, ay: 600 })
		const high = b({ kind: "timer", ax: 195, ay: 150, edge: true })
		const out = layoutBubbles([left, right, high], PHONE)
		expect(byId(out, left.id).x).toBe(6)
		expect(byId(out, right.id).x + 120).toBeLessThanOrEqual(390 - 6)
		expect(byId(out, high.id).y).toBeGreaterThanOrEqual(120 + 6)
		for (const o of out) expect(o.moved).toBe(true)
	})

	it("stays above the tab bar / sheet", () => {
		const t = b({ kind: "timer", ay: 840, edge: true })
		const [o] = layoutBubbles([t], PHONE)
		expect(o.vis).toBe(true)
		expect(o.y + 40).toBeLessThanOrEqual(844 - 110 - 6)
	})

	it("hides a bubble whose anchor is off screen, but pins an edge one", () => {
		const s = b({ kind: "speech", ax: -300 })
		const t = b({ kind: "timer", ax: -300, edge: true })
		const out = layoutBubbles([s, t], PHONE)
		expect(byId(out, s.id).vis).toBe(false)
		expect(byId(out, t.id).vis).toBe(true)
		expect(byId(out, t.id).x).toBe(6)
	})

	it("hides a speech line whose person is under the HUD", () => {
		const s = b({ kind: "speech", ay: 60 })
		expect(layoutBubbles([s], PHONE)[0].vis).toBe(false)
	})

	it("hides a box too big for the space left", () => {
		const t = b({ kind: "timer", h: 700, edge: true })
		expect(layoutBubbles([t], PHONE)[0].vis).toBe(false)
	})
})

describe("bubble layout: collisions", () => {
	it("never lets two shown bubbles overlap", () => {
		// a crowd: everyone on nearly the same spot
		const items = [
			b({ kind: "info", w: 200, h: 90 }),
			b({ kind: "timer", ax: 200, ay: 420, w: 188, h: 100 }),
			b({ kind: "coin", ax: 180, ay: 395, w: 60, h: 34 }),
			b({ kind: "coin", ax: 215, ay: 405, w: 60, h: 34 }),
			b({ kind: "speech", ax: 190, ay: 398 }),
			b({ kind: "ambient", ax: 205, ay: 402 }),
		]
		const out = layoutBubbles(items, PHONE)
		expect(noOverlap(shown(items, out))).toBe(true)
	})

	it("slides a lower one up out of the way (not down over the person)", () => {
		const a = b({ kind: "coin", ax: 195, ay: 400, w: 60, h: 34 })
		const s = b({ kind: "speech", ax: 195, ay: 400 })
		const out = layoutBubbles([s, a], PHONE)
		const so = byId(out, s.id)
		const co = byId(out, a.id)
		expect(co.moved).toBe(false) // the coin outranks the line
		expect(so.vis).toBe(true)
		expect(so.dy).toBeLessThan(0)
		expect(so.y + 40).toBeLessThanOrEqual(co.y)
		expect(so.moved).toBe(true)
	})

	it("stacks several lines over one spot", () => {
		const items = [
			b({ kind: "speech", ax: 195, ay: 500 }),
			b({ kind: "speech", ax: 197, ay: 502 }),
		]
		const out = layoutBubbles(items, PHONE, { talk: 3, total: 10 })
		expect(out.every((o) => o.vis)).toBe(true)
		expect(noOverlap(shown(items, out))).toBe(true)
	})

	it("hides the lower one when it cannot dodge within reach", () => {
		// a wide card filling the strip the coin could move to
		const card = b({ kind: "info", w: 378, h: 300, ay: 500 })
		const coin = b({ kind: "coin", w: 60, h: 34, ay: 400 })
		const out = layoutBubbles([coin, card], PHONE)
		expect(byId(out, card.id).vis).toBe(true)
		expect(byId(out, coin.id).vis).toBe(false)
	})

	it("keeps last frame's offset while it still works (no jitter)", () => {
		const a = b({ kind: "coin", w: 60, h: 34 })
		const s = b({ kind: "speech" })
		const first = layoutBubbles([a, s], PHONE)
		const off = byId(first, s.id)
		// next frame: the anchor moved a pixel; the same offset still fits
		const s2 = { ...s, ax: 196, prev: { dx: off.dx, dy: off.dy } }
		const second = layoutBubbles([a, s2], PHONE)
		expect(byId(second, s.id).dx).toBe(off.dx)
		expect(byId(second, s.id).dy).toBe(off.dy)
	})

	it("goes back over its anchor once the way is clear", () => {
		const s = b({ kind: "speech", prev: { dx: 0, dy: -60 } })
		const [o] = layoutBubbles([s], PHONE)
		expect(o.dy).toBe(0)
		expect(o.moved).toBe(false)
	})
})

describe("bubble layout: priority and caps", () => {
	it("ranks the chip over timers, coins, lines and chatter", () => {
		expect(KIND_PRIO.info).toBeGreaterThan(KIND_PRIO.timer)
		expect(KIND_PRIO.timer).toBeGreaterThan(KIND_PRIO.coin)
		expect(KIND_PRIO.coin).toBeGreaterThan(KIND_PRIO.speech)
		expect(KIND_PRIO.speech).toBeGreaterThan(KIND_PRIO.ambient)
	})

	it("puts a line the player caused above ambient lines", () => {
		const player = priorityOf({ kind: "speech", boost: PLAYER_BOOST })
		expect(player).toBeGreaterThan(priorityOf({ kind: "speech" }))
		expect(player).toBeLessThan(priorityOf({ kind: "coin" }))
		// one slot left: the player's line wins it, whatever the order
		const amb = b({ kind: "ambient", ax: 100, ay: 300 })
		const mine = b({ kind: "speech", boost: PLAYER_BOOST, ax: 300, ay: 600 })
		const out = layoutBubbles([amb, mine], PHONE, { talk: 1, total: 10 })
		expect(byId(out, mine.id).vis).toBe(true)
		expect(byId(out, amb.id).vis).toBe(false)
	})

	it("the higher priority keeps its spot in a clash", () => {
		const amb = b({ kind: "ambient" })
		const mine = b({ kind: "speech", boost: PLAYER_BOOST })
		const out = layoutBubbles([amb, mine], PHONE)
		expect(byId(out, mine.id).moved).toBe(false)
		expect(byId(out, amb.id).vis ? byId(out, amb.id).moved : true).toBe(true)
	})

	it("caps lines on a phone and boxes overall", () => {
		expect(capsFor(390).talk).toBe(2)
		expect(capsFor(1280).talk).toBe(3)
		const lines = [0, 1, 2, 3].map((i) =>
			b({ kind: "speech", ax: 60 + i * 90, ay: 300 + i * 120, w: 80 }),
		)
		const out = layoutBubbles(lines, PHONE)
		expect(out.filter((o) => o.vis).length).toBe(2)
		const coins = Array.from({ length: 12 }, (_, i) =>
			b({
				kind: "coin",
				w: 50,
				h: 30,
				ax: 40 + (i % 4) * 100,
				ay: 250 + Math.floor(i / 4) * 150,
			}),
		)
		const out2 = layoutBubbles(coins, PHONE, { talk: 2, total: 8 })
		expect(out2.filter((o) => o.vis).length).toBe(8)
	})

	it("keeps input order on ties (older lines first)", () => {
		const s1 = b({ kind: "speech", ax: 100, ay: 300 })
		const s2 = b({ kind: "speech", ax: 300, ay: 600 })
		const out = layoutBubbles([s1, s2], PHONE, { talk: 1, total: 10 })
		expect(byId(out, s1.id).vis).toBe(true)
		expect(byId(out, s2.id).vis).toBe(false)
	})

	it("returns one result per input, in input order", () => {
		const items = [
			b({ kind: "ambient" }),
			b({ kind: "info" }),
			b({ kind: "coin" }),
		]
		const out = layoutBubbles(items, PHONE)
		expect(out.map((o) => o.id)).toEqual(items.map((i) => i.id))
	})
})

describe("bubble layout: tails", () => {
	it("points the tail at the anchor, centred when free", () => {
		const [o] = layoutBubbles([b({ kind: "speech" })], PHONE)
		expect(o.tailless).toBe(false)
		expect(o.tx).toBe(60)
	})

	it("follows the anchor when the box is pushed in from the edge", () => {
		const [o] = layoutBubbles([b({ kind: "coin", ax: 30 })], PHONE)
		expect(o.x).toBe(6)
		expect(o.tailless).toBe(false)
		expect(o.tx).toBe(24)
	})

	it("hides when the anchor is past the box's side", () => {
		const [o] = layoutBubbles([b({ kind: "coin", ax: 2 })], PHONE)
		expect(o.tailless).toBe(true)
	})

	it("hides when the box was lifted off its anchor", () => {
		const a = b({ kind: "coin", w: 60, h: 34 })
		const s = b({ kind: "speech" })
		const out = layoutBubbles([a, s], PHONE)
		expect(byId(out, a.id).tailless).toBe(false)
		expect(byId(out, s.id).tailless).toBe(true)
	})
})

describe("overlaps / noOverlap", () => {
	it("counts the gap", () => {
		const a = { x0: 0, y0: 0, x1: 10, y1: 10 }
		const c = { x0: 12, y0: 0, x1: 20, y1: 10 }
		expect(overlaps(a, c)).toBe(false)
		expect(overlaps(a, c, 4)).toBe(true)
	})

	it("touching edges do not overlap", () => {
		expect(
			noOverlap([
				{ x: 0, y: 0, w: 10, h: 10 },
				{ x: 10, y: 0, w: 10, h: 10 },
			]),
		).toBe(true)
		expect(
			noOverlap([
				{ x: 0, y: 0, w: 10, h: 10 },
				{ x: 9, y: 9, w: 10, h: 10 },
			]),
		).toBe(false)
	})
})

describe("bubble layout: randomized crowds", () => {
	it("never overlaps across many random scenes", () => {
		let seed = 7
		const rnd = () => {
			seed = (seed * 16807) % 2147483647
			return seed / 2147483647
		}
		const kinds = ["info", "timer", "coin", "speech", "ambient"] as const
		for (let n = 0; n < 300; n++) {
			const items: BubbleIn[] = []
			const count = 2 + Math.floor(rnd() * 9)
			for (let i = 0; i < count; i++) {
				const kind = kinds[Math.floor(rnd() * kinds.length)]
				items.push(
					b({
						kind,
						ax: rnd() * 420 - 15,
						ay: 100 + rnd() * 700,
						w: kind === "coin" ? 56 : 90 + rnd() * 100,
						h: kind === "timer" ? 100 : 30 + rnd() * 30,
						edge: kind === "timer" || kind === "info",
					}),
				)
			}
			const out = layoutBubbles(items, PHONE)
			const vis = shown(items, out)
			expect(noOverlap(vis)).toBe(true)
			for (const v of vis) {
				expect(v.x).toBeGreaterThanOrEqual(6)
				expect(v.x + v.w).toBeLessThanOrEqual(390 - 6 + 0.5)
				expect(v.y).toBeGreaterThanOrEqual(120 + 6 - 0.5)
				expect(v.y + v.h).toBeLessThanOrEqual(844 - 110 - 6 + 0.5)
			}
			const talk = out.filter((o, i) => {
				const k = items[i].kind
				return o.vis && (k === "speech" || k === "ambient")
			})
			expect(talk.length).toBeLessThanOrEqual(2)
		}
	})
})
