// The monthly reward track (#126): one step a day, earned by showing up.
// Pure: the server decides and pays, the client shows the same numbers.
//
// A month has one step per day (28-31). You claim at most one step per UTC
// day, and only after checking in that day; missed days just mean fewer
// steps. Steps pay coins, Sweat and Greens (cosmetics come once the shared
// inventory exists); every 7th step and the last one pay a lot more.
export type TrackReward = { coins: number; sweat: number; greens: number }

export type TrackStep = {
	/** 1-based step number. */
	n: number
	reward: TrackReward
	/** A big step (7, 14, 21 and the last). */
	milestone: boolean
}

export const TRACK = {
	/** Coins of an ordinary step. */
	stepCoins: 60,
	milestoneCoins: 300,
	milestone: { sweat: 3, greens: 3 },
	/** Milestone steps come every this many days. */
	milestoneEvery: 7,
} as const

const THEMES = [
	"New Year Reset",
	"Heart Health",
	"Spring Training",
	"Fresh Start",
	"Outdoor Month",
	"Summer Shred",
	"Pool Party",
	"Back to Basics",
	"Harvest",
	"Halloween",
	"Gratitude",
	"Winter Warm-up",
] as const

/** YYYY-MM (UTC). */
export function monthKey(d: Date = new Date()): string {
	return d.toISOString().slice(0, 7)
}

export function daysInMonth(key: string): number {
	const [y, m] = key.split("-").map(Number)
	return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function themeOf(key: string): string {
	return THEMES[(Number(key.split("-")[1]) - 1) % THEMES.length] ?? THEMES[0]
}

export function stepReward(n: number, total: number): TrackReward {
	if (n % TRACK.milestoneEvery === 0 || n === total)
		return { coins: TRACK.milestoneCoins, ...TRACK.milestone }
	// the small ones alternate between Sweat and Greens
	return {
		coins: TRACK.stepCoins,
		sweat: n % 2 ? 1 : 0,
		greens: n % 2 ? 0 : 1,
	}
}

export function trackSteps(key: string): TrackStep[] {
	const total = daysInMonth(key)
	return Array.from({ length: total }, (_, i) => {
		const n = i + 1
		return {
			n,
			reward: stepReward(n, total),
			milestone: n % TRACK.milestoneEvery === 0 || n === total,
		}
	})
}

export type TrackState = {
	/** Steps claimed so far this month. */
	claimed: number
	/** A step was already claimed today. */
	claimedToday: boolean
	/** The player checked in today. */
	checkedIn: boolean
	total: number
}

/** Why no step can be claimed now, or null when one can. */
export function claimBlock(s: TrackState): string | null {
	if (s.claimedToday) return "You already took today's step. Back tomorrow."
	if (s.claimed >= s.total) return "Every step of this month's track is done."
	if (!s.checkedIn) return "Check in today to take a step."
	return null
}
