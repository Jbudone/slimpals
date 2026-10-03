import { describe, expect, it } from "vitest"
import {
	type BubbleIn,
	type BubbleOut,
	type BubbleView,
	KIND_PRIO,
	layoutBubbles,
	noOverlap,
} from "../../src/components/gym3d/world/bubbleLayout.js"

// Tags (today's event, class banners, hero and name tags) go through the
// bubble layout too (#137): on screen, and never over a bubble.

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

const box = (items: BubbleIn[], o: BubbleOut) => {
	const it = items.find((q) => q.id === o.id) as BubbleIn
	return { x: o.x, y: o.y, w: it.w, h: it.h }
}

const shown = (items: BubbleIn[], out: BubbleOut[]) =>
	out.filter((o) => o.vis).map((o) => box(items, o))

/** "🎫 6pm Boxing Class in session!" as a phone draws it. */
const banner = (ax: number, ay = 420) =>
	b({ kind: "tag", boost: 5, ax, ay, w: 214, h: 24, tail: 2 })

describe("tags in the bubble layout", () => {
	it("tags rank below speech (tappable) and above ambient lines", () => {
		expect(KIND_PRIO.tag).toBeLessThan(KIND_PRIO.speech)
		expect(KIND_PRIO.tag).toBeGreaterThan(KIND_PRIO.ambient)
	})

	it("a class banner near either edge stays wholly on screen", () => {
		for (const ax of [4, 30, 100, 290, 360, 386]) {
			const items = [banner(ax)]
			const [o] = layoutBubbles(items, PHONE)
			expect(o.vis).toBe(true)
			expect(o.x).toBeGreaterThanOrEqual(0)
			expect(o.x + 214).toBeLessThanOrEqual(PHONE.w)
			expect(o.y).toBeGreaterThanOrEqual(PHONE.top)
		}
	})

	it("a banner just under the HUD is pushed down into view, not cut", () => {
		const items = [banner(195, PHONE.top + 10)]
		const [o] = layoutBubbles(items, PHONE)
		expect(o.vis).toBe(true)
		expect(o.y).toBeGreaterThanOrEqual(PHONE.top)
	})

	it("a banner whose anchor is off screen hides (it is not pinned)", () => {
		const items = [banner(-300)]
		expect(layoutBubbles(items, PHONE)[0].vis).toBe(false)
	})

	it("a speech line over the same spot moves clear of the banner", () => {
		const items = [
			banner(195, 420),
			b({ kind: "speech", ax: 200, ay: 425, w: 150, h: 44 }),
		]
		const out = layoutBubbles(items, PHONE)
		expect(out.every((o) => o.vis)).toBe(true)
		expect(noOverlap(shown(items, out))).toBe(true)
	})

	it("a hero tag under a coin bubble and the tap chip slides aside", () => {
		const items = [
			b({ kind: "tag", ax: 200, ay: 400, w: 96, h: 20, tail: 2 }),
			b({ kind: "coin", ax: 205, ay: 402, w: 64, h: 32 }),
			b({ kind: "info", ax: 195, ay: 396, w: 200, h: 90 }),
		]
		const out = layoutBubbles(items, PHONE)
		const vis = shown(items, out)
		expect(noOverlap(vis)).toBe(true)
		// the chip keeps its place: the player asked for it
		expect(out[2].vis).toBe(true)
		expect(out[2].dx).toBe(0)
	})

	it("tags do not use up the bubble cap", () => {
		const items: BubbleIn[] = []
		// eight coin bubbles fill a phone's cap...
		for (let i = 0; i < 8; i++)
			items.push(
				b({
					kind: "coin",
					ax: 40 + (i % 4) * 90,
					ay: 300 + Math.floor(i / 4) * 200,
					w: 60,
					h: 30,
				}),
			)
		// ...and the banner and a hero tag still show
		items.push(banner(195, 560))
		items.push(b({ kind: "tag", ax: 100, ay: 680, w: 96, h: 20, tail: 2 }))
		const out = layoutBubbles(items, PHONE)
		expect(out.filter((o) => o.vis)).toHaveLength(10)
		expect(noOverlap(shown(items, out))).toBe(true)
	})

	it("a crowd of tags and lines never overlaps", () => {
		const items: BubbleIn[] = [banner(195, 430)]
		for (let i = 0; i < 4; i++)
			items.push(
				b({
					kind: "tag",
					ax: 150 + i * 30,
					ay: 440 + i * 6,
					w: 90,
					h: 20,
					tail: 2,
				}),
			)
		for (let i = 0; i < 3; i++)
			items.push(
				b({ kind: "speech", ax: 160 + i * 25, ay: 450, w: 140, h: 40 }),
			)
		const out = layoutBubbles(items, PHONE)
		expect(noOverlap(shown(items, out))).toBe(true)
		// the banner is never the one dropped
		expect(out[0].vis).toBe(true)
	})
})
