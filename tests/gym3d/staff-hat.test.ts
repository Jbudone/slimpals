import { describe, expect, it } from "vitest"
import {
	COSMETICS,
	HAT_STAFF,
	OUTFIT_HAT,
	staffHatOf,
} from "../../shared/gym3d/cosmetics.js"

describe("staff hat", () => {
	it("the worn Halloween or winter outfit puts a hat on the group coach", () => {
		expect(staffHatOf([])).toBeNull()
		expect(staffHatOf(["gratitude_scarf"])).toBeNull()
		expect(staffHatOf(["halloween_hat"])).toBe("witch")
		expect(staffHatOf(["gratitude_scarf", "winter_hat"])).toBe("santa")
	})

	it("only names outfits that exist", () => {
		for (const k of Object.keys(OUTFIT_HAT))
			expect(COSMETICS.find((c) => c.key === k)?.kind).toBe("outfit")
	})

	it("the coach and the receptionist wear it", () => {
		expect([...HAT_STAFF].sort()).toEqual([
			"receptionist_lisa",
			"specialist_coach",
		])
	})
})
