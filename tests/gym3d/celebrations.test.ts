import { describe, expect, it } from "vitest"
import { GYM_UPGRADES } from "../../server/db/seed.js"
import {
	celebrationFor,
	DEFAULT_CELEBRATION,
	UPGRADE_CELEBRATIONS,
} from "../../shared/gym3d/celebrations"

describe("upgrade celebrations (shared by both gyms)", () => {
	it("has a line for known upgrades and a default otherwise", () => {
		expect(celebrationFor("cardio_treadmill")).toMatch(/treadmill/i)
		expect(celebrationFor("no_such_upgrade")).toBe(DEFAULT_CELEBRATION)
	})

	it("only names upgrades that exist", () => {
		const keys = new Set(GYM_UPGRADES.map((u) => u.key))
		for (const k of Object.keys(UPGRADE_CELEBRATIONS)) expect(keys).toContain(k)
	})
})
