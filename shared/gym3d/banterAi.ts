// Banter written by the AI each night (#140): the same short dry exchanges as
// the scripted ones, for the same situations, so the gym does not repeat
// itself as fast. Pure: parse the AI's text, check it against the style rules
// and turn it into the `Banter` shape the picker already understands. Anything
// that does not pass is dropped, and the scripted pool always remains.
import type { Banter } from "./banter.js"

/** The situations a batch is written for (the keys the tuning page uses). */
export const AI_BANTER_SITUATIONS = [
	"no_pool",
	"crowded",
	"class_running",
	"fresh_upgrade",
	"maxout",
	"event",
	"quiet",
] as const
export type AiBanterSituation = (typeof AI_BANTER_SITUATIONS)[number]

const BODY_TALK = /weight|\bfat\b|lazy|skinny|diet|belly|calorie|scale/i

/** The AI's text as exchanges: blocks split by blank lines, each line
 * starting "A:" or "B:" (the speaker label is dropped). */
export function parseBanterBlocks(text: string): string[][] {
	return text
		.split(/\n\s*\n/)
		.map((block) =>
			block
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => /^[AB]\s*:/.test(l))
				.map((l) => l.replace(/^[AB]\s*:\s*/, "").trim()),
		)
		.filter((b) => b.length > 0)
}

/** An exchange that follows the banter style, or null: 2-3 lines of 3-80
 * characters, no exclamation marks, nothing about the body. */
export function cleanBanterLines(
	lines: readonly string[],
): [string, string] | [string, string, string] | null {
	if (lines.length < 2 || lines.length > 3) return null
	const out = lines.map((l) => l.trim().replace(/\s+/g, " "))
	for (const l of out) {
		if (l.length < 3 || l.length > 80) return null
		if (l.includes("!")) return null
		if (BODY_TALK.test(l)) return null
	}
	return out.length === 2
		? [out[0], out[1]]
		: [out[0], out[1], out[2] as string]
}

/** A stored AI exchange as a picker entry for its situation. */
export function banterFromAi(row: {
	id: number | string
	situation: string
	lines: readonly string[]
}): Banter | null {
	const lines = cleanBanterLines(row.lines)
	if (!lines) return null
	const base = { id: `ai-${row.id}`, lines }
	switch (row.situation) {
		case "no_pool":
			return { ...base, missingRoom: "pool" }
		case "crowded":
			return { ...base, crowded: true }
		case "class_running":
			return { ...base, when: "classes" }
		case "fresh_upgrade":
			return { ...base, when: "upgraded" }
		case "maxout":
			return { ...base, when: "maxout" }
		case "event":
			return { ...base, when: "event" }
		case "quiet":
			return base
		default:
			return null
	}
}
