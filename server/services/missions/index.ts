import type { MissionCadence } from "../../../shared/types.js"
import { getMondayOfWeek } from "../sprints/index.js"

function startOfDayUtc(d: Date): Date {
	const r = new Date(d)
	r.setUTCHours(0, 0, 0, 0)
	return r
}

/** The start of the period a mission's cadence currently belongs to — UTC
 * midnight for daily, UTC Monday for weekly (matching the boundary sprints
 * already uses via getMondayOfWeek). Comparing a completion's stored
 * periodStart against this is how "has this mission reset" is derived,
 * with no background job needed. */
export function currentPeriodStart(
	cadence: MissionCadence,
	now: Date = new Date(),
): Date {
	return cadence === "weekly" ? getMondayOfWeek(now) : startOfDayUtc(now)
}

/** Whether a completion's periodStart still belongs to the mission's
 * current period (i.e. the mission is "completed" right now). */
export function isWithinCurrentPeriod(
	periodStart: Date,
	cadence: MissionCadence,
	now: Date = new Date(),
): boolean {
	return periodStart.getTime() === currentPeriodStart(cadence, now).getTime()
}
