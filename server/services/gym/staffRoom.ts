// The staff room (shared/gym3d/staffRoom.ts) for one gym: how many coaches it
// has and which episodes were seen. Seeing one is a `gym_rewards` claim
// `room:<arc>.<slot date>.<n>` with no payout (no table, like the story).
import { and, eq, like, sql } from "drizzle-orm"
import { type RoomDto, roomState } from "../../../shared/gym3d/staffRoom.js"
import { gymHires, gymRewards } from "../../db/schema.js"
import { BuildError } from "./build3d.js"
import type { Db } from "./layout3dStore.js"

export const ROOM_PREFIX = "room:"

export async function getStaffRoomDto(
	db: Db,
	gymId: number,
	now = new Date(),
): Promise<RoomDto> {
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)` })
		.from(gymHires)
		.where(eq(gymHires.gymId, gymId))
	const rows = await db
		.select({ source: gymRewards.source })
		.from(gymRewards)
		.where(
			and(
				eq(gymRewards.gymId, gymId),
				like(gymRewards.source, `${ROOM_PREFIX}%`),
			),
		)
	const seen = rows.map((r) => r.source.slice(ROOM_PREFIX.length))
	return roomState(Number(n) || 0, seen, now)
}

/** Records that the waiting episode was seen (only that one, once). */
export async function markEpisodeSeen(
	db: Db,
	gymId: number,
	id: string,
	now = new Date(),
): Promise<RoomDto> {
	const dto = await getStaffRoomDto(db, gymId, now)
	if (dto.pending?.id !== id)
		throw new BuildError(409, "That episode is not waiting")
	await db
		.insert(gymRewards)
		.ignore()
		.values({
			gymId,
			source: `${ROOM_PREFIX}${id}`.slice(0, 64),
			sweat: 0,
			greens: 0,
		})
	return getStaffRoomDto(db, gymId, now)
}
