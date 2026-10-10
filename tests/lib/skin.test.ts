import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { THEME_EVENTS } from "../../src/lib/eventTheme"
import {
	DEFAULT_CONFETTI,
	parseSkinList,
	parseSkinText,
} from "../../src/lib/skin"

describe("skin values", () => {
	it("reads a quoted comma list and a quoted glyph from a custom property", () => {
		expect(parseSkinList(' "#ff8a1f, #8a4fff ,#1c1c1c" ')).toEqual([
			"#ff8a1f",
			"#8a4fff",
			"#1c1c1c",
		])
		expect(parseSkinList("")).toEqual([])
		expect(parseSkinText(' "🎃" ')).toBe("🎃")
		expect(DEFAULT_CONFETTI.length).toBeGreaterThan(3)
	})
})

describe("every look has a skin in the stylesheet", () => {
	const css = readFileSync("src/styles/app.css", "utf8")
	for (const look of Object.keys(THEME_EVENTS)) {
		it(`${look}: ring colours, confetti and a glyph`, () => {
			const m = css.match(
				new RegExp(`\\[data-event="${look}"\\] \\{([^}]*--sk-a[^}]*)\\}`),
			)
			expect(m, `no skin block for ${look}`).not.toBeNull()
			const block = m?.[1] ?? ""
			for (const v of ["--sk-a", "--sk-b", "--sk-c", "--sk-conf", "--sk-glyph"])
				expect(block, `${look} lacks ${v}`).toContain(v)
		})
	}
})
