import { describe, expect, it } from "vitest"
import {
	JUDGE_THRESHOLD,
	nearDuplicate,
	parseJudge,
	reviewValue,
	similarity,
} from "../../shared/content/quality"

describe("near duplicates", () => {
	const a = ["The treadmill is fine.", "It is a treadmill."]
	it("sees the same exchange reworded a little", () => {
		expect(
			similarity(a, ["The treadmill is fine!", "It is a treadmill."]),
		).toBeGreaterThan(0.8)
		expect(
			nearDuplicate(["The treadmill is fine", "It is a treadmill"], [a]),
		).toBe(true)
	})
	it("lets a different exchange through", () => {
		expect(
			nearDuplicate(["Nobody cleans the mirror.", "Everyone checks it."], [a]),
		).toBe(false)
		expect(nearDuplicate(a, [])).toBe(false)
		expect(similarity([], a)).toBe(0)
	})
})

describe("the judge's answer", () => {
	const ok = (over = {}) =>
		JSON.stringify({
			specific: 4,
			dry: 5,
			natural: 4,
			in_character: 3,
			ai_speak: false,
			note: "Nice and flat.",
			...over,
		})
	it("scores the mean out of 100 and takes 20 off for AI-speak", () => {
		expect(parseJudge(ok())?.score).toBe(80)
		expect(parseJudge(ok({ ai_speak: true }))?.score).toBe(60)
		expect(parseJudge(`Sure!\n${ok()}\nDone.`)?.note).toBe("Nice and flat.")
	})
	it("refuses an answer it cannot trust", () => {
		expect(parseJudge("looks fine")).toBeNull()
		expect(parseJudge(ok({ dry: 9 }))).toBeNull()
		expect(parseJudge(ok({ specific: "x" }))).toBeNull()
		expect(parseJudge("{nope")).toBeNull()
	})
})

describe("which item is worth a review", () => {
	const r = () => 0
	const item = (
		judgeScore: number | null,
		status = "published",
		reviewState: string | null = null,
	) => ({
		judgeScore,
		status,
		reviewState,
		shownCount: 0,
	})
	it("orders: unjudged, borderline, rejected, sure ones; reviewed never", () => {
		const unjudged = reviewValue(item(null), r)
		const border = reviewValue(item(JUDGE_THRESHOLD + 2), r)
		const rejected = reviewValue(item(30, "rejected"), r)
		const sure = reviewValue(item(95), r)
		expect(unjudged).toBeGreaterThan(border)
		expect(border).toBeGreaterThan(rejected)
		expect(rejected).toBeGreaterThan(sure)
		expect(sure).toBeGreaterThan(0)
		expect(reviewValue(item(null, "published", "good"), r)).toBe(0)
	})
})
