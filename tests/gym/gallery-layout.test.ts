import { describe, expect, it } from "vitest"
import { computeGalleryLayout } from "../../src/components/gym/galleryLayout.js"

function entries(keys: string[]) {
	return keys.map((key) => ({ key }))
}

describe("computeGalleryLayout", () => {
	it("wraps to a new row after `columns` items", () => {
		const result = computeGalleryLayout(entries(["a", "b", "c", "d", "e"]), 2)
		expect(result).toEqual([
			{ key: "a", col: 0, row: 0 },
			{ key: "b", col: 1, row: 0 },
			{ key: "c", col: 0, row: 1 },
			{ key: "d", col: 1, row: 1 },
			{ key: "e", col: 0, row: 2 },
		])
	})

	it("returns an empty layout for an empty entries array", () => {
		expect(computeGalleryLayout([], 4)).toEqual([])
	})
})
