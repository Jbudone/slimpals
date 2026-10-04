// The Pavement Street Open (story act three): a seven day contest between the
// player's gym and MaxOut. The gym's score is the XP it earns in the window;
// MaxOut's is a target that grows with the gym's level when the contest
// starts (so it stays a contest at every level). Pure: the server keeps two
// claims (the XP at the start and at the end) and asks `openState`.

export const OPEN_DAYS = 7
const DAY = 24 * 60 * 60 * 1000

/** The chapter whose being seen starts the contest. */
export const OPEN_START_BEAT = "a3-start"

/** What MaxOut scores over the week, by the gym's level at the start (a
 * tuning guess: a steady player earns roughly 50-80 XP a day). */
export function rivalScore(level: number): number {
	return 120 + 18 * Math.max(1, level)
}

export type OpenResult = "win" | "lose"

export type OpenState = {
	phase: "idle" | "running" | "ended"
	/** The gym's XP gain in the window so far (or final). */
	you: number
	/** MaxOut's score so far (it keeps an even pace, and reaches `rivalFinal`). */
	rival: number
	rivalFinal: number
	daysLeft: number
	result: OpenResult | null
}

export type OpenStart = { at: Date; xp: number; level: number }

/** Where the contest stands. `end` is the XP recorded when it ended (the
 * first read after the week is over writes it). */
export function openState(p: {
	start: OpenStart | null
	end: { xp: number } | null
	xpNow: number
	now: Date
}): OpenState {
	const { start, end, xpNow, now } = p
	if (!start)
		return {
			phase: "idle",
			you: 0,
			rival: 0,
			rivalFinal: 0,
			daysLeft: OPEN_DAYS,
			result: null,
		}
	const rivalFinal = rivalScore(start.level)
	const over = now.getTime() >= start.at.getTime() + OPEN_DAYS * DAY
	if (over) {
		const you = Math.max(0, (end?.xp ?? xpNow) - start.xp)
		return {
			phase: "ended",
			you,
			rival: rivalFinal,
			rivalFinal,
			daysLeft: 0,
			result: you >= rivalFinal ? "win" : "lose",
		}
	}
	const elapsed = (now.getTime() - start.at.getTime()) / (OPEN_DAYS * DAY)
	return {
		phase: "running",
		you: Math.max(0, xpNow - start.xp),
		rival: Math.floor(rivalFinal * Math.max(0, elapsed)),
		rivalFinal,
		daysLeft: Math.max(
			0,
			Math.ceil((start.at.getTime() + OPEN_DAYS * DAY - now.getTime()) / DAY),
		),
		result: null,
	}
}

/** The gym_rewards sources that hold the contest's two snapshots. */
export const openStartSource = (xp: number, level: number) =>
	`story:open:start:${xp}:${level}`
export const openEndSource = (xp: number) => `story:open:end:${xp}`
export const OPEN_START_PREFIX = "story:open:start:"
export const OPEN_END_PREFIX = "story:open:end:"
