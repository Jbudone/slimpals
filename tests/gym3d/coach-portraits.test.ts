import { describe, expect, it } from "vitest"
import { COACH_VOICES } from "../../shared/gym3d/coachLines.js"
import { COACH_SVG, coachSvg } from "../../src/components/home/icons.js"

describe("coach portraits", () => {
	it("every voice has its own portrait, friendly being the original", () => {
		const all = COACH_VOICES.map((v) => coachSvg([], v))
		expect(new Set(all).size).toBe(COACH_VOICES.length)
		expect(coachSvg([], "friendly")).toBe(COACH_SVG)
		expect(coachSvg()).toBe(COACH_SVG)
		for (const svg of all) {
			expect(svg.startsWith('<svg viewBox="0 0 42 42"')).toBe(true)
			expect(svg.endsWith("</svg>")).toBe(true)
		}
	})

	it("owned outfits sit on every portrait, inside the svg", () => {
		for (const v of COACH_VOICES) {
			const svg = coachSvg(["halloween_hat", "gratitude_scarf"], v)
			expect(svg.endsWith("</svg>")).toBe(true)
			expect(svg.match(/<\/svg>/g)).toHaveLength(1)
			expect(svg).toContain('fill="#3b2a55"')
			expect(svg).toContain('fill="#d9822b"')
		}
		// keys that are not outfits are ignored
		expect(coachSvg(["halloween_lantern"], "bro")).toBe(coachSvg([], "bro"))
	})

	it("falls back to the friendly coach for an unknown voice", () => {
		expect(coachSvg([], "nobody" as never)).toBe(COACH_SVG)
	})
})
