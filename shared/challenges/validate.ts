// Checks a generated monthly challenge before it is stored (#124): the AI is
// asked for a fixed shape, and anything off is rejected so the month falls
// back to a curated card instead of putting a broken challenge in front of
// players. Pure so the rules are unit-tested.

import { type AutoGoalKind, isAutoKind } from "./auto.js"

export type GoalInput = {
	id: string
	title: string
	description: string
	target: number
	unit: string
	dailyAmount: number
	dailyPrompt: string
	tiers?: { bronze?: number; gold?: number }
	auto?: AutoGoalKind
}

export type ChallengeInput = {
	title: string
	description: string
	theme: string
	tagline?: string
	coachIntro?: string
	goals: GoalInput[]
}

const text = (v: unknown, max: number): v is string =>
	typeof v === "string" && v.trim().length > 0 && v.length <= max

const pos = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v) && v > 0

/** The challenge cleaned up, or a reason it cannot be used. */
export function validateGeneratedChallenge(
	raw: unknown,
): { ok: true; challenge: ChallengeInput } | { ok: false; error: string } {
	const c = raw as Partial<ChallengeInput> | null
	if (!c || typeof c !== "object") return { ok: false, error: "not an object" }
	if (!text(c.title, 80)) return { ok: false, error: "bad title" }
	if (!text(c.description, 400)) return { ok: false, error: "bad description" }
	if (!text(c.theme, 40)) return { ok: false, error: "bad theme" }
	if (!Array.isArray(c.goals) || c.goals.length < 1 || c.goals.length > 5)
		return { ok: false, error: "needs 1 to 5 goals" }

	const goals: GoalInput[] = []
	for (const [i, g] of c.goals.entries()) {
		const where = `goal ${i + 1}`
		if (!g || typeof g !== "object")
			return { ok: false, error: `${where}: not an object` }
		if (g.id !== `goal_${i + 1}`)
			return { ok: false, error: `${where}: id must be goal_${i + 1}` }
		if (!text(g.title, 80)) return { ok: false, error: `${where}: bad title` }
		if (!text(g.description, 200))
			return { ok: false, error: `${where}: bad description` }
		if (!text(g.unit, 30) || g.unit.toLowerCase() === "days")
			return { ok: false, error: `${where}: bad unit` }
		if (!text(g.dailyPrompt, 200))
			return { ok: false, error: `${where}: bad dailyPrompt` }
		if (!pos(g.target)) return { ok: false, error: `${where}: bad target` }
		if (!pos(g.dailyAmount) || g.dailyAmount > g.target)
			return { ok: false, error: `${where}: bad dailyAmount` }
		let tiers: GoalInput["tiers"]
		if (g.tiers !== undefined) {
			const { bronze, gold } = g.tiers
			if (
				(bronze !== undefined && !pos(bronze)) ||
				(gold !== undefined && !pos(gold)) ||
				(bronze !== undefined && bronze > g.target) ||
				(gold !== undefined && gold < g.target)
			)
				return {
					ok: false,
					error: `${where}: tiers must run bronze <= target <= gold`,
				}
			tiers = {
				...(bronze !== undefined ? { bronze } : {}),
				...(gold !== undefined ? { gold } : {}),
			}
		}
		if (g.auto !== undefined && !isAutoKind(g.auto))
			return { ok: false, error: `${where}: unknown auto kind` }
		goals.push({
			id: g.id,
			title: g.title.trim(),
			description: g.description.trim(),
			target: Math.round(g.target),
			unit: g.unit.trim(),
			dailyAmount: g.dailyAmount,
			dailyPrompt: g.dailyPrompt.trim(),
			...(tiers ? { tiers } : {}),
			...(g.auto ? { auto: g.auto } : {}),
		})
	}
	return {
		ok: true,
		challenge: {
			title: c.title.trim(),
			description: c.description.trim(),
			theme: c.theme.trim().toLowerCase(),
			...(text(c.tagline, 255) ? { tagline: c.tagline.trim() } : {}),
			...(typeof c.coachIntro === "string" && c.coachIntro.trim()
				? { coachIntro: c.coachIntro.trim() }
				: {}),
			goals,
		},
	}
}
