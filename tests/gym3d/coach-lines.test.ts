import { describe, expect, it } from "vitest"
import {
	allCoachLines,
	COACH_VOICES,
	type CoachContext,
	coachLineFor,
	isCoachVoice,
} from "../../shared/gym3d/coachLines.js"

const base: CoachContext = { left: 3, total: 4, loaded: true, hour: 9 }
const rng = () => 0

describe("coach lines", () => {
	it("every voice speaks in every situation, on the player's side", () => {
		expect(COACH_VOICES).toHaveLength(5)
		const all = allCoachLines()
		for (const v of COACH_VOICES)
			expect(
				all.filter((l) => l.id.startsWith(`${v}:`)).length,
			).toBeGreaterThan(12)
		for (const l of all) {
			const text = `${l.lead} ${l.rest}`.toLowerCase()
			expect(text).not.toMatch(/weight|\bfat\b|lazy|skinny|diet/)
		}
	})

	it("fills in the tasks left, the gear and the streak", () => {
		const say = coachLineFor("friendly", { ...base, left: 1 }, [], rng)
		expect(`${say.lead} ${say.rest}`).toContain("1 task ")
		const many = coachLineFor("bro", { ...base, left: 3 }, [], rng)
		expect(`${many.lead} ${many.rest}`).toContain("3 tasks")
		const gear = coachLineFor(
			"drill_sergeant",
			{ ...base, pendingGear: "Squat Rack" },
			[],
			rng,
		)
		expect(`${gear.lead} ${gear.rest}`).toContain("Squat Rack")
		const streak = coachLineFor("friendly", { ...base, streak: 7 }, [], rng)
		expect(streak.id).toContain(":streak:")
		expect(`${streak.lead} ${streak.rest}`).toContain("7")
	})

	it("picks the situation by what matters most", () => {
		const sit = (c: Partial<CoachContext>) =>
			coachLineFor("roaster", { ...base, ...c }, [], rng).id.split(":")[1]
		expect(sit({ pendingGear: "X", left: 0 })).toBe("gear")
		expect(sit({ loaded: false })).toBe("loading")
		expect(sit({ left: 0, streak: 7 })).toBe("done")
		expect(sit({ streak: 7 })).toBe("streak")
		expect(sit({ streak: 8 })).toBe("morning")
		expect(sit({ hour: 14 })).toBe("day")
		expect(sit({ hour: 20 })).toBe("evening")
	})

	it("does not repeat a line it said lately while another one fits", () => {
		const seen: string[] = []
		for (let i = 0; i < 2; i++) {
			const say = coachLineFor("anime_sensei", { ...base, left: 0 }, seen, rng)
			expect(seen).not.toContain(say.id)
			seen.push(say.id)
		}
		// once every line was said recently it still answers
		const all = [
			"anime_sensei:done:0",
			"anime_sensei:done:1",
			"anime_sensei:done:2",
		]
		expect(
			coachLineFor("anime_sensei", { ...base, left: 0 }, all, rng).id,
		).toMatch(/^anime_sensei:done:/)
	})

	it("knows which names are voices", () => {
		expect(isCoachVoice("bro")).toBe(true)
		expect(isCoachVoice("nope")).toBe(false)
		expect(isCoachVoice(undefined)).toBe(false)
	})
})
