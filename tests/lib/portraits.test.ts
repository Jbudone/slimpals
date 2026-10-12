import { describe, expect, it } from "vitest"
import { ROOM_ARCS } from "../../shared/gym3d/staffRoom"
import { faceSvg, hasFace } from "../../src/components/home/portraits"

describe("staff room portraits", () => {
	it("draws a face for each of the staff and none for strangers", () => {
		for (const k of [
			"marcus",
			"lisa",
			"alex",
			"kim",
			"jordan",
			"rivera",
			"derek",
		]) {
			expect(hasFace(k)).toBe(true)
			expect(faceSvg(k, "#123456")).toContain("<svg")
		}
		expect(faceSvg("narrator", "#000")).toBe("")
	})

	it("covers everyone who speaks in a staff room episode (the six staff and Derek)", () => {
		const speakers = new Set(
			ROOM_ARCS.flatMap((a) =>
				a.episodes.flatMap((e) => e.lines.map((l) => l.who as string)),
			),
		)
		const bare = [...speakers].filter((w) => w !== "narrator" && !hasFace(w))
		expect(bare).toEqual([])
	})
})
