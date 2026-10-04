import { describe, expect, it } from "vitest"
import {
	nextDelay,
	pickEventTheme,
	seasonTheme,
	THEME_ACCENT,
	THEME_EVENTS,
} from "../../src/lib/eventTheme"

describe("event themes", () => {
	it("the season dresses April, July, August and October to December", () => {
		expect(seasonTheme(4)).toBe("spring")
		expect(seasonTheme(7)).toBe("summer")
		expect(seasonTheme(8)).toBe("summer")
		expect(seasonTheme(10)).toBe("halloween")
		expect(seasonTheme(11)).toBe("harvest")
		expect(seasonTheme(12)).toBe("winter")
		for (const m of [1, 2, 3, 5, 6, 9]) expect(seasonTheme(m)).toBeNull()
	})

	it("a joined challenge's look beats the season, an unjoined one does not", () => {
		expect(pickEventTheme("arcade", true, 10)).toBe("arcade")
		expect(pickEventTheme("arcade", false, 10)).toBe("halloween")
		expect(pickEventTheme("mystery", true, 10)).toBe("halloween")
		expect(pickEventTheme(null, true, 2)).toBeNull()
	})

	it("every look has an accent and a few small events with a sensible rhythm", () => {
		for (const [theme, events] of Object.entries(THEME_EVENTS)) {
			expect(THEME_ACCENT[theme as keyof typeof THEME_ACCENT]).toMatch(
				/^#[0-9a-f]{6}$/,
			)
			expect(events.length).toBeGreaterThan(0)
			for (const e of events) {
				expect(e.glyph || e.svg).toBeTruthy()
				// never a busy backdrop: at least five seconds between events
				expect(e.every[0]).toBeGreaterThanOrEqual(5)
				expect(e.every[1]).toBeGreaterThan(e.every[0])
			}
		}
		expect(nextDelay([10, 20], () => 0)).toBe(10)
		expect(nextDelay([10, 20], () => 0.5)).toBe(15)
	})
})
