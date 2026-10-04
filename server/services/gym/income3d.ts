// Idle coins of the 3D gym (gym home). Placed machines, the reception desk
// and the Slim Kitchen fill coin bubbles over time. Nothing ticks on the
// server: a bubble's coins are computed from the time since it was last
// collected (capped per source), and collecting moves that time to now.
// Kitchen menu items and rush hour cost Greens. Writes lock the gym row
// through withGym like every other build action.
import { and, eq, inArray, sql } from "drizzle-orm"
import {
	accrued,
	deskMembersPerHour,
	deskRate,
	ECONOMY,
	KITCHEN_MENU,
	type KitchenItemKey,
	kitchenItemsOn,
	kitchenMaskWith,
	kitchenRate,
	machineCap,
	machineRate,
	menuInSeason,
} from "../../../shared/gym3d/economy.js"
import {
	hireBonus,
	kitchenTips,
	staffedRate,
} from "../../../shared/gym3d/hires.js"
import { areaMultiplier } from "../../../shared/gym3d/staff.js"
import { VIBE } from "../../../shared/gym3d/vibes.js"
import type {
	GymIncomeSourceDto,
	GymKitchenDto,
	GymWelcomeBackDto,
} from "../../../shared/types.js"
import {
	gymHires,
	gymJobs,
	gymPieces,
	gymPlots,
	gymRooms,
	gymStaff,
	userGyms,
} from "../../db/schema.js"
import { BuildError, spendCurrency, withGym } from "./build3d.js"
import type { Conn, Db, Tx } from "./layout3dStore.js"

const HOUR = 3_600_000

type PieceRow = typeof gymPieces.$inferSelect

type GymIncomeRow = {
	createdAt: Date
	deskCollectedAt: Date | null
	kitchenCollectedAt: Date | null
	kitchenMenu: number
	kitchenRushEndsAt: Date | null
}

/** Does this piece earn coins right now (a working machine on a spot)? */
export function isEarningPiece(p: PieceRow): boolean {
	return (
		p.kind === "equipment" &&
		!p.locked &&
		p.status === "placed" &&
		p.spotIndex != null &&
		p.roomId != null
	)
}

function rushWindow(g: GymIncomeRow) {
	const end = g.kitchenRushEndsAt?.getTime()
	if (!end) return null
	const r = ECONOMY.income.kitchen.rush
	return { startMs: end - r.hours * HOUR, endMs: end, mult: r.mult }
}

/** `mult` is the staff bonus of the machine's room (1 = none). */
export function pieceBank(p: PieceRow, nowMs: number, mult = 1): number {
	if (!isEarningPiece(p)) return 0
	const from = (p.collectedAt ?? p.createdAt).getTime()
	return accrued(machineRate(p.tier) * mult, machineCap(p.tier), from, nowMs)
}

function deskBank(
	g: GymIncomeRow,
	rooms: number,
	nowMs: number,
	mult = 1,
): number {
	const from = (g.deskCollectedAt ?? g.createdAt).getTime()
	return accrued(deskRate(rooms) * mult, ECONOMY.income.desk.cap, from, nowMs)
}

function kitchenBank(g: GymIncomeRow, nowMs: number, mult = 1): number {
	const from = (g.kitchenCollectedAt ?? g.createdAt).getTime()
	return accrued(
		kitchenRate(g.kitchenMenu) * mult,
		ECONOMY.income.kitchen.cap,
		from,
		nowMs,
		rushWindow(g),
	)
}

function rushOn(g: GymIncomeRow, nowMs: number): boolean {
	return (g.kitchenRushEndsAt?.getTime() ?? 0) > nowMs
}

async function gymIncomeRow(conn: Conn, gymId: number) {
	const [g] = await conn
		.select({
			createdAt: userGyms.createdAt,
			deskCollectedAt: userGyms.deskCollectedAt,
			kitchenCollectedAt: userGyms.kitchenCollectedAt,
			kitchenMenu: userGyms.kitchenMenu,
			kitchenRushEndsAt: userGyms.kitchenRushEndsAt,
			lastOpenAt: userGyms.lastOpenAt,
		})
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	return g ?? null
}

/** Finished rooms with a type (the lobby and empty rooms do not count). */
async function finishedRooms(conn: Conn, gymId: number): Promise<number> {
	const rooms = await conn
		.select({ id: gymRooms.id, type: gymRooms.type })
		.from(gymRooms)
		.where(eq(gymRooms.gymId, gymId))
	const building = await conn
		.select({ roomId: gymPlots.roomId })
		.from(gymPlots)
		.where(and(eq(gymPlots.gymId, gymId), eq(gymPlots.state, "building")))
	const busy = new Set(building.map((b) => b.roomId))
	return rooms.filter(
		(r) => r.type !== "lobby" && r.type !== "empty" && !busy.has(r.id),
	).length
}

/** Room id to room type for the gym's rooms. */
async function roomTypesOf(
	conn: Conn,
	gymId: number,
): Promise<Map<number, string>> {
	const rows = await conn
		.select({ id: gymRooms.id, type: gymRooms.type })
		.from(gymRooms)
		.where(eq(gymRooms.gymId, gymId))
	return new Map(rows.map((r) => [r.id, r.type]))
}

/** Trained staff levels of a gym (npc key to level; untrained = absent). */
export async function staffLevels(
	conn: Conn,
	gymId: number,
): Promise<Map<string, number>> {
	const rows = await conn
		.select({ npcKey: gymStaff.npcKey, level: gymStaff.level })
		.from(gymStaff)
		.where(eq(gymStaff.gymId, gymId))
	return new Map(rows.map((r) => [r.npcKey, r.level]))
}

/** The coin bonus the hires of each room give its machines (room id to
 * the sum of their bonuses). */
export async function hireBonuses(
	conn: Conn,
	gymId: number,
): Promise<Map<number, number>> {
	const rows = await conn
		.select({ roomId: gymHires.roomId, level: gymHires.level })
		.from(gymHires)
		.where(eq(gymHires.gymId, gymId))
	const types = await roomTypesOf(conn, gymId)
	const out = new Map<number, number>()
	for (const r of rows)
		out.set(r.roomId, (out.get(r.roomId) ?? 0) + hireBonus(r.level))
	// a staffed room's own flavour rate (boxing, court), once per room
	for (const id of out.keys())
		out.set(id, (out.get(id) ?? 0) + staffedRate(types.get(id) ?? ""))
	return out
}

/** The coin bonus a room's vibe gives its machines (room id to bonus; rooms
 * without a vibe are absent). */
async function vibeBonuses(
	conn: Conn,
	gymId: number,
): Promise<Map<number, number>> {
	const rows = await conn
		.select({ id: gymRooms.id, vibe: gymRooms.vibe })
		.from(gymRooms)
		.where(eq(gymRooms.gymId, gymId))
	return new Map(rows.filter((r) => r.vibe).map((r) => [r.id, VIBE.bonus]))
}

/** Rate shown to the player: one decimal at most. */
const shown = (n: number): number => Math.round(n * 10) / 10

export type IncomeState = {
	sources: GymIncomeSourceDto[]
	kitchen: GymKitchenDto
	rooms: number
}

/** Every coin source of the gym and what it holds at `now`. */
export async function incomeState(
	conn: Conn,
	gymId: number,
	now: Date,
): Promise<IncomeState> {
	const nowMs = now.getTime()
	// independent reads: one round trip's worth of waiting, not seven
	const [g, pieces, rooms, levels, roomTypes, hired, vibed] = await Promise.all(
		[
			gymIncomeRow(conn, gymId),
			conn.select().from(gymPieces).where(eq(gymPieces.gymId, gymId)),
			finishedRooms(conn, gymId),
			staffLevels(conn, gymId),
			roomTypesOf(conn, gymId),
			hireBonuses(conn, gymId),
			vibeBonuses(conn, gymId),
		],
	)
	const deskMult = areaMultiplier("desk", levels)
	const staffedTypes = [...hired.keys()].map((id) => roomTypes.get(id) ?? "")
	const kitchenMult =
		areaMultiplier("kitchen", levels) + kitchenTips(staffedTypes)
	const sources: GymIncomeSourceDto[] = []
	for (const p of pieces) {
		if (!isEarningPiece(p)) continue
		const mult =
			areaMultiplier(roomTypes.get(p.roomId as number) ?? "", levels) +
			(hired.get(p.roomId as number) ?? 0) +
			(vibed.get(p.roomId as number) ?? 0)
		sources.push({
			key: `piece:${p.id}`,
			kind: "machine",
			pieceId: p.id,
			bank: pieceBank(p, nowMs, mult),
			cap: machineCap(p.tier),
			rate: shown(machineRate(p.tier) * mult),
		})
	}
	const kitchen: GymKitchenDto = {
		menu: kitchenItemsOn(g?.kitchenMenu ?? 1),
		rate: shown(kitchenRate(g?.kitchenMenu ?? 1) * kitchenMult),
		rushEndsAt:
			g?.kitchenRushEndsAt && rushOn(g, nowMs)
				? g.kitchenRushEndsAt.toISOString()
				: null,
		bank: g ? kitchenBank(g, nowMs, kitchenMult) : 0,
		cap: ECONOMY.income.kitchen.cap,
	}
	if (g) {
		sources.push({
			key: "desk",
			kind: "desk",
			pieceId: null,
			bank: deskBank(g, rooms, nowMs, deskMult),
			cap: ECONOMY.income.desk.cap,
			rate: shown(deskRate(rooms) * deskMult),
		})
		sources.push({
			key: "kitchen",
			kind: "kitchen",
			pieceId: null,
			bank: kitchen.bank,
			cap: kitchen.cap,
			rate:
				kitchen.rate *
				(rushOn(g, nowMs) ? ECONOMY.income.kitchen.rush.mult : 1),
		})
	}
	return { sources, kitchen, rooms }
}

/** Credits the coins in `keys` (all sources when omitted) inside a locked
 * transaction and restarts those bubbles at `now`. Returns the coins. */
async function collectIn(
	tx: Tx,
	gymId: number,
	now: Date,
	keys: readonly string[] | null,
): Promise<number> {
	const st = await incomeState(tx, gymId, now)
	const want = keys ? new Set(keys) : null
	const picked = st.sources.filter(
		(s) => s.bank > 0 && (!want || want.has(s.key)),
	)
	if (!picked.length) return 0
	const sum = picked.reduce((a, s) => a + s.bank, 0)
	const pieceIds = picked
		.filter((s) => s.pieceId != null)
		.map((s) => s.pieceId as number)
	if (pieceIds.length)
		await tx
			.update(gymPieces)
			.set({ collectedAt: now })
			.where(and(eq(gymPieces.gymId, gymId), inArray(gymPieces.id, pieceIds)))
	const desk = picked.some((s) => s.key === "desk")
	const kitchen = picked.some((s) => s.key === "kitchen")
	await tx
		.update(userGyms)
		.set({
			coins: sql`${userGyms.coins} + ${sum}`,
			...(desk ? { deskCollectedAt: now } : {}),
			...(kitchen ? { kitchenCollectedAt: now } : {}),
		})
		.where(eq(userGyms.id, gymId))
	return sum
}

/** Pays every waiting coin bubble and restarts them at `now` (before a rate
 * changes, so the new rate only counts from now). Returns the coins. */
export function settleIncome(
	tx: Tx,
	gymId: number,
	now: Date,
): Promise<number> {
	return collectIn(tx, gymId, now, null)
}

/** Taps on coin bubbles: collects the given sources (or all of them). */
export async function collectIncome(
	db: Db,
	gymId: number,
	keys?: readonly string[] | null,
): Promise<{ collected: number }> {
	if (keys && !keys.every((k) => typeof k === "string" && k.length < 40))
		throw new BuildError(400, "Bad source")
	return withGym(db, gymId, async (tx, _gym, now) => ({
		collected: await collectIn(tx, gymId, now, keys ?? null),
	}))
}

/** A machine stops earning (stored, or its upgrade starts): pay what its
 * bubble holds first so nothing is lost. */
export async function bankPiece(
	tx: Tx,
	gymId: number,
	pieceId: number,
	now: Date,
): Promise<number> {
	const [p] = await tx
		.select()
		.from(gymPieces)
		.where(and(eq(gymPieces.id, pieceId), eq(gymPieces.gymId, gymId)))
	if (!p) return 0
	const roomType = (await roomTypesOf(tx, gymId)).get(p.roomId as number)
	const mult =
		areaMultiplier(roomType ?? "", await staffLevels(tx, gymId)) +
		((await hireBonuses(tx, gymId)).get(p.roomId as number) ?? 0) +
		((await vibeBonuses(tx, gymId)).get(p.roomId as number) ?? 0)
	const n = pieceBank(p, now.getTime(), mult)
	await tx
		.update(gymPieces)
		.set({ collectedAt: now })
		.where(eq(gymPieces.id, p.id))
	if (n > 0)
		await tx
			.update(userGyms)
			.set({ coins: sql`${userGyms.coins} + ${n}` })
			.where(eq(userGyms.id, gymId))
	return n
}

/** Puts a menu item on for its Greens; the kitchen's waiting coins are paid
 * out first so the new rate only counts from now. */
export async function unlockKitchenItem(
	db: Db,
	gymId: number,
	key: string,
): Promise<{ collected: number }> {
	const item = KITCHEN_MENU.find((m) => m.key === key)
	if (!item) throw new BuildError(400, "Unknown menu item")
	return withGym(db, gymId, async (tx, gym, now) => {
		const g = await gymIncomeRow(tx, gymId)
		if (!g) throw new BuildError(404, "No gym")
		if (kitchenItemsOn(g.kitchenMenu).includes(item.key as KitchenItemKey))
			throw new BuildError(409, `${item.name} is already on the menu`)
		if (!menuInSeason(item, now.getUTCMonth() + 1))
			throw new BuildError(409, `${item.name} is not in season`)
		await spendCurrency(tx, gym, "greens", item.cost)
		const collected = await collectIn(tx, gymId, now, ["kitchen"])
		await tx
			.update(userGyms)
			.set({
				kitchenMenu: kitchenMaskWith(g.kitchenMenu, item.key),
				kitchenCollectedAt: now,
			})
			.where(eq(userGyms.id, gymId))
		return { collected }
	})
}

/** Rush hour: Greens for double kitchen sales for a while. */
export async function startRushHour(
	db: Db,
	gymId: number,
): Promise<{ collected: number }> {
	const r = ECONOMY.income.kitchen.rush
	return withGym(db, gymId, async (tx, gym, now) => {
		const g = await gymIncomeRow(tx, gymId)
		if (!g) throw new BuildError(404, "No gym")
		if (rushOn(g, now.getTime()))
			throw new BuildError(409, "Rush hour is already on")
		await spendCurrency(tx, gym, "greens", r.greens)
		const collected = await collectIn(tx, gymId, now, ["kitchen"])
		await tx
			.update(userGyms)
			.set({
				kitchenRushEndsAt: new Date(now.getTime() + r.hours * HOUR),
				kitchenCollectedAt: now,
			})
			.where(eq(userGyms.id, gymId))
		return { collected }
	})
}

/** The gym is opened: after a long absence, what happened meanwhile.
 * Always records the open. */
export async function openGym(
	db: Db,
	gymId: number,
	now: Date = new Date(),
): Promise<GymWelcomeBackDto | null> {
	const g = await gymIncomeRow(db, gymId)
	if (!g) return null
	await db
		.update(userGyms)
		.set({ lastOpenAt: now })
		.where(eq(userGyms.id, gymId))
	const last = g.lastOpenAt?.getTime()
	if (!last) return null
	const away = now.getTime() - last
	if (away < ECONOMY.income.welcomeBackHours * HOUR) return null
	const st = await incomeState(db, gymId, now)
	const coins = st.sources.reduce((a, s) => a + s.bank, 0)
	const done = await db
		.select({ finishedAt: gymJobs.finishedAt })
		.from(gymJobs)
		.where(and(eq(gymJobs.gymId, gymId), eq(gymJobs.status, "done")))
	const builds = done.filter(
		(j) => j.finishedAt && j.finishedAt.getTime() > last,
	).length
	const hours = away / HOUR
	const kitchenCoins = accrued(
		kitchenRate(g.kitchenMenu),
		Number.POSITIVE_INFINITY,
		last,
		now.getTime(),
		rushWindow(g),
	)
	return {
		hours: Math.round(hours),
		coins,
		builds,
		members: Math.round(deskMembersPerHour(st.rooms) * hours),
		sales: Math.round(kitchenCoins / ECONOMY.income.kitchen.coinsPerSale),
	}
}
