import { describe, expect, it } from "vitest"
import { CHANGELOG, unseenEntries } from "../../shared/changelog.js"

describe("changelog", () => {
	it("has unique ids, dates newest first, and plain short lines", () => {
		const ids = CHANGELOG.map((e) => e.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (let i = 1; i < CHANGELOG.length; i++)
			expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true)
		for (const e of CHANGELOG) {
			expect(e.items.length).toBeGreaterThan(0)
			expect(e.title.length).toBeLessThanOrEqual(40)
			for (const l of e.items) expect(l).not.toContain("!")
		}
	})

	it("lists what is newer than the last seen entry", () => {
		const [a, b, c] = ["a", "b", "c"].map((id) => ({
			id,
			date: "2026-01-01",
			title: id,
			items: ["x"],
		}))
		const list = [a, b, c]
		expect(unseenEntries(list, "a")).toEqual([])
		expect(unseenEntries(list, "b").map((e) => e.id)).toEqual(["a"])
		expect(unseenEntries(list, "c").map((e) => e.id)).toEqual(["a", "b"])
		// never seen anything, or an id that is gone: everything
		expect(unseenEntries(list, null)).toHaveLength(3)
		expect(unseenEntries(list, "zzz")).toHaveLength(3)
	})
})
