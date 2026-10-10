// Room vibes (gym home): set or clear a finished room's vibe. Setting (or
// changing) one costs coins the first time only (it is then owned by the
// gym for good), clearing is free; validated and charged under
// the gym row lock like the other build actions.
import { and, eq } from "drizzle-orm"
import { isVibe, VIBE } from "../../../shared/gym3d/vibes.js"
import { gymPlots, gymRewards, gymRooms } from "../../db/schema.js"
import { BuildError, spend, withGym } from "./build3d.js"

export async function setRoomVibe(
	db: Parameters<typeof withGym>[0],
	gymId: number,
	roomId: number,
	vibe: unknown,
): Promise<void> {
	if (!Number.isInteger(roomId)) throw new BuildError(400, "Bad room")
	const next = vibe === "none" || vibe === null ? null : vibe
	if (next !== null && !isVibe(next)) throw new BuildError(400, "Unknown vibe")
	await withGym(db, gymId, async (tx, gym) => {
		const [room] = await tx
			.select({
				gymId: gymRooms.gymId,
				type: gymRooms.type,
				vibe: gymRooms.vibe,
			})
			.from(gymRooms)
			.where(eq(gymRooms.id, roomId))
		if (!room || room.gymId !== gymId) throw new BuildError(404, "No such room")
		if (room.type === "lobby" || room.type === "empty")
			throw new BuildError(409, "This room cannot have a vibe")
		const plots = await tx
			.select({ state: gymPlots.state })
			.from(gymPlots)
			.where(eq(gymPlots.roomId, roomId))
		if (plots.some((p) => p.state !== "owned"))
			throw new BuildError(409, "The room is still being built")
		if (next === room.vibe)
			throw new BuildError(409, "It already has that vibe")
		if (next !== null) {
			// bought once, owned for good: the claim is the purchase
			const source = `vibe:${next}`
			const [owned] = await tx
				.select({ id: gymRewards.id })
				.from(gymRewards)
				.where(and(eq(gymRewards.gymId, gymId), eq(gymRewards.source, source)))
			if (!owned) {
				await spend(tx, gym, VIBE.cost)
				await tx.insert(gymRewards).values({ gymId, source })
			}
		}
		await tx.update(gymRooms).set({ vibe: next }).where(eq(gymRooms.id, roomId))
	})
}
