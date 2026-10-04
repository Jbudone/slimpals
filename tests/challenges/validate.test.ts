import { describe, expect, it } from "vitest"
import { validateGeneratedChallenge } from "../../shared/challenges/validate.js"

const goal = (n: number, over: Record<string, unknown> = {}) => ({
	id: `goal_${n}`,
	title: "120 Glasses of Water",
	description: "Stay hydrated",
	target: 120,
	unit: "glasses",
	dailyAmount: 6,
	dailyPrompt: "Did you drink your 6 glasses today?",
	...over,
})

const good = (over: Record<string, unknown> = {}) => ({
	title: "Hydration Hero",
	description: "Drink up.",
	theme: "Wellness",
	tagline: "  Sip happens.  ",
	coachIntro: "Water first, excuses later.",
	goals: [goal(1), goal(2), goal(3, { tiers: { bronze: 72, gold: 168 } })],
	...over,
})

const bad = (raw: unknown) => {
	const r = validateGeneratedChallenge(raw)
	if (r.ok) throw new Error("expected a rejection")
	return r.error
}

describe("validateGeneratedChallenge", () => {
	it("accepts a good challenge and tidies it", () => {
		const r = validateGeneratedChallenge(good())
		if (!r.ok) throw new Error(r.error)
		expect(r.challenge.theme).toBe("wellness")
		expect(r.challenge.tagline).toBe("Sip happens.")
		expect(r.challenge.goals[2].tiers).toEqual({ bronze: 72, gold: 168 })
		expect(r.challenge.goals[0].tiers).toBeUndefined()
	})

	it("keeps working without the optional card fields", () => {
		const r = validateGeneratedChallenge(
			good({ tagline: undefined, coachIntro: undefined }),
		)
		expect(r.ok).toBe(true)
	})

	it("rejects malformed output", () => {
		expect(bad(null)).toMatch(/object/)
		expect(bad(good({ title: "" }))).toMatch(/title/)
		expect(bad(good({ goals: [] }))).toMatch(/goals/)
		expect(bad(good({ goals: [goal(1), goal(3)] }))).toMatch(/goal_2/)
		expect(bad(good({ goals: [goal(1, { target: -5 })] }))).toMatch(/target/)
		expect(bad(good({ goals: [goal(1, { target: "120" })] }))).toMatch(/target/)
		expect(bad(good({ goals: [goal(1, { unit: "days" })] }))).toMatch(/unit/)
		expect(bad(good({ goals: [goal(1, { dailyAmount: 500 })] }))).toMatch(
			/dailyAmount/,
		)
	})

	it("needs tiers to run bronze <= target <= gold", () => {
		const tiers = (t: Record<string, number>) =>
			good({ goals: [goal(1, { tiers: t })] })
		expect(bad(tiers({ bronze: 200 }))).toMatch(/tiers/)
		expect(bad(tiers({ gold: 50 }))).toMatch(/tiers/)
		expect(validateGeneratedChallenge(tiers({ bronze: 60 })).ok).toBe(true)
	})
})
