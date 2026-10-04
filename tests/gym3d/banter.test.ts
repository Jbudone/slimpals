import { describe, expect, it } from "vitest"
import {
	BANTER,
	type BanterContext,
	banterFor,
	GEAR_LINES,
	gearLine,
	pickBanter,
} from "../../shared/gym3d/banter.js"

const full: BanterContext = {
	rooms: ["cardio", "weights", "boxing", "recovery", "juice", "pool", "court"],
	gear: ["weights_olympic", "weights_cable", "lagree_megaformer"],
	crowded: false,
}

describe("ambient banter", () => {
	it("keeps to the style: 2-3 short lines, no exclamation marks", () => {
		expect(new Set(BANTER.map((b) => b.id)).size).toBe(BANTER.length)
		for (const b of BANTER) {
			expect(b.lines.length).toBeGreaterThanOrEqual(2)
			for (const l of b.lines) {
				expect(l.length).toBeLessThanOrEqual(80)
				expect(l).not.toContain("!")
			}
		}
	})

	it("has a rival to compare with: MaxOut across the street", () => {
		const bare = { ...full, rooms: ["cardio"], gear: [] }
		const lines = banterFor(bare).flatMap((b) => b.lines)
		expect(lines.some((l) => l.includes("MaxOut"))).toBe(true)
		expect(banterFor(full).some((b) => b.id.startsWith("maxout"))).toBe(false)
	})

	it("talks about what the gym is missing, and about a crowd", () => {
		const bare = { ...full, rooms: ["cardio"], gear: [] }
		const ids = banterFor(bare).map((b) => b.id)
		expect(ids).toContain("no-pool")
		expect(ids).toContain("no-olympic")
		expect(ids).not.toContain("crowded-1")
		expect(banterFor({ ...full, crowded: true }).map((b) => b.id)).toContain(
			"crowded-1",
		)
	})

	it("talks about an event, a class or fresh gear while it lasts", () => {
		const ids = (extra: Partial<BanterContext>) =>
			banterFor({ ...full, ...extra }).map((b) => b.id)
		expect(ids({ event: true }).every((i) => i.startsWith("event"))).toBe(true)
		expect(ids({ classes: true }).every((i) => i.startsWith("class"))).toBe(
			true,
		)
		expect(ids({ upgraded: true }).every((i) => i.startsWith("upgrade"))).toBe(
			true,
		)
		expect(ids({}).some((i) => i.startsWith("event"))).toBe(false)
	})

	it("grumbles about MaxOut's promo only while it runs", () => {
		const ids = (extra: Partial<BanterContext>) =>
			banterFor({ ...full, ...extra }).map((b) => b.id)
		expect(
			ids({ maxout: true }).every((i) => i.startsWith("maxout-promo")),
		).toBe(true)
		expect(ids({}).some((i) => i.startsWith("maxout-promo"))).toBe(false)
	})

	it("talks about the season only in it, and gaps still come first", () => {
		const ids = (extra: Partial<BanterContext>) =>
			banterFor({ ...full, ...extra }).map((b) => b.id)
		expect(ids({ season: "winter" }).some((i) => i.startsWith("winter"))).toBe(
			true,
		)
		expect(ids({ season: "harvest" }).some((i) => i.startsWith("winter"))).toBe(
			false,
		)
		expect(ids({}).some((i) => /^(winter|harvest|spring|summer)/.test(i))).toBe(
			false,
		)
		const gap = { ...full, rooms: [], season: "winter" as const }
		expect(banterFor(gap).every((b) => !b.id.startsWith("winter"))).toBe(true)
	})

	it("falls back to plain chatter and avoids repeats", () => {
		const plain = banterFor(full)
		expect(plain.length).toBeGreaterThan(1)
		expect(plain.every((b) => b.id.startsWith("plain"))).toBe(true)
		const first = pickBanter(full, [], () => 0)
		const next = pickBanter(full, [first?.id ?? ""], () => 0)
		expect(next?.id).not.toBe(first?.id)
	})

	it("members only comment on upgraded gear, in the same dry style", () => {
		expect(gearLine(1, () => 0)).toBeNull()
		expect(gearLine(2, () => 0)).toBe(GEAR_LINES[2][0])
		expect(gearLine(3, () => 0.99)).toBe(GEAR_LINES[3][2])
		for (const l of [...GEAR_LINES[2], ...GEAR_LINES[3]])
			expect(l).not.toContain("!")
	})
})
