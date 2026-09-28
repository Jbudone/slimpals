import { describe, expect, it } from "vitest"
import { GYM_UPGRADES } from "../../server/db/seed.js"
import {
	deriveInitialLayout,
	type LayoutPlan,
	placeNewUnlocks,
	type UnlockedUpgrade,
} from "../../server/services/gym/layout3d.js"
import {
	DOOR_HALF,
	decorSlots,
	itemSize,
	LOBBY_CELL,
	LOBBY_EXTRA_SPOTS,
	LOBBY_FIXTURES,
	LOBBY_OFFICES,
	PD,
	PW,
} from "../../shared/gym3d/rooms.js"

const ALL: UnlockedUpgrade[] = GYM_UPGRADES.map((u) => ({
	key: u.key,
	category: u.category,
	sortOrder: u.sortOrder,
}))
const OFFICE_KEYS = [
	"staff_assistant_trainer",
	"staff_manager_office",
	"staff_ownership_suite",
]
const pieceOf = (plan: LayoutPlan, key: string) =>
	plan.pieces.find((p) => p.upgradeKey === key)

type Rect = { x0: number; x1: number; z0: number; z1: number }
const rect = (x: number, z: number, s: number): Rect => ({
	x0: x - s / 2,
	x1: x + s / 2,
	z0: z - s / 2,
	z1: z + s / 2,
})
const overlaps = (a: Rect, b: Rect) =>
	a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1

describe("office staff placement (gym3d slice 3)", () => {
	it("leaves no catalog upgrade unplaced in a full gym", () => {
		const plan = deriveInitialLayout(ALL)
		expect(plan.unplaced).toEqual([])
		for (const k of OFFICE_KEYS) {
			const p = pieceOf(plan, k)
			expect(p?.status, k).toBe("placed")
		}
	})

	it("builds the manager's office into the lobby at its fixed nook", () => {
		const plan = deriveInitialLayout(ALL)
		const p = pieceOf(plan, "staff_manager_office")
		const lobby = plan.rooms.find((r) => r.type === "lobby")
		expect(p?.roomRef).toBe(lobby?.ref)
		const o = LOBBY_OFFICES[0]
		expect(p?.x2).toBe((LOBBY_CELL.px * PW + o.x) * 2)
		expect(p?.z2).toBe((LOBBY_CELL.pz * PD + o.z) * 2)
		expect(p?.locked).toBe(true)
		expect(p?.spotIndex).toBeNull()
	})

	it("keeps the lobby office clear of doorways, fixtures, decor and staff places", () => {
		for (const o of LOBBY_OFFICES) {
			const r = rect(o.x, o.z, itemSize(o.key, "equipment"))
			// inside the lobby, off the walls
			expect(r.x0).toBeGreaterThanOrEqual(0.12)
			expect(r.x1).toBeLessThanOrEqual(PW)
			expect(r.z0).toBeGreaterThanOrEqual(0.12)
			// not in front of the back / street doorways (x 3.5..5.5)
			const door = { x0: PW / 2 - DOOR_HALF, x1: PW / 2 + DOOR_HALF }
			expect(r.x1 <= door.x0 || r.x0 >= door.x1).toBe(true)
			// not over the side doorways (z 2..4)
			expect(r.z1).toBeLessThanOrEqual(PD / 2 - DOOR_HALF + 0.01)
			for (const f of LOBBY_FIXTURES)
				expect(
					overlaps(r, rect(f.x, f.z, 2)) &&
						// reception may touch the nook's front edge
						Math.min(r.z1, f.z + 1) - Math.max(r.z0, f.z - 1) > 0.3,
					f.key,
				).toBe(false)
			for (const e of LOBBY_EXTRA_SPOTS)
				expect(overlaps(r, rect(e.x, e.z, 2))).toBe(false)
			for (const d of decorSlots("lobby"))
				expect(overlaps(r, rect(d.x, d.z, 0.5))).toBe(false)
		}
	})

	it("puts the ownership suite in the Juice bar", () => {
		const plan = deriveInitialLayout(ALL)
		const p = pieceOf(plan, "staff_ownership_suite")
		const room = plan.rooms.find((r) => r.ref === p?.roomRef)
		expect(room?.type).toBe("juice")
		expect(p?.spotIndex).not.toBeNull()
	})

	it("places offices unlocked after seeding (slice 1 left them unplaced)", () => {
		const early = ALL.filter(
			(u) =>
				u.key !== "staff_manager_office" && u.key !== "staff_ownership_suite",
		)
		const seeded = deriveInitialLayout(early)
		const later = placeNewUnlocks(seeded, ALL, { newRooms: false })
		expect(later.unplaced).toEqual([])
		expect(pieceOf(later, "staff_manager_office")?.status).toBe("placed")
		expect(pieceOf(later, "staff_ownership_suite")?.status).toBe("placed")
	})

	it("stores the suite (never drops it) when there is no Juice bar", () => {
		const noJuice = ALL.filter(
			(u) =>
				!["amenity_juice", "amenity_water", "staff_nutrition"].includes(
					u.key,
				) && u.key !== "staff_ownership_suite",
		)
		const seeded = deriveInitialLayout(noJuice)
		expect(seeded.rooms.some((r) => r.type === "juice")).toBe(false)
		const later = placeNewUnlocks(
			seeded,
			ALL.filter((u) => u.key === "staff_ownership_suite"),
			{
				newRooms: false,
			},
		)
		expect(later.unplaced).toEqual([])
		expect(pieceOf(later, "staff_ownership_suite")?.status).toBe("stored")
	})
})
