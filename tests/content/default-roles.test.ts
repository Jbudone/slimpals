import { describe, expect, it } from "vitest"
import { DEFAULT_ROUTES } from "../../server/services/content/config"
import { priceOf } from "../../shared/content/pricing"

describe("default writing roles", () => {
	it("gives every role a model and reads cold on another family than it writes", () => {
		for (const r of ["writer", "showrunner", "critic", "reader", "advocate"])
			expect(DEFAULT_ROUTES[r]).toBeTruthy()
		const family = (m: string) => (m.includes("claude") ? "claude" : "gemini")
		expect(family(DEFAULT_ROUTES.critic!.model)).not.toBe(
			family(DEFAULT_ROUTES.writer!.model),
		)
		expect(family(DEFAULT_ROUTES.reader!.model)).not.toBe(
			family(DEFAULT_ROUTES.showrunner!.model),
		)
	})
	it("prices the writer so its spend is counted", () => {
		expect(priceOf(DEFAULT_ROUTES.writer!.model).inUsd).toBe(3)
	})
})
