// The coach's remark on the monthly challenge: where the player stands (the
// server's UTC day grid) and a line in the chosen coach's voice that holds
// for the whole day.
import {
	type ChallengeStanding,
	type CoachSay,
	type CoachVoice,
	challengeLineFor,
	seededRng,
} from "../../shared/gym3d/coachLines.js"

type ChallengeLike = {
	month: number
	year: number
	goals: { id: string; target: number }[]
	progress: Record<string, number>
	completedAt: string | null
}

/** Null when the challenge is not this month's. */
export function challengeStanding(
	c: ChallengeLike,
	now: Date = new Date(),
): ChallengeStanding | null {
	if (c.month !== now.getUTCMonth() + 1 || c.year !== now.getUTCFullYear())
		return null
	const days = new Date(Date.UTC(c.year, c.month, 0)).getUTCDate()
	const fractions = c.goals.map((g) =>
		g.target > 0 ? Math.min(1, (c.progress[g.id] ?? 0) / g.target) : 1,
	)
	const done = fractions.length
		? fractions.reduce((a, b) => a + b, 0) / fractions.length
		: 0
	return {
		day: now.getUTCDate(),
		days,
		done,
		complete: !!c.completedAt,
	}
}

/** Today's line about the challenge (the same all day). */
export function challengeNote(
	voice: CoachVoice,
	st: ChallengeStanding,
	now: Date = new Date(),
): CoachSay {
	return challengeLineFor(voice, st, seededRng(now.getUTCDate() + st.days * 31))
}
