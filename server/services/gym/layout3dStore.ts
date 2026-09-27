// Persistence for the 3D gym layout (gym3d slice 1). Seeds a gym's layout on
// first read and places newly unlocked upgrades on later reads, using the
// pure planner in layout3d.ts. Seeding runs in a transaction that locks the
// gym row (SELECT ... FOR UPDATE), so two first reads racing each other
// cannot both seed.

import { asc, eq, inArray } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import {
	isRoomType,
	PAINT,
	type RoomType,
} from "../../../shared/gym3d/rooms.js"
import type { GymLayoutDto, GymLayoutPieceDto } from "../../../shared/types.js"
import type * as schema from "../../db/schema.js"
import {
	gymPieces,
	gymPlots,
	gymRooms,
	gymUpgradesCatalog,
	userGyms,
	userGymUpgrades,
} from "../../db/schema.js"
import {
	type LayoutPlan,
	lobbyOnlyPlan,
	type PieceKind,
	type PlanRoom,
	placeNewUnlocks,
	type UnlockedUpgrade,
} from "./layout3d.js"

type Db = MySql2Database<typeof schema>
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type Conn = Db | Tx

/** Display names for decor builders that have no catalog row of their own. */
const DECOR_NAMES: Readonly<Record<string, string>> = {
	plant: "Potted plant",
	palm: "Tall plant",
	poster: "Poster board",
	neon: "Neon sign",
	mirror: "Standing mirror",
	studio_mirror: "Studio mirror",
	trophy: "Trophy stand",
}

async function unlockedUpgrades(
	conn: Conn,
	gymId: number,
): Promise<UnlockedUpgrade[]> {
	const rows = await conn
		.select({
			key: userGymUpgrades.upgradeKey,
			category: gymUpgradesCatalog.category,
			sortOrder: gymUpgradesCatalog.sortOrder,
		})
		.from(userGymUpgrades)
		.leftJoin(
			gymUpgradesCatalog,
			eq(gymUpgradesCatalog.key, userGymUpgrades.upgradeKey),
		)
		.where(eq(userGymUpgrades.gymId, gymId))
	// A claimed key missing from the catalog still gets listed (as unplaced),
	// never dropped.
	return rows.map((r) => ({
		key: r.key,
		category: r.category ?? "",
		sortOrder: r.sortOrder ?? 0,
	}))
}

/** The stored layout as a plan (room refs are DB ids). */
async function readPlan(conn: Conn, gymId: number): Promise<LayoutPlan> {
	const rooms = await conn
		.select()
		.from(gymRooms)
		.where(eq(gymRooms.gymId, gymId))
		.orderBy(asc(gymRooms.id))
	const plots = await conn
		.select()
		.from(gymPlots)
		.where(eq(gymPlots.gymId, gymId))
		.orderBy(asc(gymPlots.id))
	const pieces = await conn
		.select()
		.from(gymPieces)
		.where(eq(gymPieces.gymId, gymId))
		.orderBy(asc(gymPieces.id))
	const planRooms: PlanRoom[] = []
	for (const r of rooms) {
		if (!isRoomType(r.type)) continue
		planRooms.push({
			ref: r.id,
			id: r.id,
			type: r.type,
			shape: "normal",
			level: r.level,
			cells: plots
				.filter((p) => p.roomId === r.id)
				.map((p) => ({ px: p.px, pz: p.pz })),
		})
	}
	return {
		rooms: planRooms,
		pieces: pieces.map((p) => ({
			id: p.id,
			kind: (p.kind === "decor" ? "decor" : "equipment") as PieceKind,
			itemKey: p.itemKey,
			upgradeKey: p.upgradeKey,
			roomRef: p.roomId ?? 0,
			spotIndex: p.spotIndex,
			x2: p.posX2,
			z2: p.posZ2,
			rot: p.rot,
			locked: p.locked,
		})),
		unplaced: [],
	}
}

function hasChanges(before: LayoutPlan, after: LayoutPlan): boolean {
	if (after.rooms.some((r) => r.id == null)) return true
	if (after.pieces.some((p) => p.id == null)) return true
	return after.rooms.some((r) => {
		const old = before.rooms.find((q) => q.ref === r.ref)
		return !old || old.level !== r.level
	})
}

/** Writes the rows `next` adds on top of `before` (new rooms with their
 * plots, new pieces, raised room levels). */
async function writeAdditions(
	tx: Tx,
	gymId: number,
	before: LayoutPlan,
	next: LayoutPlan,
): Promise<void> {
	const idOf = new Map<number, number>()
	for (const r of next.rooms) {
		if (r.id != null) {
			idOf.set(r.ref, r.id)
			const old = before.rooms.find((q) => q.ref === r.ref)
			if (old && old.level !== r.level)
				await tx
					.update(gymRooms)
					.set({ level: r.level })
					.where(eq(gymRooms.id, r.id))
			continue
		}
		const [ins] = await tx
			.insert(gymRooms)
			.values({ gymId, type: r.type, shape: r.shape, level: r.level })
			.$returningId()
		idOf.set(r.ref, ins.id)
		await tx.insert(gymPlots).values(
			r.cells.map((c) => ({
				gymId,
				px: c.px,
				pz: c.pz,
				state: "owned",
				lotShape: "normal",
				roomId: ins.id,
			})),
		)
	}
	const fresh = next.pieces.filter((p) => p.id == null)
	if (fresh.length)
		await tx.insert(gymPieces).values(
			fresh.map((p) => ({
				gymId,
				roomId: idOf.get(p.roomRef) ?? null,
				kind: p.kind,
				itemKey: p.itemKey,
				upgradeKey: p.upgradeKey,
				spotIndex: p.spotIndex,
				posX2: p.x2,
				posZ2: p.z2,
				rot: p.rot,
				locked: p.locked,
				status: "placed",
			})),
		)
}

/** Seeds the gym's layout if it has none yet, otherwise places any claimed
 * upgrade that has no piece. Safe to call on every read and concurrently. */
export async function ensureGymLayout(gymId: number, db: Db): Promise<void> {
	// Fast path, no lock: nothing to do for a seeded gym with nothing new.
	const [gym] = await db
		.select({ seededAt: userGyms.layoutSeededAt })
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	if (!gym) return
	if (gym.seededAt) {
		const before = await readPlan(db, gymId)
		const next = placeNewUnlocks(before, await unlockedUpgrades(db, gymId))
		if (!hasChanges(before, next)) return
	}

	await db.transaction(async (tx) => {
		// The locking read comes first so this transaction's later reads see
		// whatever a racing seeder committed while we waited for the lock.
		const [locked] = await tx
			.select({ seededAt: userGyms.layoutSeededAt })
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		if (!locked) return
		const before = locked.seededAt ? await readPlan(tx, gymId) : lobbyOnlyPlan()
		const next = placeNewUnlocks(before, await unlockedUpgrades(tx, gymId))
		if (hasChanges(before, next)) await writeAdditions(tx, gymId, before, next)
		if (!locked.seededAt)
			await tx
				.update(userGyms)
				.set({ layoutSeededAt: new Date() })
				.where(eq(userGyms.id, gymId))
	})
}

/** Deletes the stored layout so the next read seeds it again from scratch. */
export async function resetGymLayout(gymId: number, db: Db): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		await tx.delete(gymPieces).where(eq(gymPieces.gymId, gymId))
		await tx.delete(gymPlots).where(eq(gymPlots.gymId, gymId))
		await tx.delete(gymRooms).where(eq(gymRooms.gymId, gymId))
		await tx
			.update(userGyms)
			.set({ layoutSeededAt: null })
			.where(eq(userGyms.id, gymId))
	})
}

export async function getGymLayoutDto(
	gymId: number,
	db: Db,
): Promise<GymLayoutDto> {
	const rooms = await db
		.select()
		.from(gymRooms)
		.where(eq(gymRooms.gymId, gymId))
		.orderBy(asc(gymRooms.id))
	const plots = await db
		.select()
		.from(gymPlots)
		.where(eq(gymPlots.gymId, gymId))
		.orderBy(asc(gymPlots.id))
	const pieces = await db
		.select()
		.from(gymPieces)
		.where(eq(gymPieces.gymId, gymId))
		.orderBy(asc(gymPieces.id))

	const plan = await readPlan(db, gymId)
	const unlocked = await unlockedUpgrades(db, gymId)
	const unplacedKeys = placeNewUnlocks(plan, unlocked).unplaced

	const nameKeys = [
		...new Set([
			...pieces.map((p) => p.upgradeKey).filter((k): k is string => !!k),
			...unplacedKeys,
		]),
	]
	const catalog = nameKeys.length
		? await db
				.select({ key: gymUpgradesCatalog.key, name: gymUpgradesCatalog.name })
				.from(gymUpgradesCatalog)
				.where(inArray(gymUpgradesCatalog.key, nameKeys))
		: []
	const nameOf = new Map(catalog.map((c) => [c.key, c.name]))

	return {
		gymId,
		plots: plots.map((p) => ({
			px: p.px,
			pz: p.pz,
			state: p.state,
			lotShape: p.lotShape,
			roomId: p.roomId,
		})),
		rooms: rooms.map((r) => {
			const d = PAINT[isRoomType(r.type) ? (r.type as RoomType) : "empty"]
			return {
				id: r.id,
				type: r.type,
				shape: r.shape,
				level: r.level,
				layoutVersion: r.layoutVersion,
				cells: plots
					.filter((p) => p.roomId === r.id)
					.map((p) => ({ px: p.px, pz: p.pz })),
				paint: {
					wall: r.wallColor ?? d.wall,
					floorStyle: r.floorStyle ?? d.floorStyle,
					floorColor: r.floorColor ?? d.floorColor,
				},
			}
		}),
		pieces: pieces.map(
			(p): GymLayoutPieceDto => ({
				id: p.id,
				roomId: p.roomId,
				kind: p.kind === "decor" ? "decor" : "equipment",
				itemKey: p.itemKey,
				upgradeKey: p.upgradeKey,
				name:
					(p.upgradeKey ? nameOf.get(p.upgradeKey) : undefined) ??
					DECOR_NAMES[p.itemKey] ??
					p.itemKey,
				spotIndex: p.spotIndex,
				x: p.posX2 / 2,
				z: p.posZ2 / 2,
				rot: p.rot,
				tier: p.tier,
				locked: p.locked,
				status: p.status,
			}),
		),
		unplaced: unplacedKeys.map((k) => ({ key: k, name: nameOf.get(k) ?? k })),
	}
}
