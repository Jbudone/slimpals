import { describe, expect, it } from "vitest"
import {
	allChallengeLines,
	allCoachLines,
	COACH_VOICES,
	COINS_PILE,
	type CoachContext,
	challengeLineFor,
	challengeStage,
	coachLineFor,
	isCoachVoice,
} from "../../shared/gym3d/coachLines.js"
import { challengeStanding } from "../../src/lib/challengeCoach.js"

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

describe("challenge commentary", () => {
	it("staged by the month's pace, with the first and last days special", () => {
		const st = (day: number, done: number) =>
			challengeStage({ day, days: 30, done })
		expect(st(1, 0)).toBe("start")
		expect(st(29, 0.2)).toBe("finale")
		expect(st(15, 0.7)).toBe("ahead")
		expect(st(15, 0.5)).toBe("on")
		expect(st(15, 0.2)).toBe("behind")
	})

	it("every voice has lines for every stage, on the player's side, with the days left filled in", () => {
		const all = allChallengeLines()
		expect(all).toHaveLength(COACH_VOICES.length * 5 * 2)
		for (const l of all)
			expect(`${l.lead} ${l.rest}`.toLowerCase()).not.toMatch(
				/weight|\bfat\b|lazy|skinny|diet/,
			)
		const say = challengeLineFor("bro", { day: 10, days: 30, done: 0.1 }, rng)
		expect(`${say.lead} ${say.rest}`).not.toContain("{")
		const left = challengeLineFor(
			"friendly",
			{ day: 3, days: 30, done: 0.5 },
			rng,
		)
		expect(left.id).toContain("challenge-ahead")
	})

	it("now and then replaces the task count, but never over gear, a finished day or a done challenge", () => {
		const ch = { day: 10, days: 30, done: 0.3 }
		expect(
			coachLineFor("friendly", { ...base, challenge: ch }, [], () => 0).id,
		).toContain(":challenge-")
		// a roll above the chance keeps the task line
		expect(
			coachLineFor("friendly", { ...base, challenge: ch }, [], () => 0.9).id,
		).toContain(":morning:")
		expect(
			coachLineFor(
				"friendly",
				{ ...base, challenge: ch, pendingGear: "X" },
				[],
				() => 0,
			).id,
		).toContain(":gear:")
		expect(
			coachLineFor(
				"friendly",
				{ ...base, challenge: { ...ch, complete: true } },
				[],
				() => 0,
			).id,
		).toContain(":morning:")
	})

	it("nudges about a pile of waiting coins now and then, never over gear or loading", () => {
		const pile = { ...base, coinsWaiting: 1250 }
		const say = coachLineFor("friendly", pile, [], () => 0)
		expect(say.id).toContain(":coins:")
		expect(`${say.lead} ${say.rest}`).toContain("1,250")
		expect(`${say.lead} ${say.rest}`).not.toContain("{c}")
		// every voice has coin lines
		for (const v of COACH_VOICES)
			expect(coachLineFor(v, pile, [], () => 0).id).toContain(":coins:")
		// a roll above the chance, a small stash, gear and loading keep their lines
		expect(coachLineFor("friendly", pile, [], () => 0.9).id).toContain(
			":morning:",
		)
		expect(
			coachLineFor(
				"friendly",
				{ ...base, coinsWaiting: COINS_PILE - 1 },
				[],
				() => 0,
			).id,
		).toContain(":morning:")
		expect(
			coachLineFor("friendly", { ...pile, pendingGear: "X" }, [], () => 0).id,
		).toContain(":gear:")
		expect(
			coachLineFor("friendly", { ...pile, loaded: false }, [], () => 0).id,
		).toContain(":loading:")
	})

	it("works out the standing from the challenge's goals, for this month only", () => {
		const c = {
			month: 10,
			year: 2026,
			goals: [
				{ id: "a", target: 10 },
				{ id: "b", target: 20 },
			],
			progress: { a: 10, b: 5 },
			completedAt: null,
		}
		const st = challengeStanding(c, new Date("2026-10-15T12:00:00Z"))
		expect(st).toEqual({ day: 15, days: 31, done: 0.625, complete: false })
		expect(challengeStanding(c, new Date("2026-11-02T12:00:00Z"))).toBeNull()
	})
})
