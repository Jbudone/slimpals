import { describe, expect, it } from "vitest"
import { GYM_UPGRADES } from "../../server/db/seed.js"
import {
	DECOR_ITEM,
	deriveInitialLayout,
	type LayoutPlan,
	lobbyOnlyPlan,
	placeNewUnlocks,
	planPlots,
	type UnlockedUpgrade,
} from "../../server/services/gym/layout3d.js"
import {
	decorSlots,
	LOBBY_CELL,
	levelForSpots,
	PD,
	PW,
	roomSpots,
} from "../../shared/gym3d/rooms.js"

const ALL: UnlockedUpgrade[] = GYM_UPGRADES.map((u) => ({
	key: u.key,
	category: u.category,
	sortOrder: u.sortOrder,
}))
const byKey = (keys: string[]) => ALL.filter((u) => keys.includes(u.key))

function roomOf(plan: LayoutPlan, upgradeKey: string) {
	const piece = plan.pieces.find((p) => p.upgradeKey === upgradeKey)
	if (!piece) return null
	return plan.rooms.find((r) => r.ref === piece.roomRef) ?? null
}

describe("deriveInitialLayout", () => {
	it("zero unlocks gives the lobby only, with its fixed furniture", () => {
		const plan = deriveInitialLayout([])
		expect(plan.rooms).toHaveLength(1)
		expect(plan.rooms[0].type).toBe("lobby")
		expect(plan.rooms[0].cells).toEqual([LOBBY_CELL])
		expect(plan.pieces.map((p) => p.upgradeKey).sort()).toEqual([
			"amenity_lockers",
			"staff_reception",
		])
		expect(plan.pieces.every((p) => p.locked)).toBe(true)
		expect(plan.unplaced).toEqual([])
	})

	it("places or lists every catalog key exactly once", () => {
		const plan = deriveInitialLayout(ALL)
		const seen = [...plan.pieces.map((p) => p.upgradeKey), ...plan.unplaced]
		expect(seen.slice().sort()).toEqual(ALL.map((u) => u.key).sort())
		expect(new Set(seen).size).toBe(seen.length)
	})

	it("maps categories to the planned rooms", () => {
		const plan = deriveInitialLayout(ALL)
		const expectRoom = (key: string, type: string) =>
			expect(roomOf(plan, key)?.type, key).toBe(type)
		for (const k of [
			"cardio_treadmill",
			"cardio_rowing",
			"cardio_bikes",
			"cardio_stairs",
			"cardio_cinema",
			"lagree_megaformer",
		])
			expectRoom(k, "cardio")
		for (const k of [
			"weights_dumbbells",
			"weights_barbell",
			"weights_cable",
			"weights_smith",
			"weights_olympic",
		])
			expectRoom(k, "weights")
		for (const k of [
			"boxing_ring",
			"boxing_mitts_station",
			"punching_bags_heavy_bag_row",
			"punching_bags_double_end",
			"hero_spotlight_stage",
		])
			expectRoom(k, "boxing")
		for (const k of ["swimming_lap_pool", "swimming_poolside_loungers"])
			expectRoom(k, "pool")
		for (const k of [
			"amenity_juice",
			"amenity_water",
			"staff_nutrition",
			"staff_ownership_suite",
		])
			expectRoom(k, "juice")
		for (const k of [
			"amenity_sauna",
			"amenity_showers",
			"staff_massage",
			"staff_physio",
		])
			expectRoom(k, "recovery")
		for (const k of [
			"staff_reception",
			"amenity_lockers",
			"staff_assistant_trainer",
			"staff_manager_office",
		])
			expectRoom(k, "lobby")
		for (const k of Object.keys(DECOR_ITEM)) {
			const piece = plan.pieces.find((p) => p.upgradeKey === k)
			expect(piece?.kind, k).toBe("decor")
			expect(piece?.itemKey).toBe(DECOR_ITEM[k])
		}
		// slice 3: the offices have homes, nothing is left unplaced
		expect(plan.unplaced).toEqual([])
	})

	it("creates rooms in the fixed order on lobby-connected cells", () => {
		const plan = deriveInitialLayout(ALL)
		expect(
			plan.rooms.map((r) => [r.type, r.cells[0].px, r.cells[0].pz]),
		).toEqual([
			["lobby", 1, 2],
			["cardio", 1, 1],
			["weights", 0, 2],
			["boxing", 2, 2],
			["recovery", 0, 1],
			["juice", 2, 1],
			["pool", 1, 0],
		])
	})

	it("gives unique spot indices inside each room's spot count and matching sizes", () => {
		const plan = deriveInitialLayout(ALL)
		for (const r of plan.rooms) {
			const spots = roomSpots(r.type, r.cells)
			const inRoom = plan.pieces.filter(
				(p) => p.roomRef === r.ref && p.spotIndex != null,
			)
			const idx = inRoom.map((p) => p.spotIndex as number)
			expect(new Set(idx).size).toBe(idx.length)
			for (const p of inRoom) {
				const s = spots[p.spotIndex as number]
				expect(s, `${p.upgradeKey} spot`).toBeDefined()
				expect(p.x2).toBe(s.x * 2)
				expect(p.z2).toBe(s.z * 2)
				expect(s.unlock).toBeLessThanOrEqual(r.level)
			}
			expect(r.level).toBe(levelForSpots(spots, idx))
		}
	})

	it("raises a room's level to open the spots it needs", () => {
		const five = deriveInitialLayout(
			byKey([
				"cardio_treadmill",
				"cardio_rowing",
				"cardio_bikes",
				"cardio_stairs",
				"cardio_cinema",
			]),
		)
		expect(five.rooms.find((r) => r.type === "cardio")?.level).toBe(2)
		const six = deriveInitialLayout(
			byKey([
				"cardio_treadmill",
				"cardio_rowing",
				"cardio_bikes",
				"cardio_stairs",
				"cardio_cinema",
				"lagree_megaformer",
			]),
		)
		expect(six.rooms.find((r) => r.type === "cardio")?.level).toBe(3)
		const one = deriveInitialLayout(byKey(["cardio_treadmill"]))
		expect(one.rooms.find((r) => r.type === "cardio")?.level).toBe(1)
	})

	it("puts the 3 x 3 pieces on the big spots", () => {
		const plan = deriveInitialLayout(
			byKey(["boxing_ring", "swimming_lap_pool"]),
		)
		for (const k of ["boxing_ring", "swimming_lap_pool"]) {
			const p = plan.pieces.find((q) => q.upgradeKey === k)
			const r = roomOf(plan, k)
			expect(p && r).toBeTruthy()
			if (!p || !r) continue
			expect(roomSpots(r.type, r.cells)[p.spotIndex as number].size).toBe(3)
		}
	})

	it("is deterministic regardless of input order", () => {
		const a = deriveInitialLayout(ALL)
		const b = deriveInitialLayout(ALL.slice().reverse())
		expect(b).toEqual(a)
	})

	it("never shares a plot between rooms and keeps pieces inside their room", () => {
		const plan = deriveInitialLayout(ALL)
		const plots = planPlots(plan)
		const keys = plots.map((p) => `${p.px},${p.pz}`)
		expect(new Set(keys).size).toBe(keys.length)
		for (const p of plan.pieces) {
			const r = plan.rooms.find((q) => q.ref === p.roomRef)
			expect(r).toBeDefined()
			if (!r) continue
			const x = p.x2 / 2
			const z = p.z2 / 2
			expect(
				r.cells.some(
					(c) =>
						x > c.px * PW &&
						x < (c.px + 1) * PW &&
						z > c.pz * PD &&
						z < (c.pz + 1) * PD,
				),
				p.upgradeKey,
			).toBe(true)
		}
		const pos = plan.pieces.map((p) => `${p.x2},${p.z2}`)
		expect(new Set(pos).size).toBe(pos.length)
	})

	it("places decor only on free decor places", () => {
		const plan = deriveInitialLayout(ALL)
		for (const p of plan.pieces.filter((q) => q.kind === "decor")) {
			const r = plan.rooms.find((q) => q.ref === p.roomRef)
			if (!r) throw new Error("decor without a room")
			const ok = decorSlots(r.type).some(
				(s) =>
					(r.cells[0].px * PW + s.x) * 2 === p.x2 &&
					(r.cells[0].pz * PD + s.z) * 2 === p.z2,
			)
			expect(ok, p.upgradeKey).toBe(true)
		}
	})

	it("connects every room to the lobby through shared walls", () => {
		const plan = deriveInitialLayout(ALL)
		const owner = new Map<string, number>()
		for (const p of planPlots(plan)) owner.set(`${p.px},${p.pz}`, p.roomRef)
		const lobby = plan.rooms.find((r) => r.type === "lobby")
		if (!lobby) throw new Error("no lobby")
		const start = `${lobby.cells[0].px},${lobby.cells[0].pz}`
		const seen = new Set([start])
		const queue = [start]
		while (queue.length) {
			const cur = queue.shift() as string
			const [px, pz] = cur.split(",").map(Number)
			for (const [dx, dz] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			]) {
				const k = `${px + dx},${pz + dz}`
				if (owner.has(k) && !seen.has(k)) {
					seen.add(k)
					queue.push(k)
				}
			}
		}
		expect(seen.size).toBe(owner.size)
	})
})

describe("placeNewUnlocks", () => {
	it("is idempotent", () => {
		const plan = deriveInitialLayout(
			byKey(["cardio_treadmill", "decor_posters"]),
		)
		const again = placeNewUnlocks(
			plan,
			byKey(["cardio_treadmill", "decor_posters"]),
		)
		expect(again).toEqual(plan)
		const all = placeNewUnlocks(plan, ALL)
		expect(placeNewUnlocks(all, ALL)).toEqual(all)
	})

	it("adds a new unlock without moving what is already placed", () => {
		const plan = deriveInitialLayout(byKey(["cardio_treadmill"]))
		const next = placeNewUnlocks(
			plan,
			byKey(["cardio_treadmill", "cardio_rowing"]),
		)
		expect(next.pieces.slice(0, plan.pieces.length)).toEqual(plan.pieces)
		expect(next.pieces).toHaveLength(plan.pieces.length + 1)
		expect(roomOf(next, "cardio_rowing")?.type).toBe("cardio")
	})

	it("opens a new room on the next free cell", () => {
		const plan = deriveInitialLayout(byKey(["weights_dumbbells"]))
		expect(plan.rooms.find((r) => r.type === "weights")?.cells[0]).toEqual({
			px: 1,
			pz: 1,
		})
		const next = placeNewUnlocks(plan, byKey(["cardio_treadmill"]))
		expect(next.rooms.find((r) => r.type === "cardio")?.cells[0]).toEqual({
			px: 0,
			pz: 2,
		})
	})

	it("never mutates its input", () => {
		const plan = lobbyOnlyPlan()
		const copy = structuredClone(plan)
		placeNewUnlocks(plan, ALL)
		expect(plan).toEqual(copy)
	})
})
