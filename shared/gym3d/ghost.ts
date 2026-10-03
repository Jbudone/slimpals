// The October gym ghost (#141): a friendly ghost drifts around the lobby and
// says dry, supportive things. Pure: when it is about and what it says.
// Positive-funny on purpose: it spooks nobody away from their workout, it
// nudges them to stay for one more set.
import type { Rng } from "./npcLines.js"

/** Whether the ghost haunts in `month` (1-12, UTC). */
export function ghostSeason(month: number): boolean {
	return month === 10
}

export const GHOST_LINES: readonly string[] = [
	"Boo. Anyway, one more set?",
	"I'm not haunting you. I'm spotting you.",
	"You were about to quit. I felt it.",
	"Spooky, but supportive.",
	"The gains here are to die for.",
	"Ghosts don't skip leg day. We don't have legs.",
	"Hydrate. I can't, and I miss it.",
	"I'm only here for the form checks.",
]

/** The ghost's activity label while it stands guard at the lockers. */
export const GHOST_LOCKERS = "guarding the lockers"

/** What it says when it is standing guard at the lockers. */
export const GHOST_LOCKER_LINES: readonly string[] = [
	"Nobody leaves without stretching. I'm guarding the lockers.",
	"Your stuff is safe. I have been here since the nineties.",
	"Locker 13 is mine. Do not ask.",
	"Leaving already? The lockers say stay.",
]

export function ghostLine(rng: Rng, atLockers = false): string {
	const pool = atLockers ? GHOST_LOCKER_LINES : GHOST_LINES
	return pool[Math.floor(rng() * pool.length) % pool.length]
}
