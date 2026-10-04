// The monthly reward track (#126): one step a day, earned by showing up.
// Pure: the server decides and pays, the client shows the same numbers.
//
// A month has one step per day (28-31). You claim at most one step per UTC
// day, and only after checking in that day; missed days just mean fewer
// steps. Steps pay coins, Sweat and Greens (cosmetics come once the shared
// inventory exists); every 7th step and the last one pay a lot more.
export type TrackReward = {
	coins: number
	sweat: number
	greens: number
	/** A cosmetic key (shared/gym3d/cosmetics.ts) a big step also gives. */
	cosmetic?: string
}

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

/** Cosmetics the first big steps of a month give, by month (1-12). */
const MONTH_COSMETICS: Readonly<Record<number, readonly string[]>> = {
	1: ["jan_decor"],
	2: ["feb_decor"],
	3: ["mar_decor"],
	4: ["apr_decor"],
	5: ["may_decor"],
	6: ["jun_decor"],
	7: ["jul_decor"],
	8: ["aug_decor"],
	9: ["sep_decor"],
	10: ["halloween_lantern", "halloween_cobwebs", "halloween_hat"],
	11: ["harvest_basket", "harvest_hay", "gratitude_scarf"],
	12: ["winter_tree", "winter_lights", "winter_hat"],
}

/** YYYY-MM (UTC). */
export function monthKey(d: Date = new Date()): string {
	return d.toISOString().slice(0, 7)
}

export function daysInMonth(key: string): number {
	const [y, m] = key.split("-").map(Number)
	return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** What an admin can author for one month (#126): a theme name and, per
 * step number, a different coin / Sweat / Greens payout. Cosmetics stay on
 * the rule table. */
export type TrackOverride = {
	theme?: string
	steps?: Record<string, { coins?: number; sweat?: number; greens?: number }>
}

export const OVERRIDE_LIMITS = { coins: 5000, sweat: 50, greens: 50 } as const

/** Checks what an admin sent (`total` = days in that month); returns the
 * cleaned override or the first problem. */
export function validateTrackOverride(
	raw: unknown,
	total: number,
): { ok: true; value: TrackOverride } | { ok: false; error: string } {
	if (raw == null || typeof raw !== "object" || Array.isArray(raw))
		return { ok: false, error: "The override must be an object" }
	const r = raw as { theme?: unknown; steps?: unknown }
	const value: TrackOverride = {}
	if (r.theme !== undefined) {
		const t = typeof r.theme === "string" ? r.theme.trim() : ""
		if (!t || t.length > 40)
			return { ok: false, error: "theme must be 1 to 40 characters" }
		value.theme = t
	}
	if (r.steps !== undefined) {
		if (
			r.steps == null ||
			typeof r.steps !== "object" ||
			Array.isArray(r.steps)
		)
			return {
				ok: false,
				error: "steps must be an object keyed by step number",
			}
		const steps: NonNullable<TrackOverride["steps"]> = {}
		for (const [k, v] of Object.entries(r.steps as Record<string, unknown>)) {
			const n = Number(k)
			if (!Number.isInteger(n) || n < 1 || n > total)
				return {
					ok: false,
					error: `step ${k} is not a day of this month (1-${total})`,
				}
			if (v == null || typeof v !== "object" || Array.isArray(v))
				return { ok: false, error: `step ${k} must be an object` }
			const out: { coins?: number; sweat?: number; greens?: number } = {}
			for (const f of ["coins", "sweat", "greens"] as const) {
				const x = (v as Record<string, unknown>)[f]
				if (x === undefined) continue
				if (
					!Number.isInteger(x) ||
					(x as number) < 0 ||
					(x as number) > OVERRIDE_LIMITS[f]
				)
					return {
						ok: false,
						error: `step ${k}: ${f} must be a whole number from 0 to ${OVERRIDE_LIMITS[f]}`,
					}
				out[f] = x as number
			}
			steps[String(n)] = out
		}
		value.steps = steps
	}
	return { ok: true, value }
}

export function themeOf(key: string, override?: TrackOverride | null): string {
	return (
		override?.theme ??
		THEMES[(Number(key.split("-")[1]) - 1) % THEMES.length] ??
		THEMES[0]
	)
}

export function stepReward(
	n: number,
	total: number,
	key?: string,
): TrackReward {
	if (n % TRACK.milestoneEvery === 0 || n === total) {
		const month = key ? Number(key.split("-")[1]) : 0
		const cosmetic = MONTH_COSMETICS[month]?.[n / TRACK.milestoneEvery - 1]
		return {
			coins: TRACK.milestoneCoins,
			...TRACK.milestone,
			...(cosmetic ? { cosmetic } : {}),
		}
	}
	// the small ones alternate between Sweat and Greens
	return {
		coins: TRACK.stepCoins,
		sweat: n % 2 ? 1 : 0,
		greens: n % 2 ? 0 : 1,
	}
}

export function trackSteps(
	key: string,
	override?: TrackOverride | null,
): TrackStep[] {
	const total = daysInMonth(key)
	return Array.from({ length: total }, (_, i) => {
		const n = i + 1
		return {
			n,
			reward: { ...stepReward(n, total, key), ...override?.steps?.[String(n)] },
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
