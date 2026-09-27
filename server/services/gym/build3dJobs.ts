// Construction jobs of the 3D gym (gym3d slice 2). A job runs until its
// ends_at; there is no worker: every read or write of the gym settles the
// jobs that are due (lazy completion). Real activity (a check-in, a finished
// mission) takes time off every active job.
import { and, eq, isNotNull, lte, sql } from "drizzle-orm"
import { ECONOMY, levelFromPoints } from "../../../shared/gym3d/economy.js"
import {
	gymActivityCuts,
	gymJobs,
	gymPieces,
	gymPlots,
	gymRooms,
	userGyms,
} from "../../db/schema.js"
import type { Conn, Db } from "./layout3dStore.js"

/** Raises a room's level to what its pieces' tiers earn (never lowers it:
 * nothing is ever lost). Returns the new level. */
export async function recalcRoomLevel(
	conn: Conn,
	roomId: number,
): Promise<number> {
	const [room] = await conn
		.select({ level: gymRooms.level })
		.from(gymRooms)
		.where(eq(gymRooms.id, roomId))
	if (!room) return 1
	const [row] = await conn
		.select({ pts: sql<number>`COALESCE(SUM(${gymPieces.tier}), 0)` })
		.from(gymPieces)
		.where(and(eq(gymPieces.roomId, roomId), isNotNull(gymPieces.spotIndex)))
	const lv = Math.max(room.level, levelFromPoints(Number(row?.pts ?? 0)))
	if (lv !== room.level)
		await conn
			.update(gymRooms)
			.set({ level: lv })
			.where(eq(gymRooms.id, roomId))
	return lv
}

/** Finishes every active job of the gym whose time is up. Each job is
 * claimed with a conditional update first, so a job is applied once even
 * when two requests settle at the same moment. */
export async function settleJobs(
	conn: Conn,
	gymId: number,
	now: Date,
): Promise<number> {
	const due = await conn
		.select()
		.from(gymJobs)
		.where(
			and(
				eq(gymJobs.gymId, gymId),
				eq(gymJobs.status, "active"),
				lte(gymJobs.endsAt, now),
			),
		)
	let n = 0
	for (const j of due) {
		const [res] = await conn
			.update(gymJobs)
			.set({ status: "done", finishedAt: j.endsAt })
			.where(and(eq(gymJobs.id, j.id), eq(gymJobs.status, "active")))
		if (!res.affectedRows) continue
		n++
		if (j.kind === "plot" && j.roomId != null) {
			await conn
				.update(gymPlots)
				.set({ state: "owned" })
				.where(and(eq(gymPlots.gymId, gymId), eq(gymPlots.roomId, j.roomId)))
		} else if (j.kind === "upgrade" && j.pieceId != null) {
			const [p] = await conn
				.select()
				.from(gymPieces)
				.where(eq(gymPieces.id, j.pieceId))
			if (!p) continue
			await conn
				.update(gymPieces)
				.set({
					tier: Math.max(p.tier, j.targetTier ?? p.tier),
					status: p.status === "upgrading" ? "placed" : p.status,
				})
				.where(eq(gymPieces.id, p.id))
			if (p.roomId != null) await recalcRoomLevel(conn, p.roomId)
		}
	}
	return n
}

/** Real activity was logged: take `hours` off every active job of the
 * user's gym (they finish on the next read once their time is up).
 * Returns how many jobs were sped up. */
/** Takes `hours` off every active job of the user's gym for one real
 * activity. `source` names that activity (see gymActivityCuts); an activity
 * already recorded cuts nothing, so undoing and redoing it never repeats
 * the cut (and undoing it refunds nothing). Returns the jobs cut. */
export async function cutActiveJobs(
	userId: string,
	db: Db,
	source: string,
	hours: number = ECONOMY.activityCutHours,
): Promise<number> {
	const [gym] = await db
		.select({ id: userGyms.id })
		.from(userGyms)
		.where(eq(userGyms.userId, userId))
	if (!gym) return 0
	return db.transaction(async (tx) => {
		const [claim] = await tx
			.insert(gymActivityCuts)
			.ignore()
			.values({ gymId: gym.id, source: source.slice(0, 64) })
		if (!claim.affectedRows) return 0
		const secs = Math.round(hours * 3600)
		const [res] = await tx
			.update(gymJobs)
			.set({
				endsAt: sql`GREATEST(${gymJobs.startedAt}, ${gymJobs.endsAt} - INTERVAL ${secs} SECOND)`,
			})
			.where(and(eq(gymJobs.gymId, gym.id), eq(gymJobs.status, "active")))
		return res.affectedRows ?? 0
	})
}
