// Construction jobs of the 3D gym (gym3d slice 2). A job runs until its
// ends_at; there is no worker: every read or write of the gym settles the
// jobs that are due (lazy completion). Sweat speeds a job up (build3d.ts).
import { and, eq, isNotNull, lte, sql } from "drizzle-orm"
import { levelFromPoints } from "../../../shared/gym3d/economy.js"
import { gymJobs, gymPieces, gymPlots, gymRooms } from "../../db/schema.js"
import type { Conn } from "./layout3dStore.js"

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
					// its coin bubble starts filling again when the work is done
					collectedAt: j.endsAt,
				})
				.where(eq(gymPieces.id, p.id))
			if (p.roomId != null) await recalcRoomLevel(conn, p.roomId)
		}
	}
	return n
}
