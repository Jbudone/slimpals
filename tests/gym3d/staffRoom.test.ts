import { describe, expect, it } from "vitest"
import {
	arcForSlot,
	episodeById,
	nextSlotAt,
	ROOM_ARCS,
	ROOM_MIN_HIRES,
	roomLog,
	roomState,
	slotDate,
	slotIndexAt,
} from "../../shared/gym3d/staffRoom.js"
import { SPEAKERS } from "../../shared/gym3d/story.js"

const d = (s: string) => new Date(`${s}T12:00:00Z`)

describe("staff room episodes", () => {
	it("are well formed and keep to the tone rules", () => {
		expect(new Set(ROOM_ARCS.map((a) => a.id)).size).toBe(ROOM_ARCS.length)
		for (const arc of ROOM_ARCS) {
			expect(arc.minHires).toBeGreaterThanOrEqual(1)
			for (const ep of arc.episodes) {
				expect(ep.title.length).toBeLessThanOrEqual(40)
				expect(ep.lines.length).toBeGreaterThanOrEqual(3)
				expect(ep.lines.length).toBeLessThanOrEqual(6)
				for (const l of ep.lines) {
					expect(l.who in SPEAKERS).toBe(true)
					expect(l.text.length).toBeLessThanOrEqual(100)
					expect(l.text).not.toContain("!")
					expect(l.text).not.toMatch(/weight|\bfat\b|lazy|skinny|diet|belly/i)
				}
			}
		}
	})
})

describe("the weekly slots", () => {
	it("fall on Wednesday and Saturday (UTC)", () => {
		// 2026-10-14 is a Wednesday, 2026-10-17 a Saturday
		expect(slotDate(slotIndexAt(d("2026-10-14")))).toBe("2026-10-14")
		expect(slotDate(slotIndexAt(d("2026-10-16")))).toBe("2026-10-14")
		expect(slotDate(slotIndexAt(d("2026-10-17")))).toBe("2026-10-17")
		expect(slotDate(slotIndexAt(d("2026-10-20")))).toBe("2026-10-17")
		expect(slotDate(slotIndexAt(d("2026-10-21")))).toBe("2026-10-21")
		// consecutive slots are consecutive indexes
		expect(slotIndexAt(d("2026-10-17"))).toBe(slotIndexAt(d("2026-10-14")) + 1)
		expect(slotIndexAt(d("2026-10-21"))).toBe(slotIndexAt(d("2026-10-17")) + 1)
	})

	it("says when the next one opens", () => {
		expect(nextSlotAt(d("2026-10-14")).toISOString()).toBe(
			"2026-10-17T00:00:00.000Z",
		)
		expect(nextSlotAt(d("2026-10-19")).toISOString()).toBe(
			"2026-10-21T00:00:00.000Z",
		)
	})
})

describe("which episode waits", () => {
	it("nothing until the gym has enough coaches, and says how many more", () => {
		const s = roomState(ROOM_MIN_HIRES - 1, [], d("2026-10-14"))
		expect(s.pending).toBeNull()
		expect(s.needHires).toBe(1)
		expect(roomState(0, [], d("2026-10-14")).needHires).toBe(ROOM_MIN_HIRES)
	})

	it("plays an arc's three episodes in turn, one per slot, then the next arc", () => {
		const days = [
			"2026-10-14",
			"2026-10-17",
			"2026-10-21",
			"2026-10-24",
			"2026-10-28",
			"2026-10-31",
		]
		const run = days.map((day) => roomState(4, [], d(day)).pending)
		// episode numbers cycle 1, 2, 3 and the arc only changes when they restart
		for (let i = 1; i < run.length; i++) {
			const prev = run[i - 1]
			const cur = run[i]
			if (cur?.n === 1) expect(cur.arcId).not.toBe(prev?.arcId)
			else {
				expect(cur?.arcId).toBe(prev?.arcId)
				expect(cur?.n).toBe((prev?.n ?? 0) + 1)
			}
		}
		expect(run.some((p) => p?.n === 3)).toBe(true)
	})

	it("holds the same episode all week until it is seen, then nothing until the next slot", () => {
		const a = roomState(2, [], d("2026-10-14"))
		const b = roomState(2, [], d("2026-10-16"))
		expect(a.pending?.id).toBe(b.pending?.id)
		const seen = [a.pending?.id ?? ""]
		expect(roomState(2, seen, d("2026-10-16")).pending).toBeNull()
		// the next slot has a new one
		expect(roomState(2, seen, d("2026-10-17")).pending?.id).not.toBe(seen[0])
	})

	it("only plays arcs the gym can staff, and more arcs open as coaches arrive", () => {
		for (let i = 0; i < 12; i++)
			expect(arcForSlot(i, 2)?.minHires).toBeLessThanOrEqual(2)
		const arcs = new Set<string>()
		for (let i = 0; i < 12; i++) arcs.add(arcForSlot(i, 4)?.id ?? "")
		expect(arcs.size).toBe(ROOM_ARCS.length)
	})
})

describe("the diary", () => {
	it("finds an episode from its id and refuses ids that are not one", () => {
		const e = episodeById("dnd.2026-10-14.1")
		expect(e?.arc.id).toBe("dnd")
		expect(e?.episode.title).toBe("The mimic in the closet")
		for (const bad of ["", "nope.2026-10-14.0", "dnd.2026-10-14.7", "dnd.x.0"])
			expect(episodeById(bad)).toBeNull()
	})

	it("lists what was seen, newest first, skipping ids that no longer exist", () => {
		const log = roomLog([
			"dnd.2026-10-14.0",
			"gone.2026-10-15.0",
			"lost.2026-10-21.2",
			"dnd.2026-10-17.1",
		])
		expect(log.map((l) => l.id)).toEqual([
			"lost.2026-10-21.2",
			"dnd.2026-10-17.1",
			"dnd.2026-10-14.0",
		])
		expect(log[0]).toMatchObject({ n: 3, of: 3, title: "Case closed" })
		// the state carries it, whatever else is going on
		expect(
			roomState(0, ["dnd.2026-10-14.0"], d("2026-10-14")).log,
		).toHaveLength(1)
	})
})
