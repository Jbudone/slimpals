// Persistence for the 3D gym layout (gym3d slice 1). Seeds a gym's layout on
// first read and places newly unlocked upgrades on later reads, using the
// pure planner in layout3d.ts. Seeding runs in a transaction that locks the
// gym row (SELECT ... FOR UPDATE), so two first reads racing each other
// cannot both seed.

import { and, asc, eq, gte, like, lt, lte, or, sql } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import {
	BURGER,
	BURGER_SOURCE,
	burgerState,
} from "../../../shared/gym3d/burger.js"
import {
	ECONOMY,
	type LotShape,
	levelFromPoints,
	plotHours,
	plotPrice,
} from "../../../shared/gym3d/economy.js"
import {
	GOAL_SOURCE,
	GOALS,
	GOALS_BASELINE_ID,
	goalMet,
	goalState,
	goalsDto,
	metGoalIds,
} from "../../../shared/gym3d/goals.js"
import { hireCost } from "../../../shared/gym3d/hires.js"
import { lotsForSale } from "../../../shared/gym3d/lots.js"
import type { RatingInput } from "../../../shared/gym3d/rating.js"
import {
	isRoomType,
	itemSize,
	PAINT,
	type RoomType,
} from "../../../shared/gym3d/rooms.js"
import { openWallCost } from "../../../shared/gym3d/walls.js"
import type {
	GymJobDto,
	GymLayoutDto,
	GymLayoutPieceDto,
	GymLayoutRoomDto,
} from "../../../shared/types.js"
import type * as schema from "../../db/schema.js"
import {
	gymHires,
	gymJobs,
	gymOpenWalls,
	gymPieces,
	gymPlots,
	gymRewards,
	gymRooms,
	gymUpgradesCatalog,
	userGyms,
	userGymUpgrades,
} from "../../db/schema.js"
import { settleJobs } from "./build3dJobs.js"
import { hireDtos } from "./hires3d.js"
import { incomeState } from "./income3d.js"
import {
	type LayoutPlan,
	lobbyOnlyPlan,
	type PieceKind,
	type PlanRoom,
	placeNewUnlocks,
	roomTypeFor,
	type UnlockedUpgrade,
} from "./layout3d.js"
import { markPaid, payGymReward } from "./rewards.js"
import { openWallRefs } from "./walls3d.js"

export type Db = MySql2Database<typeof schema>
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
export type Conn = Db | Tx

/** Display names for decor builders that have no catalog row of their own. */
const DECOR_NAMES: Readonly<Record<string, string>> = {
	plant: "Potted plant",
	palm: "Tall plant",
	poster: "Poster board",
	neon: "Neon sign",
	mirror: "Standing mirror",
	studio_mirror: "Studio mirror",
	trophy: "Trophy stand",
	lantern: "Jack-o'-lantern",
	cobwebs: "Cobweb neon",
}

export async function unlockedUpgrades(
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

/** The stored layout as a plan (room refs are DB ids). Rooms still being
 * built or with no type yet are left out: nothing is placed in them. */
export async function readPlan(conn: Conn, gymId: number): Promise<LayoutPlan> {
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
		const cells = plots.filter((p) => p.roomId === r.id)
		if (cells.some((p) => p.state !== "owned")) continue
		planRooms.push({
			ref: r.id,
			id: r.id,
			type: r.type,
			shape: r.shape,
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
			status:
				p.status === "stored"
					? "stored"
					: p.status === "upgrading"
						? "upgrading"
						: "placed",
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
				status: p.status,
			})),
		)
}

/** Seeds the gym's layout if it has none yet, otherwise places any claimed
 * upgrade that has no piece; grants the one-time starter coins and settles
 * finished jobs. Safe to call on every read and concurrently. */
export async function ensureGymLayout(gymId: number, db: Db): Promise<void> {
	// Fast path, no lock: nothing to do for a seeded gym with nothing new.
	const [gym] = await db
		.select({
			seededAt: userGyms.layoutSeededAt,
			starterAt: userGyms.starterCoinsAt,
		})
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	if (!gym) return
	if (gym.seededAt && gym.starterAt) {
		const before = await readPlan(db, gymId)
		const next = placeNewUnlocks(before, await unlockedUpgrades(db, gymId), {
			newRooms: false,
		})
		const due = await db
			.select({ id: gymJobs.id })
			.from(gymJobs)
			.where(
				and(
					eq(gymJobs.gymId, gymId),
					eq(gymJobs.status, "active"),
					lte(gymJobs.endsAt, new Date()),
				),
			)
			.limit(1)
		if (!hasChanges(before, next) && !due.length) return
	}

	await db.transaction(async (tx) => {
		// The locking read comes first so this transaction's later reads see
		// whatever a racing seeder committed while we waited for the lock.
		const [locked] = await tx
			.select({
				seededAt: userGyms.layoutSeededAt,
				starterAt: userGyms.starterCoinsAt,
			})
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		if (!locked) return
		await settleJobs(tx, gymId, new Date())
		const before = locked.seededAt ? await readPlan(tx, gymId) : lobbyOnlyPlan()
		const next = placeNewUnlocks(before, await unlockedUpgrades(tx, gymId), {
			newRooms: !locked.seededAt,
		})
		if (hasChanges(before, next)) await writeAdditions(tx, gymId, before, next)
		if (!locked.seededAt || !locked.starterAt)
			await tx
				.update(userGyms)
				.set({
					...(locked.seededAt ? {} : { layoutSeededAt: new Date() }),
					...(locked.starterAt
						? {}
						: {
								starterCoinsAt: new Date(),
								coins: sql`${userGyms.coins} + ${ECONOMY.starterCoins}`,
								sweat: sql`${userGyms.sweat} + ${ECONOMY.starterSweat}`,
								greens: sql`${userGyms.greens} + ${ECONOMY.starterGreens}`,
							}),
				})
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
		await tx.delete(gymHires).where(eq(gymHires.gymId, gymId))
		await tx.delete(gymJobs).where(eq(gymJobs.gymId, gymId))
		await tx.delete(gymOpenWalls).where(eq(gymOpenWalls.gymId, gymId))
		await tx.delete(gymPieces).where(eq(gymPieces.gymId, gymId))
		await tx.delete(gymPlots).where(eq(gymPlots.gymId, gymId))
		await tx.delete(gymRooms).where(eq(gymRooms.gymId, gymId))
		// coins stay (they came from real tasks); the starter grant is not
		// repeated, and plot prices start over with the new layout
		await tx
			.update(userGyms)
			.set({ layoutSeededAt: null, plotsBought: 0 })
			.where(eq(userGyms.id, gymId))
	})
}

export async function getGymLayoutDto(
	gymId: number,
	db: Db,
): Promise<GymLayoutDto> {
	const now = new Date()
	// Everything the layout needs that does not depend on anything else is
	// read at once: this runs after every build action, and a round trip per
	// query added up to a slow-feeling menu on a remote database.
	const [
		[gym],
		rooms,
		plots,
		pieces,
		jobs,
		plan,
		unlocked,
		catalog,
		openWalls,
		hires,
		paidRows,
		[boughtRow],
	] = await Promise.all([
		db
			.select({
				coins: userGyms.coins,
				plotsBought: userGyms.plotsBought,
				sweat: userGyms.sweat,
				greens: userGyms.greens,
				campaign: userGyms.campaign,
			})
			.from(userGyms)
			.where(eq(userGyms.id, gymId)),
		db
			.select()
			.from(gymRooms)
			.where(eq(gymRooms.gymId, gymId))
			.orderBy(asc(gymRooms.id)),
		db
			.select()
			.from(gymPlots)
			.where(eq(gymPlots.gymId, gymId))
			.orderBy(asc(gymPlots.id)),
		db
			.select()
			.from(gymPieces)
			.where(eq(gymPieces.gymId, gymId))
			.orderBy(asc(gymPieces.id)),
		db
			.select()
			.from(gymJobs)
			.where(
				and(
					eq(gymJobs.gymId, gymId),
					or(
						eq(gymJobs.status, "active"),
						gte(gymJobs.finishedAt, new Date(now.getTime() - 86_400_000)),
					),
				),
			)
			.orderBy(asc(gymJobs.id)),
		readPlan(db, gymId),
		unlockedUpgrades(db, gymId),
		db
			.select({
				key: gymUpgradesCatalog.key,
				name: gymUpgradesCatalog.name,
				category: gymUpgradesCatalog.category,
				requiredXp: gymUpgradesCatalog.requiredXp,
				sortOrder: gymUpgradesCatalog.sortOrder,
			})
			.from(gymUpgradesCatalog)
			.orderBy(asc(gymUpgradesCatalog.sortOrder)),
		openWallRefs(db, gymId),
		hireDtos(db, gymId),
		db
			.select({ source: gymRewards.source })
			.from(gymRewards)
			.where(
				and(eq(gymRewards.gymId, gymId), like(gymRewards.source, "goal:%")),
			),
		db
			.select({ id: gymRewards.id })
			.from(gymRewards)
			.where(
				and(eq(gymRewards.gymId, gymId), eq(gymRewards.source, BURGER_SOURCE)),
			),
	])
	const unplacedKeys = placeNewUnlocks(plan, unlocked, {
		newRooms: false,
	}).unplaced
	const byKey = new Map(catalog.map((c) => [c.key, c]))
	const nameOf = (k: string) => byKey.get(k)?.name
	const roomTypeOf = (k: string | null): string | null => {
		if (!k) return null
		const c = byKey.get(k)
		return roomTypeFor({
			key: k,
			category: c?.category ?? "",
			sortOrder: c?.sortOrder ?? 0,
		})
	}
	const unlockedKeys = new Set(unlocked.map((u) => u.key))

	const built = plots.map((p) => ({ px: p.px, pz: p.pz }))
	const bought = gym?.plotsBought ?? 0

	// Room level follows the tiers on its spots and never drops. Rooms seeded
	// before (or filled by new unlocks) may lag behind: raise them here, with
	// a guard so a concurrent raise is harmless.
	const pointsOf = (roomId: number) =>
		pieces
			.filter((p) => p.roomId === roomId && p.spotIndex != null)
			.reduce((a, p) => a + p.tier, 0)
	const levels = new Map<number, number>()
	for (const r of rooms) {
		const lv = Math.max(r.level, levelFromPoints(pointsOf(r.id)))
		levels.set(r.id, lv)
		if (lv > r.level && r.type !== "lobby" && r.type !== "empty")
			await db
				.update(gymRooms)
				.set({ level: lv })
				.where(and(eq(gymRooms.id, r.id), lt(gymRooms.level, lv)))
	}

	const income = await incomeState(db, gymId, now)

	const roomDtos: GymLayoutRoomDto[] = rooms.map((r) => {
		const d = PAINT[isRoomType(r.type) ? (r.type as RoomType) : "empty"]
		const cells = plots.filter((p) => p.roomId === r.id)
		return {
			id: r.id,
			type: r.type,
			shape: r.shape,
			level:
				r.type === "lobby" || r.type === "empty"
					? r.level
					: (levels.get(r.id) ?? r.level),
			points: pointsOf(r.id),
			building: cells.some((p) => p.state !== "owned"),
			layoutVersion: r.layoutVersion,
			cells: cells.map((p) => ({ px: p.px, pz: p.pz })),
			vibe: r.vibe ?? null,
			paint: {
				wall: r.wallColor ?? d.wall,
				floorStyle: r.floorStyle ?? d.floorStyle,
				floorColor: r.floorColor ?? d.floorColor,
			},
		}
	})

	// Rating and goals read the layout; a goal that is newly met pays once.
	const goalIn: RatingInput = {
		openWalls: openWalls.length,
		hires: hires.length,
		rooms: roomDtos,
		pieces: pieces.map((p) => ({
			kind: p.kind === "decor" ? "decor" : "equipment",
			itemKey: p.itemKey,
			tier: p.tier,
			status: p.status,
		})),
	}
	const gs = goalState(goalIn)
	const paid = new Set(paidRows.map((r) => r.source.slice("goal:".length)))
	const goalsPaid: NonNullable<GymLayoutDto["goalsPaid"]> = []
	let paidSweat = 0
	let paidGreens = 0
	if (!paid.has(GOALS_BASELINE_ID)) {
		// first read with goals: what the gym already met starts out done
		const met = metGoalIds(gs)
		await markPaid(
			gymId,
			GOAL_SOURCE(GOALS_BASELINE_ID),
			met.map(GOAL_SOURCE),
			db,
		)
		paid.add(GOALS_BASELINE_ID)
		for (const id of met) paid.add(id)
	}
	for (const g of GOALS) {
		if (paid.has(g.id) || !goalMet(g, gs)) continue
		const got = await payGymReward(gymId, GOAL_SOURCE(g.id), g.reward, db)
		paid.add(g.id)
		if (!got.sweat && !got.greens) continue
		paidSweat += got.sweat
		paidGreens += got.greens
		goalsPaid.push({ id: g.id, title: g.title, reward: got })
	}

	return {
		gymId,
		campaign: gym?.campaign ?? 1,
		coins: gym?.coins ?? 0,
		sweat: (gym?.sweat ?? 0) + paidSweat,
		greens: (gym?.greens ?? 0) + paidGreens,
		openWalls,
		nextWallCost: openWallCost(openWalls.length),
		hires,
		nextHireCost: hireCost(hires.length),
		rating: gs.rating,
		goals: goalsDto(gs, paid),
		burger: {
			state: burgerState(gs.rating.stars, !!boughtRow),
			cost: BURGER.cost,
			stars: BURGER.stars,
		},
		...(goalsPaid.length ? { goalsPaid } : {}),
		income: income.sources,
		kitchen: income.kitchen,
		serverNow: now.toISOString(),
		plots: plots.map((p) => ({
			px: p.px,
			pz: p.pz,
			state: p.state,
			lotShape: p.lotShape,
			roomId: p.roomId,
		})),
		rooms: roomDtos,
		pieces: pieces.map(
			(p): GymLayoutPieceDto => ({
				id: p.id,
				roomId: p.roomId,
				kind: p.kind === "decor" ? "decor" : "equipment",
				itemKey: p.itemKey,
				upgradeKey: p.upgradeKey,
				name:
					(p.upgradeKey ? nameOf(p.upgradeKey) : undefined) ??
					DECOR_NAMES[p.itemKey] ??
					p.itemKey,
				spotIndex: p.spotIndex,
				x: p.posX2 / 2,
				z: p.posZ2 / 2,
				rot: p.rot,
				tier: p.tier,
				locked: p.locked,
				status: p.status,
				roomType: p.kind === "decor" ? null : roomTypeOf(p.upgradeKey),
				size: itemSize(p.itemKey, p.kind === "decor" ? "decor" : "equipment"),
			}),
		),
		unplaced: unplacedKeys.map((k) => ({ key: k, name: nameOf(k) ?? k })),
		lots: lotsForSale(built, !!boughtRow).map((l) => ({
			id: l.id,
			shape: l.shape,
			cells: l.cells,
			price: plotPrice(l.shape as LotShape, bought),
			hours: plotHours(l.shape as LotShape),
		})),
		jobs: jobs.map(
			(j): GymJobDto => ({
				id: j.id,
				kind: j.kind === "upgrade" ? "upgrade" : "plot",
				roomId: j.roomId,
				pieceId: j.pieceId,
				targetTier: j.targetTier,
				status: j.status === "done" ? "done" : "active",
				cost: j.cost,
				startedAt: j.startedAt.toISOString(),
				endsAt: j.endsAt.toISOString(),
				finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
			}),
		),
		lockedGear: catalog.flatMap((c) => {
			if (unlockedKeys.has(c.key)) return []
			const rt = roomTypeOf(c.key)
			return rt
				? [
						{
							key: c.key,
							name: c.name,
							requiredXp: c.requiredXp,
							roomType: rt,
							size: itemSize(c.key, "equipment"),
						},
					]
				: []
		}),
	}
}
