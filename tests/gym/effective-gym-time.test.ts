import { describe, expect, it } from "vitest"
import { effectiveGymTime } from "../../server/services/gym/index.js"

describe("effectiveGymTime", () => {
	it("returns the real time unchanged when there is no override", () => {
		const now = new Date("2026-03-05T08:15:00")
		const result = effectiveGymTime({ simulatedHourOverride: null }, now)
		expect(result).toEqual(now)
	})

	it("substitutes only the hour, keeping the same date", () => {
		const now = new Date("2026-03-05T08:15:30")
		const result = effectiveGymTime({ simulatedHourOverride: 22 }, now)
		expect(result.getFullYear()).toBe(2026)
		expect(result.getMonth()).toBe(2)
		expect(result.getDate()).toBe(5)
		expect(result.getHours()).toBe(22)
		expect(result.getMinutes()).toBe(0)
		expect(result.getSeconds()).toBe(0)
	})

	it("supports hour 0 (midnight) as an explicit override", () => {
		const now = new Date("2026-03-05T14:00:00")
		const result = effectiveGymTime({ simulatedHourOverride: 0 }, now)
		expect(result.getHours()).toBe(0)
		expect(result.getDate()).toBe(5)
	})
})
