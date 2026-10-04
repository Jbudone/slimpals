// An admin's authored reward-track month (#126): load, save and clear the
// override row; the rules for what it may hold are in shared/gym3d/rewardTrack.ts.
import { eq } from "drizzle-orm"
import {
	daysInMonth,
	type TrackOverride,
	validateTrackOverride,
} from "../../../shared/gym3d/rewardTrack.js"
import { rewardTrackOverrides } from "../../db/schema.js"
import { BuildError } from "./build3d.js"
import type { Db } from "./layout3dStore.js"

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export async function loadTrackOverride(
	db: Db,
	key: string,
): Promise<TrackOverride | null> {
	const [row] = await db
		.select({ override: rewardTrackOverrides.override })
		.from(rewardTrackOverrides)
		.where(eq(rewardTrackOverrides.monthKey, key))
	return (row?.override as TrackOverride | undefined) ?? null
}

export async function saveTrackOverride(
	db: Db,
	key: string,
	raw: unknown,
): Promise<TrackOverride> {
	if (!MONTH_RE.test(key)) throw new BuildError(400, "month must be YYYY-MM")
	const v = validateTrackOverride(raw, daysInMonth(key))
	if (!v.ok) throw new BuildError(400, v.error)
	await db
		.insert(rewardTrackOverrides)
		.values({ monthKey: key, override: v.value })
		.onDuplicateKeyUpdate({ set: { override: v.value } })
	return v.value
}

export async function clearTrackOverride(db: Db, key: string): Promise<void> {
	await db
		.delete(rewardTrackOverrides)
		.where(eq(rewardTrackOverrides.monthKey, key))
}
