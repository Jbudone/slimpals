// System-run recurring tournaments: one per week (Mon-Sun) and one per month,
// rotating through the tournament types. Pure period and rotation math (all
// UTC) so "which tournaments should exist now" is unit-testable.

export type RecurringKind = "weekly" | "monthly"
export type RecurringType =
	| "weight_loss"
	| "step_count"
	| "streak"
	| "food_challenge"

export type RecurringPeriod = {
	kind: RecurringKind
	/** Unique per period: "weekly:2026-10-05" or "monthly:2026-10". */
	key: string
	start: Date
	/** Exclusive: the start of the next period. */
	end: Date
	type: RecurringType
	name: string
}

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

// Weekly ones avoid weight loss (a week is too short for weigh-ins).
const WEEKLY_TYPES: readonly RecurringType[] = [
	"step_count",
	"food_challenge",
	"streak",
]
const MONTHLY_TYPES: readonly RecurringType[] = [
	"weight_loss",
	"step_count",
	"streak",
	"food_challenge",
]

const WEEKLY_NAMES: Record<RecurringType, string> = {
	step_count: "Weekly Step Sprint",
	food_challenge: "Weekly Clean Plate",
	streak: "Weekly Streak Showdown",
	weight_loss: "Weekly Weigh-In",
}
const MONTHLY_NAMES: Record<RecurringType, string> = {
	weight_loss: "Monthly Slim-Down",
	step_count: "Monthly Mileage Race",
	streak: "Monthly Streak Marathon",
	food_challenge: "Monthly Plate Quality Cup",
}

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]

function pad(n: number): string {
	return String(n).padStart(2, "0")
}

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date): Date {
	const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
	const day = new Date(midnight).getUTCDay()
	return new Date(midnight - (day === 0 ? 6 : day - 1) * DAY)
}

export function weeklyPeriod(d: Date): RecurringPeriod {
	const start = weekStart(d)
	// Weeks since a fixed Monday (1970-01-05) rotate the type.
	const index = Math.round((start.getTime() - 4 * DAY) / WEEK)
	const type = WEEKLY_TYPES[index % WEEKLY_TYPES.length]
	const date = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`
	return {
		kind: "weekly",
		key: `weekly:${date}`,
		start,
		end: new Date(start.getTime() + WEEK),
		type,
		name: `${WEEKLY_NAMES[type]} (${MONTHS[start.getUTCMonth()].slice(0, 3)} ${start.getUTCDate()})`,
	}
}

export function monthlyPeriod(d: Date): RecurringPeriod {
	const y = d.getUTCFullYear()
	const m = d.getUTCMonth()
	const type = MONTHLY_TYPES[(y * 12 + m) % MONTHLY_TYPES.length]
	return {
		kind: "monthly",
		key: `monthly:${y}-${pad(m + 1)}`,
		start: new Date(Date.UTC(y, m, 1)),
		end: new Date(Date.UTC(y, m + 1, 1)),
		type,
		name: `${MONTHLY_NAMES[type]} (${MONTHS[m]})`,
	}
}

/** The tournaments that should exist at `now`: this and next week, this and
 * next month (so there is always one to join before it starts). */
export function recurringPeriods(now: Date): RecurringPeriod[] {
	const nextWeek = new Date(weekStart(now).getTime() + WEEK)
	const nextMonth = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
	)
	return [
		weeklyPeriod(now),
		weeklyPeriod(nextWeek),
		monthlyPeriod(now),
		monthlyPeriod(nextMonth),
	]
}
