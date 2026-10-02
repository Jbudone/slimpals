import { describe, expect, it } from "vitest"
import {
	currentPeriod,
	decide,
	isSchedulerEnabled,
	MAX_ATTEMPTS,
	nextDueAt,
	type RunRow,
} from "../../server/services/scheduler/schedule.js"

const at = (iso: string) => new Date(iso)
const MIN = 60 * 1000
const HOUR = 60 * MIN

const monthly = { kind: "monthly", atMinute: 5 } as const
const weekly = { kind: "weekly", atMinute: 5 } as const
const daily = { kind: "daily", atMinute: 20 } as const
const every15 = { kind: "interval", everyMs: 15 * MIN } as const

function row(
	status: RunRow["status"],
	startedAt: string,
	attempts = 1,
): RunRow {
	return { status, startedAt: at(startedAt), attempts }
}

describe("currentPeriod", () => {
	it("keys months, ISO weeks (Monday) and days in UTC", () => {
		// 2026-10-04 is a Sunday: its week started Monday 2026-09-28.
		const sunday = at("2026-10-04T23:59:00Z")
		expect(currentPeriod(monthly, sunday)).toEqual({
			key: "2026-10",
			dueFrom: at("2026-10-01T00:05:00Z"),
		})
		expect(currentPeriod(weekly, sunday)).toEqual({
			key: "week-2026-09-28",
			dueFrom: at("2026-09-28T00:05:00Z"),
		})
		expect(currentPeriod(daily, sunday)).toEqual({
			key: "2026-10-04",
			dueFrom: at("2026-10-04T00:20:00Z"),
		})
		expect(currentPeriod(weekly, at("2026-10-05T00:00:00Z")).key).toBe(
			"week-2026-10-05",
		)
		expect(currentPeriod(every15, sunday).key).toBe("interval")
	})

	it("rolls over the year", () => {
		expect(currentPeriod(monthly, at("2027-01-01T00:06:00Z")).key).toBe(
			"2027-01",
		)
		expect(currentPeriod(weekly, at("2027-01-01T12:00:00Z")).key).toBe(
			"week-2026-12-28",
		)
	})
})

describe("decide", () => {
	it("is not due before the period's window opens", () => {
		expect(decide(monthly, at("2026-10-01T00:04:59Z"), null).due).toBe(false)
		expect(decide(weekly, at("2026-10-05T00:01:00Z"), null).due).toBe(false)
		expect(decide(daily, at("2026-10-02T00:19:00Z"), null).due).toBe(false)
	})

	it("is due once the window opens and nothing ran this period", () => {
		expect(decide(monthly, at("2026-10-01T00:05:00Z"), null).due).toBe(true)
		// Catch-up: the server was down on the 1st, still due later in the month.
		expect(decide(monthly, at("2026-10-19T13:00:00Z"), null).due).toBe(true)
		expect(decide(weekly, at("2026-10-07T09:00:00Z"), null).due).toBe(true)
		expect(decide(daily, at("2026-10-02T00:20:00Z"), null).due).toBe(true)
		expect(decide(every15, at("2026-10-02T00:00:00Z"), null).due).toBe(true)
	})

	it("is not due again after a successful run in the same period", () => {
		const done = row("ok", "2026-10-01T00:05:00Z")
		expect(decide(monthly, at("2026-10-01T00:06:00Z"), done).due).toBe(false)
		expect(decide(monthly, at("2026-10-31T23:59:00Z"), done).due).toBe(false)
	})

	it("does not overlap a run in progress, but takes over a stale one", () => {
		const running = row("running", "2026-10-02T00:20:00Z")
		expect(decide(daily, at("2026-10-02T01:00:00Z"), running)).toEqual({
			due: false,
			reason: "already running",
		})
		expect(decide(daily, at("2026-10-02T03:20:00Z"), running).due).toBe(true)
		// Per-job stale window.
		expect(
			decide(daily, at("2026-10-02T00:51:00Z"), running, 30 * MIN).due,
		).toBe(true)
	})

	it("retries a failed run after an hour, up to MAX_ATTEMPTS", () => {
		const failed = row("failed", "2026-10-05T00:05:00Z")
		expect(decide(weekly, at("2026-10-05T00:30:00Z"), failed).due).toBe(false)
		expect(decide(weekly, at("2026-10-05T01:05:00Z"), failed).due).toBe(true)
		const exhausted = row("failed", "2026-10-05T00:05:00Z", MAX_ATTEMPTS)
		expect(decide(weekly, at("2026-10-06T00:00:00Z"), exhausted).due).toBe(
			false,
		)
	})

	it("runs interval jobs again once the interval has elapsed", () => {
		const last = row("ok", "2026-10-02T10:00:00Z", 40)
		expect(decide(every15, at("2026-10-02T10:14:00Z"), last).due).toBe(false)
		expect(decide(every15, at("2026-10-02T10:15:00Z"), last).due).toBe(true)
		const failed = row("failed", "2026-10-02T10:00:00Z", 41)
		expect(decide(every15, at("2026-10-02T10:15:00Z"), failed).due).toBe(true)
	})
})

describe("nextDueAt", () => {
	it("points at the next period after a successful run", () => {
		const done = row("ok", "2026-10-01T00:05:00Z")
		expect(nextDueAt(monthly, at("2026-10-02T00:00:00Z"), done)).toEqual(
			at("2026-11-01T00:05:00Z"),
		)
		expect(
			nextDueAt(weekly, at("2026-10-02T00:00:00Z"), row("ok", "2026-09-28")),
		).toEqual(at("2026-10-05T00:05:00Z"))
		expect(
			nextDueAt(
				every15,
				at("2026-10-02T10:01:00Z"),
				row("ok", "2026-10-02T10:00:00Z"),
			),
		).toEqual(new Date(at("2026-10-02T10:00:00Z").getTime() + 15 * MIN))
		expect(nextDueAt(daily, at("2026-10-02T00:10:00Z"), null)?.getTime()).toBe(
			at("2026-10-02T00:20:00Z").getTime(),
		)
		expect(
			nextDueAt(
				daily,
				at("2026-10-02T05:00:00Z"),
				row("failed", "2026-10-02T04:30:00Z"),
			)?.getTime(),
		).toBe(at("2026-10-02T04:30:00Z").getTime() + HOUR)
	})
})

describe("isSchedulerEnabled", () => {
	it("defaults on in production only", () => {
		expect(isSchedulerEnabled({ NODE_ENV: "production" })).toBe(true)
		expect(isSchedulerEnabled({ NODE_ENV: "development" })).toBe(false)
		expect(isSchedulerEnabled({ NODE_ENV: "test" })).toBe(false)
		expect(isSchedulerEnabled({})).toBe(false)
	})

	it("SCHEDULER_ENABLED overrides the default either way", () => {
		expect(
			isSchedulerEnabled({ NODE_ENV: "production", SCHEDULER_ENABLED: "0" }),
		).toBe(false)
		expect(
			isSchedulerEnabled({
				NODE_ENV: "production",
				SCHEDULER_ENABLED: "false",
			}),
		).toBe(false)
		expect(
			isSchedulerEnabled({ NODE_ENV: "development", SCHEDULER_ENABLED: "1" }),
		).toBe(true)
		expect(
			isSchedulerEnabled({ NODE_ENV: "test", SCHEDULER_ENABLED: "true" }),
		).toBe(true)
		// Unrecognised values fall back to the NODE_ENV default.
		expect(
			isSchedulerEnabled({ NODE_ENV: "production", SCHEDULER_ENABLED: "" }),
		).toBe(true)
	})
})
