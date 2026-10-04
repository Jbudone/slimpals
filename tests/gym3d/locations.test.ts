import { describe, expect, it } from "vitest"
import { type BanterContext, banterFor } from "../../shared/gym3d/banter.js"
import { LOCATIONS, locationFor } from "../../shared/gym3d/locations.js"

describe("campaign locations", () => {
	it("campaign one is Pavement Street as it always looked", () => {
		const l = locationFor(1)
		expect(l).toMatchObject({
			name: "Pavement Street",
			ground: "#e0907a",
			walk: "#f0b39c",
			road: "#5d5663",
			sky: 0xf2c9b4,
			rivalSign: "MAXOUT",
			foodSign: "BURGER BARON",
		})
	})

	it("every campaign is somewhere else, and they take turns after the last", () => {
		expect(new Set(LOCATIONS.map((l) => l.name)).size).toBe(LOCATIONS.length)
		expect(new Set(LOCATIONS.map((l) => l.ground)).size).toBe(LOCATIONS.length)
		expect(locationFor(2).name).not.toBe(locationFor(1).name)
		expect(locationFor(LOCATIONS.length + 1)).toBe(locationFor(1))
		// nonsense falls back to the first
		expect(locationFor(0)).toBe(locationFor(1))
		expect(locationFor(-4)).toBe(locationFor(1))
		for (const l of LOCATIONS) {
			expect(l.rivalSign.length).toBeLessThanOrEqual(14)
			expect(l.foodSign.length).toBeLessThanOrEqual(14)
			expect(l.ground).toMatch(/^#[0-9a-f]{6}$/)
		}
	})

	it("only the first campaign talks about MaxOut", () => {
		const ctx: BanterContext = { rooms: ["cardio"], gear: [], crowded: false }
		const ids = (extra: Partial<BanterContext>) =>
			banterFor({ ...ctx, ...extra }).map((b) => b.id)
		expect(ids({}).some((i) => i.startsWith("maxout"))).toBe(true)
		expect(ids({ campaign: 1 }).some((i) => i.startsWith("maxout"))).toBe(true)
		expect(ids({ campaign: 2 }).some((i) => i.startsWith("maxout"))).toBe(false)
		// the rest of the pool is still there
		expect(ids({ campaign: 2 }).length).toBeGreaterThan(0)
	})
})
