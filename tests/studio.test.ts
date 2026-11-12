import { describe, expect, it } from "vitest"
import {
	castOf,
	formatScript,
	nextSlotDates,
	parseScript,
} from "../shared/studio/pieces.js"

describe("studio script helpers", () => {
	it("parses who | text, a bare line is the narrator", () => {
		const s = parseScript(
			"```\nbrody | It's my face.\n\nThe lights hum.\nTheo|Why.\n```",
		)
		expect(s).toEqual([
			{ who: "brody", text: "It's my face." },
			{ who: "narrator", text: "The lights hum." },
			{ who: "theo", text: "Why." },
		])
		expect(parseScript(formatScript(s))).toEqual(s)
	})
	it("lists the cast without the narrator", () => {
		expect(
			castOf(parseScript("narrator | x\nkev | a\nbrody | b\nkev | c")),
		).toEqual(["kev", "brody"])
	})
	it("finds the next weekly slots", () => {
		// 2026-11-12 is a Thursday
		expect(nextSlotDates(5, new Date("2026-11-12T10:00:00Z"), 2)).toEqual([
			"2026-11-13",
			"2026-11-20",
		])
		expect(nextSlotDates(0, new Date("2026-11-15T23:00:00Z"), 1)).toEqual([
			"2026-11-15",
		])
	})
})
