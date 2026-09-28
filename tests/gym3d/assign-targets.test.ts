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

	describe("homes and the event host (slice 3)", () => {
		const OFFICE: PieceIn = {
			id: 20,
			upgradeKey: "staff_manager_office",
			stations: [{ staff: true, swim: false }],
		}
		const STAGE: PieceIn = {
			id: 21,
			upgradeKey: "hero_spotlight_stage",
			stations: [{ staff: false, swim: false }],
		}
		const homes = {
			manager_alex: { key: "staff_manager_office", always: true },
			hero_bodybuilder_rex: { key: "hero_spotlight_stage", always: true },
			hero_influencer_maya: { key: "hero_spotlight_stage", always: true },
			trainer_jordan: { key: "staff_trainer" },
		}

		it("sends the manager to the office even when the sim picked the desk, leaving the desk to Lisa", () => {
			const a = assignTargets(
				[
					npc("manager_alex", "manager", "staff_reception"),
					npc("receptionist_lisa", "receptionist", "staff_reception"),
				],
				[...PIECES, OFFICE],
				{ homes },
			)
			expect(a.find((x) => x.npcKey === "manager_alex")?.target).toEqual({
				kind: "station",
				pieceId: 20,
				station: 0,
			})
			expect(a.find((x) => x.npcKey === "receptionist_lisa")?.target).toEqual({
				kind: "station",
				pieceId: 1,
				station: 0,
			})
		})

		it("puts a visiting hero on the spotlight stage; a second hero falls back", () => {
			const a = assignTargets(
				[
					npc("hero_bodybuilder_rex", "hero", "weights_smith"),
					npc("hero_influencer_maya", "hero", "cardio_treadmill"),
				],
				[...PIECES, STAGE],
				{ homes },
			)
			expect(a[0].target).toEqual({ kind: "station", pieceId: 21, station: 0 })
			expect(a[1].target).toEqual({ kind: "station", pieceId: 2, station: 0 })
		})

		it("uses the sim's pick while a home's piece does not exist", () => {
			const a = assignTargets(
				[npc("hero_bodybuilder_rex", "hero", "cardio_treadmill")],
				PIECES,
				{ homes },
			)
			expect(a[0].target).toEqual({ kind: "station", pieceId: 2, station: 0 })
		})

		it("uses a non-always home only when the sim has nothing for them", () => {
			const trainer: PieceIn = {
				id: 22,
				upgradeKey: "staff_trainer",
				stations: [{ staff: true, swim: false }],
			}
			const busy = assignTargets(
				[npc("trainer_jordan", "trainer", "cardio_treadmill")],
				[...PIECES, trainer],
				{ homes },
			)
			expect(busy[0].target).toEqual({
				kind: "station",
				pieceId: 2,
				station: 0,
			})
			const free = assignTargets(
				[npc("trainer_jordan", "trainer", null)],
				[...PIECES, trainer],
				{ homes },
			)
			expect(free[0].target).toEqual({
				kind: "station",
				pieceId: 22,
				station: 0,
			})
		})

		it("sends the event host to the event spot, in sim order", () => {
			const a = assignTargets(
				[
					npc("regular_tom", "regular"),
					npc("trainer_marcus", "trainer", "cardio_treadmill"),
				],
				PIECES,
				{ eventHost: "trainer_marcus" },
			)
			expect(a.map((x) => x.npcKey)).toEqual(["regular_tom", "trainer_marcus"])
			expect(a[1].target).toEqual({ kind: "event" })
			expect(a[0].target).toEqual({ kind: "lobby", slot: 0 })
		})

		it("ignores an event host who is not in", () => {
			const a = assignTargets(
				[npc("trainer_marcus", "trainer", null, false)],
				PIECES,
				{ eventHost: "trainer_marcus" },
			)
			expect(a).toEqual([])
		})
	})
})
