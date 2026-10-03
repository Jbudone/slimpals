// Hiring staff for a room (gym home): validated here (a finished, typed room
// with a free post) and charged under the gym row lock; the client only
// draws what the layout says. Hires are trained through the staff card
// endpoints (see staff.ts) and add their bonus in income3d.ts.
import { asc, eq } from "drizzle-orm"
import {
	canHireIn,
	HIRE,
	HIRE_ROLES,
	hireCost,
	hireName,
} from "../../../shared/gym3d/hires.js"
import type { GymHireDto } from "../../../shared/types.js"
import { gymHires, gymPlots, gymRooms } from "../../db/schema.js"
import { BuildError, spend, withGym } from "./build3d.js"
import type { Conn } from "./layout3dStore.js"

/** Every hire of the gym, oldest first, with the post each stands at. */
export async function hireDtos(
	conn: Conn,
	gymId: number,
): Promise<GymHireDto[]> {
	const rows = await conn
		.select()
		.from(gymHires)
		.where(eq(gymHires.gymId, gymId))
		.orderBy(asc(gymHires.id))
	const seen = new Map<number, number>()
	return rows.map((r) => {
		const post = seen.get(r.roomId) ?? 0
		seen.set(r.roomId, post + 1)
		return {
			id: r.id,
			roomId: r.roomId,
			role: r.role,
			name: r.name,
			level: r.level,
			post,
		}
	})
}

export async function hireStaff(
	db: Parameters<typeof withGym>[0],
	gymId: number,
	roomId: number,
): Promise<void> {
	if (!Number.isInteger(roomId)) throw new BuildError(400, "Bad room")
	await withGym(db, gymId, async (tx, gym) => {
		const [room] = await tx
			.select({ id: gymRooms.id, type: gymRooms.type, gymId: gymRooms.gymId })
			.from(gymRooms)
			.where(eq(gymRooms.id, roomId))
		if (!room || room.gymId !== gymId) throw new BuildError(404, "No such room")
		if (!canHireIn(room.type))
			throw new BuildError(409, "Nobody works in this kind of room")
		const plots = await tx
			.select({ state: gymPlots.state })
			.from(gymPlots)
			.where(eq(gymPlots.roomId, roomId))
		if (plots.some((p) => p.state !== "owned"))
			throw new BuildError(409, "The room is still being built")
		const all = await tx
			.select({ id: gymHires.id, roomId: gymHires.roomId })
			.from(gymHires)
			.where(eq(gymHires.gymId, gymId))
		if (all.filter((h) => h.roomId === roomId).length >= HIRE.perRoom)
			throw new BuildError(409, "This room has all the staff it needs")
		await spend(tx, gym, hireCost(all.length))
		await tx.insert(gymHires).values({
			gymId,
			roomId,
			role: HIRE_ROLES[room.type].role,
			name: hireName(room.type, all.length),
		})
	})
}
