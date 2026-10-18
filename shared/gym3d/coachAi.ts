// Coach lines written by the AI each night (content pipeline, second lane): the
// same bold lead and short follow-up the scripted coach says, per voice and
// situation, so the bubble on the gym home repeats itself less. Pure: parse
// the AI's text and check it against the coach style rules. Anything that does
// not pass is dropped, and the scripted lines always remain.
import { COACH_VOICES, type CoachVoice } from "./coachLines.js"

/** Situations a batch is written for (no placeholders, so any line fits). */
export const COACH_AI_SITUATIONS = [
	"morning",
	"day",
	"evening",
	"done",
] as const
export type CoachAiSituation = (typeof COACH_AI_SITUATIONS)[number]

/** The item `situation` for a voice and situation: "bro:morning". */
export const coachSituationKey = (v: CoachVoice, s: CoachAiSituation) =>
	`${v}:${s}`

export function parseCoachKey(
	key: string,
): { voice: CoachVoice; situation: CoachAiSituation } | null {
	const [v, s] = key.split(":")
	if (!(COACH_VOICES as string[]).includes(v ?? "")) return null
	if (!(COACH_AI_SITUATIONS as readonly string[]).includes(s ?? "")) return null
	return { voice: v as CoachVoice, situation: s as CoachAiSituation }
}

const BODY_TALK =
	/weight|\bfat\b|lazy|skinny|diet|belly|calorie|scale|slim down|body/i

/** Lines of "lead | follow-up", one per line (bullets and numbers allowed). */
export function parseCoachPairs(text: string): [string, string][] {
	return text
		.split("\n")
		.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
		.filter((l) => l.includes("|"))
		.map((l) => {
			const [lead, ...rest] = l.split("|")
			return [(lead ?? "").trim(), rest.join("|").trim()] as [string, string]
		})
}

/** A line that follows the coach style, or null: a lead of 1-5 words, a
 * follow-up of 3-90 characters, no exclamation marks or placeholders, nothing
 * about the body. */
export function cleanCoachPair(
	lead: string,
	rest: string,
): [string, string] | null {
	const l = lead.replace(/\*+/g, "").replace(/\s+/g, " ").trim()
	const r = rest.replace(/\*+/g, "").replace(/\s+/g, " ").trim()
	const words = l.split(" ").length
	if (!l || words > 5 || l.length > 32) return null
	if (r.length < 3 || r.length > 90) return null
	for (const s of [l, r]) {
		if (s.includes("!") || /[{}]/.test(s) || BODY_TALK.test(s)) return null
	}
	return [l, r]
}
