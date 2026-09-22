import { describe, expect, it } from "vitest"
import {
	currentPeriodStart,
	isWithinCurrentPeriod,
} from "../../server/services/missions/index.js"

describe("currentPeriodStart", () => {
	it("returns UTC midnight for daily", () => {
		const now = new Date("2026-03-11T15:42:00.000Z")
		const result = currentPeriodStart("daily", now)
		expect(result.toISOString()).toBe("2026-03-11T00:00:00.000Z")
	})

	it("returns the Monday of the current UTC week for weekly", () => {
		// 2026-03-11 is a Wednesday
		const now = new Date("2026-03-11T15:42:00.000Z")
		const result = currentPeriodStart("weekly", now)
		expect(result.toISOString()).toBe("2026-03-09T00:00:00.000Z")
	})

	it("weekly period start is stable across the whole week", () => {
		const monday = currentPeriodStart(
			"weekly",
			new Date("2026-03-09T00:00:00.000Z"),
		)
		const sunday = currentPeriodStart(
			"weekly",
			new Date("2026-03-15T23:59:59.000Z"),
		)
		expect(monday.getTime()).toBe(sunday.getTime())
	})
})

describe("isWithinCurrentPeriod", () => {
	it("returns true for a daily completion made earlier today", () => {
		const now = new Date("2026-03-11T20:00:00.000Z")
		const completedPeriodStart = currentPeriodStart(
			"daily",
			new Date("2026-03-11T09:00:00.000Z"),
		)
		expect(isWithinCurrentPeriod(completedPeriodStart, "daily", now)).toBe(true)
	})

	it("returns false for a daily completion made yesterday", () => {
		const now = new Date("2026-03-11T00:30:00.000Z")
		const completedPeriodStart = currentPeriodStart(
			"daily",
			new Date("2026-03-10T23:00:00.000Z"),
		)
		expect(isWithinCurrentPeriod(completedPeriodStart, "daily", now)).toBe(
			false,
		)
	})

	it("returns true for a weekly completion made earlier this week", () => {
		const now = new Date("2026-03-13T00:00:00.000Z") // Friday
		const completedPeriodStart = currentPeriodStart(
			"weekly",
			new Date("2026-03-09T00:00:00.000Z"),
		) // Monday
		expect(isWithinCurrentPeriod(completedPeriodStart, "weekly", now)).toBe(
			true,
		)
	})

	it("returns false for a weekly completion made last week", () => {
		const now = new Date("2026-03-09T00:00:00.000Z") // this Monday
		const completedPeriodStart = currentPeriodStart(
			"weekly",
			new Date("2026-03-02T00:00:00.000Z"),
		) // last Monday
		expect(isWithinCurrentPeriod(completedPeriodStart, "weekly", now)).toBe(
			false,
		)
	})
})
