import { describe, expect, it } from "vitest"
import { COACH_SVG, coachSvg } from "../src/components/home/icons.js"

describe("coach outfits", () => {
	it("wears nothing extra until the gym owns an outfit", () => {
		expect(coachSvg()).toBe(COACH_SVG)
		expect(coachSvg(["halloween_lantern"])).toBe(COACH_SVG) // decor is not worn
	})

	it("wears an owned outfit inside the same svg", () => {
		const svg = coachSvg(["halloween_hat"])
		expect(svg).toContain('fill="#3b2a55"')
		expect(svg.match(/<svg/g)).toHaveLength(1)
		expect(svg.endsWith("</svg>")).toBe(true)
	})
})
