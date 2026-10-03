// Putting an owned decor cosmetic on show (gym home): it becomes a decor
// piece on the first free decor place of a finished room, and can be taken
// down again. A cosmetic is on show at most once (the piece's upgrade key is
// `cosmetic:<key>`, unique per gym). Placed decor scores like any decor in
// the star rating.
import { and, eq } from "drizzle-orm"
import {
	cosmeticOf,
	cosmeticPieceKey,
} from "../../../shared/gym3d/cosmetics.js"
import { decorSlots, isRoomType, PD, PW } from "../../../shared/gym3d/rooms.js"
import { gymCosmetics, gymPieces, gymPlots, gymRooms } from "../../db/schema.js"
import { BuildError, withGym } from "./build3d.js"
import type { Db } from "./layout3dStore.js"

const half = (v: number) => Math.round(v * 2)

export async function placeCosmetic(
	db: Db,
	gymId: number,
	key: string,
	roomId: number,
): Promise<void> {
	const def = cosmeticOf(key)
	if (!def?.builder) throw new BuildError(400, "That cannot be placed")
	await withGym(db, gymId, async (tx) => {
		const [own] = await tx
			.select({ id: gymCosmetics.id })
			.from(gymCosmetics)
			.where(
				and(eq(gymCosmetics.gymId, gymId), eq(gymCosmetics.cosmeticKey, key)),
			)
		if (!own) throw new BuildError(409, "You do not own that yet")
		const [shown] = await tx
			.select({ id: gymPieces.id })
			.from(gymPieces)
			.where(
				and(
					eq(gymPieces.gymId, gymId),
					eq(gymPieces.upgradeKey, cosmeticPieceKey(key)),
				),
			)
		if (shown) throw new BuildError(409, `${def.name} is already on show`)
		const [room] = await tx
			.select()
			.from(gymRooms)
			.where(and(eq(gymRooms.id, roomId), eq(gymRooms.gymId, gymId)))
		if (!room) throw new BuildError(404, "Room not found")
		if (!isRoomType(room.type))
			throw new BuildError(409, "Pick a type for that room first")
		const cells = await tx
			.select({ px: gymPlots.px, pz: gymPlots.pz })
			.from(gymPlots)
			.where(and(eq(gymPlots.roomId, roomId), eq(gymPlots.gymId, gymId)))
		if (!cells.length) throw new BuildError(409, "That room is not built yet")
		cells.sort((a, b) => a.px - b.px || a.pz - b.pz)
		const taken = new Set(
			(
				await tx
					.select({ x: gymPieces.posX2, z: gymPieces.posZ2 })
					.from(gymPieces)
					.where(eq(gymPieces.gymId, gymId))
			).map((p) => `${p.x},${p.z}`),
		)
		const slot = decorSlots(room.type)
			.map((s) => ({
				x2: half(cells[0].px * PW + s.x),
				z2: half(cells[0].pz * PD + s.z),
			}))
			.find((s) => !taken.has(`${s.x2},${s.z2}`))
		if (!slot) throw new BuildError(409, "No free decor place in that room")
		await tx.insert(gymPieces).values({
			gymId,
			roomId,
			kind: "decor",
			itemKey: def.builder as string,
			upgradeKey: cosmeticPieceKey(key),
			posX2: slot.x2,
			posZ2: slot.z2,
			status: "placed",
		})
	})
}

/** Takes a placed cosmetic down (it stays owned). */
export async function removeCosmetic(
	db: Db,
	gymId: number,
	key: string,
): Promise<void> {
	await withGym(db, gymId, async (tx) => {
		const [res] = await tx
			.delete(gymPieces)
			.where(
				and(
					eq(gymPieces.gymId, gymId),
					eq(gymPieces.upgradeKey, cosmeticPieceKey(key)),
				),
			)
		if (!res.affectedRows) throw new BuildError(409, "It is not on show")
	})
}
