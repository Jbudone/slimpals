import { describe, expect, it } from "vitest"
import {
	bestHit,
	HIT_RANK,
	type HitCat,
	isTap,
	TAP_MS,
	TAP_SLOP,
} from "../../src/components/gym3d/world/picking.js"
import {
	outlineRects,
	squashCurve,
} from "../../src/components/gym3d/world/tapFx.js"

const h = (cat: HitCat, dist: number, sel: string | null = cat) => ({
	cat,
	dist,
	sel,
})

describe("tap hit priority: people > equipment > room > floor", () => {
	it("ranks the categories in that order", () => {
		expect(HIT_RANK.person).toBeLessThan(HIT_RANK.gear)
		expect(HIT_RANK.gear).toBeLessThan(HIT_RANK.room)
		expect(HIT_RANK.room).toBeLessThan(HIT_RANK.floor)
	})

	it("a person wins over the machine they stand on, even when farther", () => {
		const best = bestHit([h("gear", 10), h("person", 12), h("room", 9)])
		expect(best?.cat).toBe("person")
	})

	it("equipment wins over the room floor and walls under it", () => {
		const best = bestHit([h("room", 8), h("gear", 11), h("room", 14)])
		expect(best?.cat).toBe("gear")
	})

	it("a room wins over open ground", () => {
		expect(bestHit([h("floor", 3, null), h("room", 20)])?.cat).toBe("room")
	})

	it("the nearest hit wins within a category", () => {
		const best = bestHit([
			h("gear", 14, "far"),
			h("gear", 9, "near"),
			h("gear", 12, "mid"),
		])
		expect(best?.sel).toBe("near")
	})

	it("open ground alone selects nothing; no hits pick nothing", () => {
		expect(bestHit([h("floor", 5, null)])?.sel).toBeNull()
		expect(bestHit([])).toBeNull()
	})

	it("a member working out on the tapped piece gives way to it", () => {
		const busy = { cat: "person" as const, dist: 9, sel: "member", busyOn: 7 }
		const piece = { cat: "gear" as const, dist: 10, sel: "treadmill", piece: 7 }
		expect(bestHit([busy, piece])?.sel).toBe("treadmill")
		// a different piece behind them: the person still wins
		const other = { ...piece, piece: 8, sel: "bike" }
		expect(bestHit([busy, other])?.sel).toBe("member")
		// a named NPC (no busyOn) always wins
		const named = { cat: "person" as const, dist: 9, sel: "marcus" }
		expect(bestHit([named, piece])?.sel).toBe("marcus")
	})

	it("input order does not matter", () => {
		const hits = [h("room", 1), h("person", 30), h("gear", 2), h("floor", 0)]
		for (let i = 0; i < hits.length; i++) {
			const rot = [...hits.slice(i), ...hits.slice(0, i)]
			expect(bestHit(rot)?.cat).toBe("person")
		}
	})
})

describe("tap vs pan", () => {
	const tap = { moved: 0, ms: 120, panned: false, others: 0 }

	it("a short, still press is a tap", () => {
		expect(isTap(tap)).toBe(true)
		expect(isTap({ ...tap, moved: TAP_SLOP })).toBe(true)
	})

	it("moving past the pan threshold is never a tap", () => {
		expect(isTap({ ...tap, moved: TAP_SLOP + 0.5 })).toBe(false)
	})

	it("a press that panned the camera is not a tap, even if it came back", () => {
		expect(isTap({ ...tap, moved: 1, panned: true })).toBe(false)
	})

	it("a long press or another finger still down is not a tap", () => {
		expect(isTap({ ...tap, ms: TAP_MS })).toBe(false)
		expect(isTap({ ...tap, others: 1 })).toBe(false)
	})
})

describe("tap feedback shapes", () => {
	const W = 9
	const D = 6

	it("one cell is outlined by four strips inside its edges", () => {
		const r = outlineRects([{ px: 1, pz: 1 }], 0.1, 0.2, W, D)
		expect(r).toHaveLength(4)
		for (const q of r) {
			expect(q.x0).toBeGreaterThanOrEqual(W + 0.1 - 1e-9)
			expect(q.x1).toBeLessThanOrEqual(2 * W - 0.1 + 1e-9)
			expect(q.z0).toBeGreaterThanOrEqual(D + 0.1 - 1e-9)
			expect(q.z1).toBeLessThanOrEqual(2 * D - 0.1 + 1e-9)
		}
	})

	it("two cells side by side share no inner edge, and their strips meet", () => {
		const r = outlineRects(
			[
				{ px: 0, pz: 0 },
				{ px: 1, pz: 0 },
			],
			0.1,
			0.2,
			W,
			D,
		)
		expect(r).toHaveLength(6)
		// nothing runs down the middle (x = 9)
		expect(r.some((q) => q.x0 < W && q.x1 > W && q.z1 - q.z0 > 1)).toBe(false)
		// the top strips run on with no gap at the seam
		const top = r
			.filter((q) => q.z0 < 1 && q.x1 - q.x0 > 1)
			.sort((a, b) => a.x0 - b.x0)
		expect(top).toHaveLength(2)
		expect(top[0].x1).toBeCloseTo(top[1].x0)
	})

	it("an L reaches into its inner corner", () => {
		const r = outlineRects(
			[
				{ px: 0, pz: 0 },
				{ px: 0, pz: 1 },
				{ px: 1, pz: 1 },
			],
			0.1,
			0.2,
			W,
			D,
		)
		expect(r).toHaveLength(8)
		// the inner corner is at (9, 6): a strip reaches past it on each side
		const covers = (x: number, z: number) =>
			r.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1)
		expect(covers(W - 0.2, D + 0.2)).toBe(true)
		expect(covers(W + 0.2, D - 0.2)).toBe(false)
	})

	it("the squash starts and ends at rest and squashes first", () => {
		expect(squashCurve(0)).toBe(0)
		expect(squashCurve(1)).toBe(0)
		expect(squashCurve(0.1)).toBeGreaterThan(0)
		// then bounces the other way
		expect(squashCurve(0.5)).toBeLessThan(0)
	})
})
