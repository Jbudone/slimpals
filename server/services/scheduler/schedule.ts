// Pure schedule math for the in-process scheduler (no DB, no timers), so
// "given now and the last run, is this job due?" is unit-testable with a fake
// clock. All times are UTC, matching getMondayOfWeek and the challenge month.

export type JobSchedule =
	/** Once per UTC month, from the 1st at `atMinute` past midnight. */
	| { kind: "monthly"; atMinute: number }
	/** Once per ISO week, from Monday at `atMinute` past midnight UTC. */
	| { kind: "weekly"; atMinute: number }
	/** Once per UTC day, from `atMinute` past midnight. */
	| { kind: "daily"; atMinute: number }
	/** Every `everyMs`, measured from the previous run's start. */
	| { kind: "interval"; everyMs: number }

export type RunStatus = "running" | "ok" | "failed"

/** The scheduled_job_runs row for one job + period (what decide needs). */
export type RunRow = {
	status: RunStatus
	attempts: number
	startedAt: Date
}

export type Period = {
	/** Stored in scheduled_job_runs.period; one successful run per key. */
	key: string
	/** When the job becomes due within this period. */
	dueFrom: Date
}

export type Decision = { due: boolean; reason: string }

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A failed run is retried after this long... */
export const RETRY_AFTER_MS = HOUR
/** ...up to this many attempts per period. */
export const MAX_ATTEMPTS = 3
/** A "running" row older than this is treated as a crashed run (the server
 * restarted mid-job) and may be claimed again. */
export const DEFAULT_STALE_AFTER_MS = 3 * HOUR

/** The interval jobs keep a single row; its key never changes. */
export const INTERVAL_PERIOD_KEY = "interval"

function pad(n: number): string {
	return String(n).padStart(2, "0")
}

function utcMidnight(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Monday 00:00 UTC of the week containing `d`. */
export function utcMonday(d: Date): Date {
	const midnight = utcMidnight(d)
	const day = midnight.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	return new Date(midnight.getTime() - diff * DAY)
}

function dayKey(d: Date): string {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function currentPeriod(schedule: JobSchedule, now: Date): Period {
	switch (schedule.kind) {
		case "monthly": {
			const y = now.getUTCFullYear()
			const m = now.getUTCMonth()
			return {
				key: `${y}-${pad(m + 1)}`,
				dueFrom: new Date(Date.UTC(y, m, 1) + schedule.atMinute * MINUTE),
			}
		}
		case "weekly": {
			const monday = utcMonday(now)
			return {
				key: `week-${dayKey(monday)}`,
				dueFrom: new Date(monday.getTime() + schedule.atMinute * MINUTE),
			}
		}
		case "daily": {
			const midnight = utcMidnight(now)
			return {
				key: dayKey(midnight),
				dueFrom: new Date(midnight.getTime() + schedule.atMinute * MINUTE),
			}
		}
		case "interval":
			return { key: INTERVAL_PERIOD_KEY, dueFrom: new Date(0) }
	}
}

/**
 * Whether a job should run now, given its row for the current period (null
 * when it has not run in this period). The DB claim in store.ts then makes
 * sure only one caller acts on a "due" answer.
 */
export function decide(
	schedule: JobSchedule,
	now: Date,
	row: RunRow | null,
	staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): Decision {
	const period = currentPeriod(schedule, now)
	if (now.getTime() < period.dueFrom.getTime()) {
		return { due: false, reason: "not yet in this period's window" }
	}
	if (!row) return { due: true, reason: "no run yet this period" }

	const sinceStart = now.getTime() - row.startedAt.getTime()
	if (row.status === "running") {
		return sinceStart >= staleAfterMs
			? { due: true, reason: "previous run looks stale" }
			: { due: false, reason: "already running" }
	}

	if (schedule.kind === "interval") {
		return sinceStart >= schedule.everyMs
			? { due: true, reason: "interval elapsed" }
			: { due: false, reason: "ran recently" }
	}

	if (row.status === "ok") {
		return { due: false, reason: "already done this period" }
	}
	if (row.attempts >= MAX_ATTEMPTS) {
		return { due: false, reason: "failed too many times this period" }
	}
	return sinceStart >= RETRY_AFTER_MS
		? { due: true, reason: "retrying failed run" }
		: { due: false, reason: "waiting to retry failed run" }
}

/** When the job will next be due, for the admin panel (null = not this
 * period: wait for the next one or a manual run). */
export function nextDueAt(
	schedule: JobSchedule,
	now: Date,
	row: RunRow | null,
	staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): Date | null {
	const period = currentPeriod(schedule, now)
	if (now.getTime() < period.dueFrom.getTime()) return period.dueFrom
	if (!row) return now
	const started = row.startedAt.getTime()
	if (row.status === "running") return new Date(started + staleAfterMs)
	if (schedule.kind === "interval") {
		return new Date(Math.max(now.getTime(), started + schedule.everyMs))
	}
	if (row.status === "failed" && row.attempts < MAX_ATTEMPTS) {
		return new Date(Math.max(now.getTime(), started + RETRY_AFTER_MS))
	}
	return nextPeriodStart(schedule, now)
}

function nextPeriodStart(schedule: JobSchedule, now: Date): Date | null {
	switch (schedule.kind) {
		case "monthly":
			return new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) +
					schedule.atMinute * MINUTE,
			)
		case "weekly":
			return new Date(
				utcMonday(now).getTime() + 7 * DAY + schedule.atMinute * MINUTE,
			)
		case "daily":
			return new Date(
				utcMidnight(now).getTime() + DAY + schedule.atMinute * MINUTE,
			)
		case "interval":
			return null
	}
}

export function describeSchedule(schedule: JobSchedule): string {
	const at = (min: number) =>
		`${pad(Math.floor(min / 60))}:${pad(min % 60)} UTC`
	switch (schedule.kind) {
		case "monthly":
			return `Monthly, 1st at ${at(schedule.atMinute)}`
		case "weekly":
			return `Weekly, Monday at ${at(schedule.atMinute)}`
		case "daily":
			return `Daily at ${at(schedule.atMinute)}`
		case "interval":
			return `Every ${Math.round(schedule.everyMs / MINUTE)} min`
	}
}

/**
 * SCHEDULER_ENABLED=1/true/on forces the scheduler on, 0/false/off forces it
 * off; unset means on only when NODE_ENV=production (so Vitest, Playwright
 * and `npm run dev` never generate content on their own).
 */
export function isSchedulerEnabled(
	env: Record<string, string | undefined> = process.env,
): boolean {
	const flag = env.SCHEDULER_ENABLED?.trim().toLowerCase()
	if (flag && ["1", "true", "yes", "on"].includes(flag)) return true
	if (flag && ["0", "false", "no", "off"].includes(flag)) return false
	return env.NODE_ENV === "production"
}
