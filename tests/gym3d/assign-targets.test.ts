import { describe, expect, it } from "vitest"
import {
	ambientCap,
	assignTargets,
	type NpcIn,
	type PieceIn,
} from "../../src/components/gym3d/world/assignTargets.js"

const npc = (
	npcKey: string,
	role: string,
	targetEquipmentKey: string | null = null,
	isPresent = true,
): NpcIn => ({ npcKey, role, targetEquipmentKey, isPresent })

const PIECES: PieceIn[] = [
	{
		id: 1,
		upgradeKey: "staff_reception",
		stations: [{ staff: true, swim: false }],
	},
	{
		id: 2,
		upgradeKey: "cardio_treadmill",
		stations: [{ staff: false, swim: false }],
	},
	{
		id: 3,
		upgradeKey: "boxing_mitts_station",
		stations: [
			{ staff: false, swim: false },
			{ staff: true, swim: false },
		],
	},
	{
		id: 4,
		upgradeKey: "swimming_lap_pool",
		stations: [{ staff: false, swim: true }],
	},
	{ id: 5, upgradeKey: null, stations: [] },
]

describe("assignTargets", () => {
	it("puts an NPC on the station of its target equipment", () => {
		const a = assignTargets(
			[npc("regular_derek", "regular", "cardio_treadmill")],
			PIECES,
		)
		expect(a).toEqual([
			{
				npcKey: "regular_derek",
				target: { kind: "station", pieceId: 2, station: 0 },
			},
		])
	})

	it("sends the receptionist with no target to the reception desk", () => {
		const a = assignTargets([npc("receptionist_lisa", "receptionist")], PIECES)
		expect(a[0].target).toEqual({ kind: "station", pieceId: 1, station: 0 })
	})

	it("idles everyone else in the lobby, one slot each", () => {
		const a = assignTargets(
			[
				npc("regular_tom", "regular"),
				npc("regular_elena", "regular", "weights_smith"),
			],
			PIECES,
		)
		expect(a.map((x) => x.target)).toEqual([
			{ kind: "lobby", slot: 0 },
			{ kind: "lobby", slot: 1 },
		])
	})

	it("leaves absent NPCs out", () => {
		expect(
			assignTargets([npc("regular_tom", "regular", null, false)], PIECES),
		).toEqual([])
	})

	it("staff roles take staff stations, members the others", () => {
		const a = assignTargets(
			[
				npc("trainer_marcus", "trainer", "boxing_mitts_station"),
				npc("regular_priya", "regular", "boxing_mitts_station"),
			],
			PIECES,
		)
		expect(a[0].target).toEqual({ kind: "station", pieceId: 3, station: 1 })
		expect(a[1].target).toEqual({ kind: "station", pieceId: 3, station: 0 })
	})

	it("never gives one station to two people", () => {
		const a = assignTargets(
			[
				npc("regular_derek", "regular", "cardio_treadmill"),
				npc("regular_tom", "regular", "cardio_treadmill"),
			],
			PIECES,
		)
		expect(a[0].target.kind).toBe("station")
		expect(a[1].target).toEqual({ kind: "lobby", slot: 0 })
	})

	it("never puts a named NPC in the pool swim lane", () => {
		const a = assignTargets(
			[npc("regular_elena", "regular", "swimming_lap_pool")],
			PIECES,
		)
		expect(a[0].target).toEqual({ kind: "lobby", slot: 0 })
	})

	it("a member never takes a staff-only station", () => {
		const pieces: PieceIn[] = [
			{
				id: 9,
				upgradeKey: "staff_trainer",
				stations: [{ staff: true, swim: false }],
			},
		]
		const a = assignTargets(
			[npc("regular_tom", "regular", "staff_trainer")],
			pieces,
		)
		expect(a[0].target).toEqual({ kind: "lobby", slot: 0 })
	})

	it("ambient cap follows the quality level", () => {
		expect([0, 1, 2, 3, 4].map(ambientCap)).toEqual([6, 6, 4, 4, 2])
	})
})
