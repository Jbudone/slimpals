import { describe, expect, it } from "vitest"
import { DEFAULT_ROUTES } from "../../server/services/content/config"
import { BAKEOFF_DEFAULT_MODELS } from "../../shared/content/bakeoff"
import { priceOf } from "../../shared/content/pricing"

const maker = (m: string) => m.split("/")[0]

describe("default writing roles", () => {
	it("gives every role a model", () => {
		for (const r of [
			"writer",
			"writer2",
			"showrunner",
			"critic",
			"reader",
			"advocate",
		])
			expect(DEFAULT_ROUTES[r]).toBeTruthy()
	})
	it("has the cold readers on another maker than the drafters", () => {
		const drafters = [DEFAULT_ROUTES.writer, DEFAULT_ROUTES.showrunner].map(
			(r) => maker(r!.model),
		)
		for (const r of ["critic", "reader", "advocate"])
			expect(drafters).not.toContain(maker(DEFAULT_ROUTES[r]!.model))
		expect(maker(DEFAULT_ROUTES.writer2!.model)).not.toBe(
			maker(DEFAULT_ROUTES.writer!.model),
		)
	})
	it("prices every default model so spend is counted, and bakes them off", () => {
		for (const r of Object.values(DEFAULT_ROUTES))
			if (r.provider === "openrouter")
				expect(priceOf(r.model).inUsd).not.toBe(1)
		const labels = BAKEOFF_DEFAULT_MODELS.map((m) => m.model)
		expect(labels).toContain("anthropic/claude-3.5-sonnet")
	})
})
