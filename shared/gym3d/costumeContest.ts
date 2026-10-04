// The costume contest (#141): on a day when seasonal hats are about, one
// costumed member is picked as "Best costume" and wears a gold tag until they
// head home. Pure: who wins (by day and gym, so every device agrees) and what
// they say. Dry and kind: nobody loses, nothing about bodies.
import type { Rng } from "./npcLines.js"

export const CONTEST_TAG = "🏆 Best costume"

/** What the winner says when the tag goes on. */
export const CONTEST_LINES: readonly string[] = [
	"Best costume. I'm as surprised as you are.",
	"It's a hat. I stand by the hat.",
	"I'd like to thank the hat.",
	"A trophy for a hat. Fair.",
	"I'll wear it to my next set.",
]

export function contestLine(rng: Rng): string {
	return CONTEST_LINES[
		Math.floor(rng() * CONTEST_LINES.length) % CONTEST_LINES.length
	]
}

/** UTC day key, `YYYY-MM-DD`. */
export const contestDay = (d: Date): string => d.toISOString().slice(0, 10)

function hash(s: string): number {
	let h = 2166136261
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

/** The winner among the costumed members present (null for none): the same
 * set gives the same winner for the day, whatever order they are listed in. */
export function pickContestWinner(
	candidates: readonly string[],
	day: string,
	gymId: number,
): string | null {
	if (!candidates.length) return null
	const sorted = [...candidates].sort()
	return sorted[hash(`${gymId}:${day}`) % sorted.length]
}
