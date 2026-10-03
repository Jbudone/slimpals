// Open walls (gym home): knocking out the wall between two finished rooms
// for coins. Validated here (the wall must exist between two different,
// finished, typed rooms and not be open yet) and charged under the gym row
// lock; the client only draws what the layout says.
import { eq } from "drizzle-orm"
import {
	isWallAxis,
	openWallCost,
	sharedWalls,
	type WallRef,
	wallKey,
} from "../../../shared/gym3d/walls.js"
import { gymOpenWalls, gymPlots, gymRooms } from "../../db/schema.js"
import { BuildError, spend, withGym } from "./build3d.js"
import type { Conn } from "./layout3dStore.js"

/** The walls the gym has opened. */
export async function openWallRefs(
	conn: Conn,
	gymId: number,
): Promise<WallRef[]> {
	const rows = await conn
		.select({
			px: gymOpenWalls.px,
			pz: gymOpenWalls.pz,
			axis: gymOpenWalls.axis,
		})
		.from(gymOpenWalls)
		.where(eq(gymOpenWalls.gymId, gymId))
	return rows.flatMap((r) =>
		isWallAxis(r.axis) ? [{ px: r.px, pz: r.pz, axis: r.axis }] : [],
	)
}

export async function openWall(
	db: Parameters<typeof withGym>[0],
	gymId: number,
	input: { px: unknown; pz: unknown; axis: unknown },
): Promise<void> {
	const { px, pz, axis } = input
	if (!Number.isInteger(px) || !Number.isInteger(pz) || !isWallAxis(axis))
		throw new BuildError(400, "Bad wall")
	const ref: WallRef = { px: px as number, pz: pz as number, axis }
	await withGym(db, gymId, async (tx, gym) => {
		const plots = await tx
			.select({
				px: gymPlots.px,
				pz: gymPlots.pz,
				state: gymPlots.state,
				roomId: gymPlots.roomId,
			})
			.from(gymPlots)
			.where(eq(gymPlots.gymId, gymId))
		const roomRows = await tx
			.select({ id: gymRooms.id, type: gymRooms.type })
			.from(gymRooms)
			.where(eq(gymRooms.gymId, gymId))
		const busy = new Set(
			plots.filter((p) => p.state !== "owned").map((p) => p.roomId),
		)
		const rooms = roomRows.map((r) => ({
			id: r.id,
			type: r.type,
			building: busy.has(r.id),
		}))
		const key = wallKey(ref)
		if (!sharedWalls(plots, rooms).some((w) => wallKey(w.ref) === key))
			throw new BuildError(409, "There is no wall to open there")
		const opened = await openWallRefs(tx, gymId)
		if (opened.some((w) => wallKey(w) === key))
			throw new BuildError(409, "That wall is already open")
		await spend(tx, gym, openWallCost(opened.length))
		const [claim] = await tx
			.insert(gymOpenWalls)
			.ignore()
			.values({ gymId, px: ref.px, pz: ref.pz, axis: ref.axis })
		if (!claim.affectedRows)
			throw new BuildError(409, "That wall is already open")
	})
}
