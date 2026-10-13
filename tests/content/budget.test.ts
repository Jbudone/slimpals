import { describe, expect, it } from "vitest"
import {
	canSpend,
	dailyCapUsd,
	dayNumber,
	defaultBudget,
	pipelineCapUsd,
	validateBudget,
} from "../../shared/content/budget"
import { costUsd, priceOf } from "../../shared/content/pricing"

const d = (s: string) => new Date(`${s}T12:00:00Z`)

describe("content budget", () => {
	const cfg = defaultBudget(d("2026-10-13"))

	it("is $5 a day for the first week, then $1", () => {
		expect(dailyCapUsd(cfg, d("2026-10-13"))).toBe(5)
		expect(dailyCapUsd(cfg, d("2026-10-19"))).toBe(5)
		expect(dailyCapUsd(cfg, d("2026-10-20"))).toBe(1)
		expect(dailyCapUsd(cfg, d("2027-01-01"))).toBe(1)
		expect(dailyCapUsd(cfg, d("2026-10-12"))).toBe(0)
		expect(dayNumber(cfg, d("2026-10-20"))).toBe(7)
	})

	it("keeps a reserve back from the pipeline", () => {
		expect(pipelineCapUsd(cfg, d("2026-10-13"))).toBeCloseTo(4.5)
		expect(canSpend(cfg, d("2026-10-13"), 4.4, 0.2).ok).toBe(false)
		expect(canSpend(cfg, d("2026-10-13"), 4.4, 0.2, true).ok).toBe(true)
		expect(canSpend(cfg, d("2026-10-13"), 0, 0.01).ok).toBe(true)
	})

	it("validates what the page sends", () => {
		expect(validateBudget(cfg)).toEqual(cfg)
		expect(typeof validateBudget({ ...cfg, steps: [] })).toBe("string")
		expect(
			typeof validateBudget({ ...cfg, steps: [{ fromDay: 1, usd: 1 }] }),
		).toBe("string")
		expect(
			typeof validateBudget({
				...cfg,
				steps: [
					{ fromDay: 0, usd: 5 },
					{ fromDay: 0, usd: 1 },
				],
			}),
		).toBe("string")
		expect(typeof validateBudget({ ...cfg, startDate: "soon" })).toBe("string")
		expect(typeof validateBudget({ ...cfg, reservePct: 90 })).toBe("string")
	})
})

describe("pricing", () => {
	it("costs tokens per million and never treats an unknown model as free", () => {
		expect(costUsd("gemini-2.5-flash", 1_000_000, 0)).toBeCloseTo(0.3)
		expect(costUsd("gemini-2.5-flash", 0, 1_000_000)).toBeCloseTo(2.5)
		expect(costUsd("mystery-model", 1_000_000, 0)).toBeGreaterThan(0)
		expect(costUsd("gemini-2.5-flash-image", 0, 0, 2)).toBeCloseTo(0.078)
		expect(
			priceOf("gemini-2.5-flash", {
				"gemini-2.5-flash": { inUsd: 9, outUsd: 9 },
			}).inUsd,
		).toBe(9)
	})
})
