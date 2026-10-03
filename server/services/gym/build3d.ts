// Building the 3D gym (gym3d slice 2): buy a For Sale lot, choose a room
// type once it is built, move / swap / store / rotate gear between spots,
// upgrade gear, speed a job up with Sweat (gym home), paint a room. The server is the
// source of truth: every action runs in one transaction that locks the
// user's gym row (SELECT ... FOR UPDATE), settles finished jobs, validates
// everything and only then writes.
import { and, asc, eq, sql } from "drizzle-orm"
import {
	ECONOMY,
	FLOOR_TINTS,
	finishCost,
	hoursMs,
	type LotShape,
	plotHours,
	plotPrice,
	upgradeInfo,
	WALL_COLORS,
} from "../../../shared/gym3d/economy.js"
import { lotsForSale } from "../../../shared/gym3d/lots.js"
import {
	type EquipmentRoomType,
	FLOOR_STYLES,
	itemSize,
	PAINT,
	RT,
	roomSpots,
} from "../../../shared/gym3d/rooms.js"
import {
	gymJobs,
	gymPieces,
	gymPlots,
	gymRooms,
	gymUpgradesCatalog,
	userGyms,
} from "../../db/schema.js"
import { recalcRoomLevel, settleJobs } from "./build3dJobs.js"
import { bankPiece } from "./income3d.js"
import { roomTypeFor } from "./layout3d.js"
import type { Db, Tx } from "./layout3dStore.js"

/** A rejected build action: HTTP status + a message the UI can show. */
export class BuildError extends Error {
	constructor(
		readonly status: 400 | 404 | 409,
		message: string,
	) {
		super(message)
	}
}

export type Locked = {
	id: number
	coins: number
	plotsBought: number
	sweat: number
	greens: number
}

/** Runs `fn` with the gym row locked and due jobs settled. */
export async function withGym<R>(
	db: Db,
	gymId: number,
	fn: (tx: Tx, gym: Locked, now: Date) => Promise<R>,
): Promise<R> {
	return db.transaction(async (tx) => {
		const [gym] = await tx
			.select({
				id: userGyms.id,
				coins: userGyms.coins,
				plotsBought: userGyms.plotsBought,
				sweat: userGyms.sweat,
				greens: userGyms.greens,
				seededAt: userGyms.layoutSeededAt,
			})
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		if (!gym) throw new BuildError(404, "No gym")
		if (!gym.seededAt) throw new BuildError(409, "Open your gym first")
		// whole seconds: timestamps are stored without fractions
		const now = new Date(Math.floor(Date.now() / 1000) * 1000)
		await settleJobs(tx, gymId, now)
		return fn(tx, gym, now)
	})
}

/** Takes `n` Sweat or Greens from the locked gym, or refuses. */
export async function spendCurrency(
	tx: Tx,
	gym: Locked,
	what: "sweat" | "greens",
	n: number,
): Promise<void> {
	if (n <= 0) return
	const have = gym[what]
	const name = what === "sweat" ? "Sweat" : "Greens"
	if (n > have)
		throw new BuildError(
			409,
			`Not enough ${name} (${n} needed, you have ${have})`,
		)
	await tx
		.update(userGyms)
		.set(
			what === "sweat"
				? { sweat: sql`${userGyms.sweat} - ${n}` }
				: { greens: sql`${userGyms.greens} - ${n}` },
		)
		.where(eq(userGyms.id, gym.id))
	gym[what] -= n
}

/** Takes `cost` coins from the locked gym, or refuses. */
export async function spend(tx: Tx, gym: Locked, cost: number): Promise<void> {
	if (cost > gym.coins)
		throw new BuildError(
			409,
			`Not enough coins (${cost} needed, you have ${gym.coins})`,
		)
	await tx
		.update(userGyms)
		.set({ coins: sql`${userGyms.coins} - ${cost}` })
		.where(eq(userGyms.id, gym.id))
	gym.coins -= cost
}

async function roomOf(tx: Tx, gymId: number, roomId: number) {
	const [room] = await tx
		.select()
		.from(gymRooms)
		.where(and(eq(gymRooms.id, roomId), eq(gymRooms.gymId, gymId)))
	if (!room) throw new BuildError(404, "Room not found")
	const cells = await tx
		.select()
		.from(gymPlots)
		.where(eq(gymPlots.roomId, roomId))
		.orderBy(asc(gymPlots.id))
	return {
		room,
		cells: cells.map((c) => ({ px: c.px, pz: c.pz })),
		building: cells.some((c) => c.state !== "owned"),
	}
}

async function pieceOf(tx: Tx, gymId: number, pieceId: number) {
	const [p] = await tx
		.select()
		.from(gymPieces)
		.where(and(eq(gymPieces.id, pieceId), eq(gymPieces.gymId, gymId)))
	if (!p) throw new BuildError(404, "Piece not found")
	return p
}

async function pieceRoomType(
	tx: Tx,
	upgradeKey: string | null,
): Promise<EquipmentRoomType | null> {
	if (!upgradeKey) return null
	const [c] = await tx
		.select({
			category: gymUpgradesCatalog.category,
			sortOrder: gymUpgradesCatalog.sortOrder,
		})
		.from(gymUpgradesCatalog)
		.where(eq(gymUpgradesCatalog.key, upgradeKey))
	return roomTypeFor({
		key: upgradeKey,
		category: c?.category ?? "",
		sortOrder: c?.sortOrder ?? 0,
	})
}

// ── plots ────────────────────────────────────────────────────────────────

export async function buyLot(
	db: Db,
	gymId: number,
	lotId: string,
): Promise<void> {
	await withGym(db, gymId, async (tx, gym, now) => {
		const built = await tx
			.select({ px: gymPlots.px, pz: gymPlots.pz })
			.from(gymPlots)
			.where(eq(gymPlots.gymId, gymId))
		const lot = lotsForSale(built).find((l) => l.id === lotId)
		if (!lot) throw new BuildError(409, "That plot is not for sale")
		const shape = lot.shape as LotShape
		const price = plotPrice(shape, gym.plotsBought)
		await spend(tx, gym, price)
		const [room] = await tx
			.insert(gymRooms)
			.values({ gymId, type: "empty", shape, level: 1 })
			.$returningId()
		await tx.insert(gymPlots).values(
			lot.cells.map((c) => ({
				gymId,
				px: c.px,
				pz: c.pz,
				state: "building",
				lotShape: shape,
				roomId: room.id,
			})),
		)
		await tx
			.update(userGyms)
			.set({ plotsBought: sql`${userGyms.plotsBought} + 1` })
			.where(eq(userGyms.id, gymId))
		await tx.insert(gymJobs).values({
			gymId,
			kind: "plot",
			roomId: room.id,
			cost: price,
			status: "active",
			startedAt: now,
			endsAt: new Date(now.getTime() + hoursMs(plotHours(shape))),
		})
	})
}

export const PICKABLE_TYPES: readonly EquipmentRoomType[] = [
	"cardio",
	"weights",
	"boxing",
	"recovery",
	"juice",
	"pool",
	"court",
]

export async function chooseRoomType(
	db: Db,
	gymId: number,
	roomId: number,
	type: string,
): Promise<void> {
	if (!PICKABLE_TYPES.includes(type as EquipmentRoomType))
		throw new BuildError(400, "Unknown room type")
	await withGym(db, gymId, async (tx) => {
		const { room, building } = await roomOf(tx, gymId, roomId)
		if (building) throw new BuildError(409, "Still under construction")
		if (room.type !== "empty")
			throw new BuildError(409, "The room type is already set")
		await tx
			.update(gymRooms)
			.set({ type, level: 1 })
			.where(eq(gymRooms.id, roomId))
	})
}

export async function paintRoom(
	db: Db,
	gymId: number,
	roomId: number,
	paint: { wall?: unknown; floorStyle?: unknown; floorColor?: unknown },
): Promise<void> {
	const walls = new Set([
		...WALL_COLORS,
		...Object.values(PAINT).map((p) => p.wall),
	])
	const tints = new Set([
		...FLOOR_TINTS,
		...Object.values(PAINT).map((p) => p.floorColor),
	])
	const set: {
		wallColor?: string
		floorStyle?: string
		floorColor?: string
	} = {}
	if (paint.wall !== undefined) {
		if (typeof paint.wall !== "string" || !walls.has(paint.wall))
			throw new BuildError(400, "Unknown wall colour")
		set.wallColor = paint.wall
	}
	if (paint.floorStyle !== undefined) {
		if (
			typeof paint.floorStyle !== "string" ||
			!(FLOOR_STYLES as readonly string[]).includes(paint.floorStyle)
		)
			throw new BuildError(400, "Unknown floor style")
		set.floorStyle = paint.floorStyle
	}
	if (paint.floorColor !== undefined) {
		if (typeof paint.floorColor !== "string" || !tints.has(paint.floorColor))
			throw new BuildError(400, "Unknown floor colour")
		set.floorColor = paint.floorColor
	}
	if (!Object.keys(set).length) throw new BuildError(400, "Nothing to paint")
	await withGym(db, gymId, async (tx) => {
		const { building } = await roomOf(tx, gymId, roomId)
		if (building) throw new BuildError(409, "Still under construction")
		await tx.update(gymRooms).set(set).where(eq(gymRooms.id, roomId))
	})
}

// ── pieces ───────────────────────────────────────────────────────────────

type PieceRow = typeof gymPieces.$inferSelect

function assertMovable(p: PieceRow): void {
	if (p.kind !== "equipment" || p.locked)
		throw new BuildError(409, "This piece stays where it is")
	if (p.status === "upgrading")
		throw new BuildError(409, "It is being upgraded right now")
}

/** Moves a piece onto a spot. A filled spot swaps: the piece already there
 * goes to the moved piece's old spot when it fits there, else to storage. */
export async function movePiece(
	db: Db,
	gymId: number,
	pieceId: number,
	roomId: number,
	spotIndex: number,
): Promise<void> {
	if (!Number.isInteger(spotIndex) || spotIndex < 0)
		throw new BuildError(400, "Bad spot")
	await withGym(db, gymId, async (tx, _gym, now) => {
		const p = await pieceOf(tx, gymId, pieceId)
		assertMovable(p)
		const rt = await pieceRoomType(tx, p.upgradeKey)
		if (!rt) throw new BuildError(409, "This piece stays where it is")
		const { room, cells, building } = await roomOf(tx, gymId, roomId)
		if (building) throw new BuildError(409, "Still under construction")
		if (room.type !== rt)
			throw new BuildError(
				409,
				`That goes in a ${RT[rt].name} room, not this one`,
			)
		const spots = roomSpots(rt, cells)
		const spot = spots[spotIndex]
		if (!spot) throw new BuildError(400, "Bad spot")
		const size = itemSize(p.itemKey, "equipment")
		if (spot.size !== size)
			throw new BuildError(409, "That spot is the wrong size for it")
		if (spot.unlock > room.level)
			throw new BuildError(409, `That spot opens at room Lv ${spot.unlock}`)
		if (p.roomId === roomId && p.spotIndex === spotIndex) return

		const [other] = await tx
			.select()
			.from(gymPieces)
			.where(
				and(eq(gymPieces.roomId, roomId), eq(gymPieces.spotIndex, spotIndex)),
			)
		if (other && other.status === "upgrading")
			throw new BuildError(409, "The piece there is being upgraded")

		// where the other piece goes: the moved piece's old spot if it fits
		let otherTo: {
			roomId: number
			spotIndex: number
			x: number
			z: number
		} | null = null
		if (other && p.roomId != null && p.spotIndex != null) {
			const from = await roomOf(tx, gymId, p.roomId)
			const ort = await pieceRoomType(tx, other.upgradeKey)
			const ft = from.room.type
			const fs =
				ft in RT
					? roomSpots(ft as EquipmentRoomType, from.cells)[p.spotIndex]
					: undefined
			if (
				fs &&
				ort === from.room.type &&
				fs.size === itemSize(other.itemKey, "equipment") &&
				fs.unlock <= from.room.level
			)
				otherTo = { roomId: p.roomId, spotIndex: p.spotIndex, x: fs.x, z: fs.z }
		}
		// a machine going to storage pays out its coin bubble first
		if (other && !otherTo) await bankPiece(tx, gymId, other.id, now)
		// free both spots first: (room_id, spot_index) is unique
		const oldRoom = p.roomId
		await tx
			.update(gymPieces)
			.set({ spotIndex: null })
			.where(eq(gymPieces.id, p.id))
		if (other) {
			await tx
				.update(gymPieces)
				.set(
					otherTo
						? {
								roomId: otherTo.roomId,
								spotIndex: otherTo.spotIndex,
								posX2: Math.round(otherTo.x * 2),
								posZ2: Math.round(otherTo.z * 2),
								status: "placed",
							}
						: {
								roomId: null,
								spotIndex: null,
								posX2: 0,
								posZ2: 0,
								status: "stored",
							},
				)
				.where(eq(gymPieces.id, other.id))
		}
		await tx
			.update(gymPieces)
			.set({
				roomId,
				spotIndex,
				posX2: Math.round(spot.x * 2),
				posZ2: Math.round(spot.z * 2),
				status: "placed",
				// out of storage: its bubble starts filling now
				...(p.status === "stored" ? { collectedAt: now } : {}),
			})
			.where(eq(gymPieces.id, p.id))
		await recalcRoomLevel(tx, roomId)
		if (oldRoom != null && oldRoom !== roomId)
			await recalcRoomLevel(tx, oldRoom)
	})
}

export async function storePiece(
	db: Db,
	gymId: number,
	pieceId: number,
): Promise<void> {
	await withGym(db, gymId, async (tx, _gym, now) => {
		const p = await pieceOf(tx, gymId, pieceId)
		assertMovable(p)
		if (p.status === "stored") return
		if (!(await pieceRoomType(tx, p.upgradeKey)))
			throw new BuildError(409, "This piece stays where it is")
		await bankPiece(tx, gymId, p.id, now)
		await tx
			.update(gymPieces)
			.set({
				roomId: null,
				spotIndex: null,
				posX2: 0,
				posZ2: 0,
				status: "stored",
			})
			.where(eq(gymPieces.id, p.id))
	})
}

export async function rotatePiece(
	db: Db,
	gymId: number,
	pieceId: number,
): Promise<void> {
	await withGym(db, gymId, async (tx) => {
		const p = await pieceOf(tx, gymId, pieceId)
		if (p.locked) throw new BuildError(409, "This piece stays where it is")
		if (p.status === "upgrading")
			throw new BuildError(409, "It is being upgraded right now")
		if (p.status === "stored")
			throw new BuildError(409, "Place it on a spot first")
		await tx
			.update(gymPieces)
			.set({ rot: (p.rot + 1) % 4 })
			.where(eq(gymPieces.id, p.id))
	})
}

export async function upgradePiece(
	db: Db,
	gymId: number,
	pieceId: number,
): Promise<void> {
	await withGym(db, gymId, async (tx, gym, now) => {
		const p = await pieceOf(tx, gymId, pieceId)
		if (p.kind !== "equipment" || p.locked)
			throw new BuildError(409, "This piece cannot be upgraded")
		if (p.status === "upgrading")
			throw new BuildError(409, "It is already being upgraded")
		if (p.status !== "placed" || p.spotIndex == null)
			throw new BuildError(409, "Place it on a spot first")
		const u = upgradeInfo(p.itemKey, p.tier)
		if (!u) throw new BuildError(409, "Already at max tier")
		await spend(tx, gym, u.cost)
		// no coins while the work is on; its bubble is paid out first
		await bankPiece(tx, gymId, p.id, now)
		await tx
			.update(gymPieces)
			.set({ status: "upgrading" })
			.where(eq(gymPieces.id, p.id))
		await tx.insert(gymJobs).values({
			gymId,
			kind: "upgrade",
			pieceId: p.id,
			roomId: p.roomId,
			targetTier: u.toTier,
			cost: u.cost,
			status: "active",
			startedAt: now,
			endsAt: new Date(now.getTime() + hoursMs(u.hours)),
		})
	})
}

/** Speeds a job up with Sweat: "hour" takes one hour off for 1 Sweat,
 * "finish" ends it now for ceil(remaining hours) Sweat. `maxCost` (what the
 * player saw) guards against paying more than shown. */
export async function sweatJob(
	db: Db,
	gymId: number,
	jobId: number,
	mode: "hour" | "finish",
	maxCost?: number,
): Promise<{ cost: number }> {
	return withGym(db, gymId, async (tx, gym, now) => {
		const [j] = await tx
			.select()
			.from(gymJobs)
			.where(and(eq(gymJobs.id, jobId), eq(gymJobs.gymId, gymId)))
		if (!j) throw new BuildError(404, "Job not found")
		if (j.status !== "active") return { cost: 0 }
		const left = j.endsAt.getTime() - now.getTime()
		const cost = mode === "finish" ? finishCost(left) : 1
		if (maxCost != null && cost > maxCost)
			throw new BuildError(409, `It costs ${cost} Sweat now`)
		await spendCurrency(tx, gym, "sweat", cost)
		const cut = hoursMs(ECONOMY.sweat.hoursPerSweat)
		const endsAt =
			mode === "finish"
				? now
				: new Date(
						Math.max(
							now.getTime(),
							j.startedAt.getTime(),
							j.endsAt.getTime() - cut,
						),
					)
		await tx.update(gymJobs).set({ endsAt }).where(eq(gymJobs.id, j.id))
		await settleJobs(tx, gymId, now)
		return { cost }
	})
}
