import { describe, expect, it } from "vitest"
import { BONDS, bondBetween } from "../../shared/gym3d/bonds.js"
import { CAST } from "../../src/components/gym3d/people/cast.js"

describe("cast bonds", () => {
	it("pairs only people in the cast, in the banter style", () => {
		expect(new Set(BONDS.map((b) => b.id)).size).toBe(BONDS.length)
		for (const b of BONDS) {
			expect(CAST[b.a]).toBeDefined()
			expect(CAST[b.b]).toBeDefined()
			expect(b.a).not.toBe(b.b)
			expect(b.lines.length).toBeGreaterThanOrEqual(2)
			for (const l of b.lines) {
				expect(l.length).toBeLessThanOrEqual(80)
				expect(l).not.toContain("!")
			}
		}
	})

	it("finds a bond in either order and skips a recent one when it can", () => {
		const ab = bondBetween("trainer_marcus", "receptionist_lisa")
		expect(ab?.id).toBe("bond-marcus-lisa")
		expect(bondBetween("receptionist_lisa", "trainer_marcus")?.id).toBe(ab?.id)
		expect(bondBetween("regular_derek", "trainer_jordan")).toBeNull()
		expect(bondBetween(null, "trainer_marcus")).toBeNull()
		// with only one bond for the pair, a recent one still plays
		expect(
			bondBetween("trainer_marcus", "receptionist_lisa", [ab?.id ?? ""])?.id,
		).toBe(ab?.id)
	})
})
