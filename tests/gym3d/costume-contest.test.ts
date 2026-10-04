import { describe, expect, it } from "vitest"
import {
	CONTEST_LINES,
	contestDay,
	pickContestWinner,
} from "../../shared/gym3d/costumeContest.js"

describe("costume contest", () => {
	it("needs a costumed member, and picks the same winner whatever the order", () => {
		expect(pickContestWinner([], "2026-10-04", 1)).toBeNull()
		const keys = ["member:a", "member:b", "member:c", "member:d"]
		const w = pickContestWinner(keys, "2026-10-04", 7)
		expect(keys).toContain(w)
		expect(pickContestWinner([...keys].reverse(), "2026-10-04", 7)).toBe(w)
	})

	it("changes with the day and the gym", () => {
		const keys = Array.from({ length: 12 }, (_, i) => `member:${i}`)
		const days = new Set(
			Array.from({ length: 20 }, (_, i) =>
				pickContestWinner(keys, `2026-10-${String(i + 1).padStart(2, "0")}`, 3),
			),
		)
		expect(days.size).toBeGreaterThan(3)
		const gyms = new Set(
			Array.from({ length: 20 }, (_, g) =>
				pickContestWinner(keys, "2026-10-04", g),
			),
		)
		expect(gyms.size).toBeGreaterThan(3)
		expect(contestDay(new Date("2026-10-04T23:59:00Z"))).toBe("2026-10-04")
	})

	it("keeps the winner's lines dry and kind", () => {
		for (const l of CONTEST_LINES) {
			expect(l).not.toContain("!")
			expect(l).not.toMatch(/weight|\bfat\b|lazy|skinny|diet|belly/i)
		}
	})
})
