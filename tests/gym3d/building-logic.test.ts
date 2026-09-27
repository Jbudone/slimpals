import { describe, expect, it } from "vitest"
import { GYM_UPGRADES } from "../../server/db/seed.js"
import {
	deriveInitialLayout,
	placeNewUnlocks,
	roomTypeFor,
	type UnlockedUpgrade,
} from "../../server/services/gym/layout3d.js"
import {
	ECONOMY,
	finishCost,
	levelFromPoints,
	levelProgress,
	plotPrice,
	upgradeInfo,
} from "../../shared/gym3d/economy.js"
import {
	currentLots,
	LOT_TEMPLATES,
	lotsForSale,
	NEIGHBOURHOOD_COLS,
	siteBox,
} from "../../shared/gym3d/lots.js"
import {
	LOBBY_CELL,
	PD,
	PW,
	ROOM_CELLS,
	WORLD_ROWS,
} from "../../shared/gym3d/rooms.js"

const ALL: UnlockedUpgrade[] = GYM_UPGRADES.map((u) => ({
	key: u.key,
	category: u.category,
	sortOrder: u.sortOrder,
}))
const byKey = (keys: string[]) => ALL.filter((u) => keys.includes(u.key))
const HOUR = 3_600_000

describe("economy", () => {
	it("prices plots from one config, rising with every plot bought", () => {
		expect(plotPrice("normal", 0)).toBe(1200)
		expect(plotPrice("normal", 1)).toBe(1900)
		expect(plotPrice("normal", 2)).toBe(2600)
		// shapes cost more, rounded to 50
		expect(plotPrice("wide", 0)).toBe(2050)
		expect(plotPrice("big", 0)).toBe(3350)
		for (const s of ["normal", "wide", "L", "big"] as const)
			expect(plotPrice(s, 3) % ECONOMY.plot.roundTo).toBe(0)
	})

	it("the starter coins buy the first plot", () => {
		expect(ECONOMY.starterCoins).toBeGreaterThanOrEqual(plotPrice("normal", 0))
	})

	it("upgrade costs follow the gear value, tier 2 then 3, then none", () => {
		expect(upgradeInfo("cardio_treadmill", 1)).toEqual({
			toTier: 2,
			cost: 180,
			hours: 3,
		})
		expect(upgradeInfo("cardio_treadmill", 2)).toEqual({
			toTier: 3,
			cost: 300,
			hours: 6,
		})
		expect(upgradeInfo("cardio_treadmill", 3)).toBeNull()
		// unknown gear falls back to the default value
		expect(upgradeInfo("mystery", 1)?.cost).toBe(240)
	})

	it("finishing now costs coins scaled to the remaining time", () => {
		expect(finishCost(0)).toBe(0)
		expect(finishCost(-5)).toBe(0)
		expect(finishCost(60_000)).toBe(10) // minimum
		expect(finishCost(4 * HOUR)).toBe(160)
		expect(finishCost(3.5 * HOUR)).toBe(140)
		expect(finishCost(1 * HOUR + 1)).toBe(41)
	})

	it("room level comes from points (prototype thresholds)", () => {
		expect(levelFromPoints(0)).toBe(1)
		expect(levelFromPoints(2)).toBe(1)
		expect(levelFromPoints(3)).toBe(2)
		expect(levelFromPoints(5)).toBe(3)
		expect(levelFromPoints(8)).toBe(4)
		expect(levelFromPoints(12)).toBe(5)
		expect(levelFromPoints(99)).toBe(5)
		expect(levelProgress(1, 2)).toEqual({ next: 3, prev: 0, k: 2 / 3 })
		expect(levelProgress(5, 20).next).toBeNull()
	})
})

describe("lots", () => {
	it("templates cover every neighbourhood cell but the lobby exactly once", () => {
		const seen = new Map<string, number>()
		for (const t of LOT_TEMPLATES)
			for (const c of t.cells) {
				const k = `${c.px},${c.pz}`
				seen.set(k, (seen.get(k) ?? 0) + 1)
			}
		for (let px = 0; px < NEIGHBOURHOOD_COLS; px++)
			for (let pz = 0; pz < WORLD_ROWS; pz++) {
				const lobby = px === LOBBY_CELL.px && pz === LOBBY_CELL.pz
				expect(seen.get(`${px},${pz}`) ?? 0).toBe(lobby ? 0 : 1)
			}
		// slice 1 seeds rooms on ROOM_CELLS: all inside the templates
		for (const c of ROOM_CELLS) expect(seen.has(`${c.px},${c.pz}`)).toBe(true)
	})

	it("only lots touching a built plot are for sale", () => {
		const lots = lotsForSale([])
		const ids = lots.map((l) => l.id).sort()
		// neighbours of the lobby (1,2): (1,1), (0,2) and the big lot at (2,2)
		expect(ids).toEqual(["big:2,1", "normal:0,2", "normal:1,1"])
		for (const l of lots)
			expect(
				l.cells.some((c) =>
					[
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1],
					].some(
						([dx, dz]) =>
							c.px + dx === LOBBY_CELL.px && c.pz + dz === LOBBY_CELL.pz,
					),
				),
			).toBe(true)
	})

	it("building next to a lot puts it up for sale; plots under construction count", () => {
		const ids = lotsForSale([{ px: 1, pz: 1 }]).map((l) => l.id)
		expect(ids).toContain("L:0,0")
		expect(ids).not.toContain("normal:1,1")
	})

	it("a partly built template splits into single plots", () => {
		// slice 1 may have seeded a room on (2,2), inside the big lot
		const lots = currentLots([{ px: 2, pz: 2 }])
		expect(lots.find((l) => l.shape === "big" && l.id === "big:2,1")).toBe(
			undefined,
		)
		for (const k of ["normal:2,1", "normal:3,1", "normal:3,2"])
			expect(lots.some((l) => l.id === k)).toBe(true)
	})

	it("the L site covers its long row", () => {
		const L = LOT_TEMPLATES.find((t) => t.shape === "L")
		if (!L) throw new Error("no L")
		const b = siteBox(L.cells)
		expect(b.w).toBe(2 * PW)
		expect(b.d).toBe(PD)
	})
})

describe("placing unlocks after seeding", () => {
	it("goes to an open spot of a room of its type", () => {
		const plan = deriveInitialLayout(byKey(["cardio_treadmill"]))
		const next = placeNewUnlocks(
			plan,
			byKey(["cardio_treadmill", "cardio_rowing"]),
			{ newRooms: false },
		)
		const row = next.pieces.find((p) => p.upgradeKey === "cardio_rowing")
		expect(row?.status).toBe("placed")
		expect(row?.spotIndex).toBe(1)
	})

	it("goes to storage when no room of its type exists: no new rooms", () => {
		const plan = deriveInitialLayout(byKey(["cardio_treadmill"]))
		const next = placeNewUnlocks(
			plan,
			byKey(["cardio_treadmill", "boxing_ring", "amenity_juice"]),
			{ newRooms: false },
		)
		expect(next.rooms).toHaveLength(plan.rooms.length)
		for (const k of ["boxing_ring", "amenity_juice"]) {
			const p = next.pieces.find((q) => q.upgradeKey === k)
			expect(p?.status).toBe("stored")
			expect(p?.spotIndex).toBeNull()
			expect(p?.roomRef).toBe(0)
		}
		// idempotent: stored pieces are known
		expect(
			placeNewUnlocks(next, byKey(["boxing_ring", "amenity_juice"]), {
				newRooms: false,
			}),
		).toEqual(next)
	})

	it("does not open locked bonus spots or raise the level", () => {
		const plan = deriveInitialLayout(
			byKey([
				"cardio_treadmill",
				"cardio_bikes",
				"cardio_rowing",
				"cardio_stairs",
			]),
		)
		const cardio = plan.rooms.find((r) => r.type === "cardio")
		expect(cardio?.level).toBe(1)
		const next = placeNewUnlocks(
			plan,
			byKey([
				"cardio_treadmill",
				"cardio_bikes",
				"cardio_rowing",
				"cardio_stairs",
				"cardio_cinema",
			]),
			{ newRooms: false },
		)
		expect(
			next.pieces.find((p) => p.upgradeKey === "cardio_cinema")?.status,
		).toBe("stored")
		expect(next.rooms.find((r) => r.type === "cardio")?.level).toBe(1)
	})

	it("knows which room type each piece of gear belongs in", () => {
		expect(roomTypeFor(byKey(["boxing_ring"])[0])).toBe("boxing")
		expect(roomTypeFor(byKey(["amenity_sauna"])[0])).toBe("recovery")
		expect(roomTypeFor(byKey(["staff_reception"])[0])).toBeNull()
		expect(roomTypeFor(byKey(["decor_plants"])[0])).toBeNull()
	})
})
