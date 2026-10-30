// Pacing as a measurement (docs/pacing.md): a Markov chain of how a player's
// days go (full, light, off), the real XP the app pays for those days, and the
// milestones that XP unlocks (levels, story chapters, gear, classes). Run many
// simulated players and the numbers say when each thing arrives, where the
// droughts are, and what a retuned curve would do, instead of guessing at
// thresholds. Pure and seeded: the same inputs always give the same report.

export type DayState = "full" | "light" | "off"
const STATES: DayState[] = ["full", "light", "off"]

/** Row i is today's state, column j tomorrow's: full, light, off. */
export type Transition = readonly [
	readonly [number, number, number],
	readonly [number, number, number],
	readonly [number, number, number],
]

export type Archetype = {
	name: string
	label: string
	transition: Transition
	/** Chance a full day also logs each of three meals. */
	mealP: number
	/** Daily missions done on a full day (mean). */
	missions: number
	/** This month's challenge is finished (200 XP). */
	challengeP: number
	/** A weekly mission or sprint is finished in a week with 4+ full days. */
	weeklyP: number
}

/** XP the app pays today (checkins.ts, food.ts, missions via MISSION_XP). */
export const XP_RULES = {
	checkin: 15,
	meal: 5,
	dailyMission: { easy: 5, medium: 10, hard: 20 },
	/** Share of daily missions by difficulty. */
	missionMix: { easy: 0.5, medium: 0.35, hard: 0.15 },
	weeklyMission: 40,
	sprint: 50,
	challenge: 200,
	/** Badges add 10 XP; a rough average per full day. */
	badgePerFullDay: 0.5,
} as const

export const ARCHETYPES: readonly Archetype[] = [
	{
		name: "committed",
		label: "Committed (most days, ~6 of 7)",
		transition: [
			[0.85, 0.1, 0.05],
			[0.5, 0.4, 0.1],
			[0.3, 0.2, 0.5],
		],
		mealP: 0.75,
		missions: 3,
		challengeP: 0.6,
		weeklyP: 0.7,
	},
	{
		name: "steady",
		label: "Steady (about 5 of 7)",
		transition: [
			[0.65, 0.2, 0.15],
			[0.45, 0.3, 0.25],
			[0.3, 0.2, 0.5],
		],
		mealP: 0.6,
		missions: 2.2,
		challengeP: 0.4,
		weeklyP: 0.5,
	},
	{
		name: "casual",
		label: "Casual (about 3 of 7)",
		transition: [
			[0.35, 0.2, 0.45],
			[0.25, 0.25, 0.5],
			[0.15, 0.1, 0.75],
		],
		mealP: 0.4,
		missions: 1.2,
		challengeP: 0.15,
		weeklyP: 0.25,
	},
]

export function rng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function next(state: number, t: Transition, r: number): number {
	const row = t[state] as readonly number[]
	let acc = 0
	for (let j = 0; j < 3; j++) {
		acc += row[j] as number
		if (r < acc) return j
	}
	return 2
}

/** A mission's XP from one draw. */
function missionXp(r: number): number {
	const m = XP_RULES.missionMix
	const d = XP_RULES.dailyMission
	return r < m.easy ? d.easy : r < m.easy + m.medium ? d.medium : d.hard
}

export type Run = {
	/** Cumulative XP at the end of each day (index 0 is day 1). */
	cum: Float64Array
	/** The state of each day: 0 full, 1 light, 2 off. */
	state: Uint8Array
}

/** One simulated player over `days` days. */
export function simulatePlayer(
	a: Archetype,
	days: number,
	rand: () => number,
): Run {
	const cum = new Float64Array(days)
	const state = new Uint8Array(days)
	let s = 0
	let xp = 0
	let fullThisWeek = 0
	let totalDay = 0
	for (let d = 0; d < days; d++) {
		let gain = 0
		if (s === 0) {
			gain += XP_RULES.checkin
			for (let k = 0; k < 3; k++) if (rand() < a.mealP) gain += XP_RULES.meal
			// missions: a mean with some spread (rounded draws around it)
			const n = Math.max(
				0,
				Math.round(a.missions + (rand() - 0.5) * 2 * Math.sqrt(a.missions)),
			)
			for (let k = 0; k < n; k++) gain += missionXp(rand())
			gain += XP_RULES.badgePerFullDay * 10
			fullThisWeek++
		} else if (s === 1) {
			gain += XP_RULES.checkin
			if (rand() < a.mealP / 2) gain += XP_RULES.meal
		}
		totalDay++
		if (totalDay % 7 === 0) {
			if (fullThisWeek >= 4 && rand() < a.weeklyP)
				gain += XP_RULES.weeklyMission + XP_RULES.sprint
			fullThisWeek = 0
		}
		if (totalDay % 30 === 0 && rand() < a.challengeP) gain += XP_RULES.challenge
		xp += gain
		cum[d] = xp
		state[d] = s
		s = next(s, a.transition, rand())
	}
	return { cum, state }
}

export function simulate(
	a: Archetype,
	opts: { players?: number; days?: number; seed?: number } = {},
): Run[] {
	const players = opts.players ?? 400
	const days = opts.days ?? 400
	const rand = rng((opts.seed ?? 1) + a.name.length * 977)
	return Array.from({ length: players }, () => simulatePlayer(a, days, rand))
}

// ── the game's rules, as thresholds ────────────────────────────────────────

/** Gym level at `xp` (services/gym computeLevel). */
export const levelOfXp = (xp: number): number => Math.floor(Math.sqrt(xp / 50))
/** XP at which `level` begins. */
export const xpOfLevel = (level: number): number => level * level * 50

export type Milestone = {
	id: string
	kind: "level" | "story" | "gear" | "class"
	xp: number
	label: string
}

export function buildMilestones(input: {
	maxLevel: number
	storyLevels: { id: string; level: number }[]
	gear: { key: string; requiredXp: number }[]
	classes: { key: string; requiredXp: number }[]
}): Milestone[] {
	const out: Milestone[] = []
	for (let l = 1; l <= input.maxLevel; l++)
		out.push({
			id: `level:${l}`,
			kind: "level",
			xp: xpOfLevel(l),
			label: `Level ${l}`,
		})
	for (const s of input.storyLevels)
		out.push({
			id: `story:${s.id}`,
			kind: "story",
			xp: xpOfLevel(s.level),
			label: `Story ${s.id}`,
		})
	for (const g of input.gear)
		if (g.requiredXp > 0)
			out.push({
				id: `gear:${g.key}`,
				kind: "gear",
				xp: g.requiredXp,
				label: g.key,
			})
	for (const c of input.classes)
		out.push({
			id: `class:${c.key}`,
			kind: "class",
			xp: c.requiredXp,
			label: c.key,
		})
	return out.sort((a, b) => a.xp - b.xp)
}

/** First day (1-based) each run reaches `xp`, or Infinity if it never does. */
export function daysToReach(runs: Run[], xp: number): number[] {
	return runs.map((r) => {
		let lo = 0
		let hi = r.cum.length
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			if ((r.cum[mid] as number) >= xp) hi = mid
			else lo = mid + 1
		}
		return lo >= r.cum.length ? Number.POSITIVE_INFINITY : lo + 1
	})
}

export function percentile(sorted: number[], p: number): number {
	if (!sorted.length) return Number.NaN
	const i = Math.min(
		sorted.length - 1,
		Math.max(0, Math.round(p * (sorted.length - 1))),
	)
	return sorted[i] as number
}

export type Arrival = { p10: number; p50: number; p90: number }

export function arrival(runs: Run[], xp: number): Arrival {
	const d = daysToReach(runs, xp).sort((a, b) => a - b)
	return {
		p10: percentile(d, 0.1),
		p50: percentile(d, 0.5),
		p90: percentile(d, 0.9),
	}
}

/** Median cumulative XP on each day. */
export function medianCurve(runs: Run[]): Float64Array {
	const days = runs[0]?.cum.length ?? 0
	const out = new Float64Array(days)
	const col: number[] = new Array(runs.length)
	for (let d = 0; d < days; d++) {
		for (let i = 0; i < runs.length; i++)
			col[i] = (runs[i] as Run).cum[d] as number
		col.sort((a, b) => a - b)
		out[d] = percentile(col, 0.5)
	}
	return out
}

// ── droughts ───────────────────────────────────────────────────────────────

export type Drought = {
	/** Longest stretch with no fun point, within the window, median player. */
	longest: number
	/** Share of weeks in the window with at least one fun point. */
	weeksWithEvent: number
}

/** Days (1-based) on which a run crosses at least one milestone. */
export function eventDays(run: Run, milestones: Milestone[]): number[] {
	const days = new Set<number>()
	for (const m of milestones) {
		if (m.xp <= 0) continue
		let lo = 0
		let hi = run.cum.length
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			if ((run.cum[mid] as number) >= m.xp) hi = mid
			else lo = mid + 1
		}
		if (lo < run.cum.length) days.add(lo + 1)
	}
	return [...days].sort((a, b) => a - b)
}

export function droughtIn(events: number[], from: number, to: number): Drought {
	const inside = events.filter((d) => d >= from && d <= to)
	let longest = 0
	let prev = from - 1
	for (const d of inside) {
		longest = Math.max(longest, d - prev - 1)
		prev = d
	}
	longest = Math.max(longest, to - prev)
	const weeks = Math.max(1, Math.floor((to - from + 1) / 7))
	let hit = 0
	for (let w = 0; w < weeks; w++) {
		const a = from + w * 7
		if (inside.some((d) => d >= a && d < a + 7)) hit++
	}
	return { longest, weeksWithEvent: hit / weeks }
}

/** The drought figures for the median player of a population. */
export function medianDrought(
	runs: Run[],
	milestones: Milestone[],
	from: number,
	to: number,
): Drought {
	const ds = runs.map((r) => droughtIn(eventDays(r, milestones), from, to))
	const longest = ds.map((d) => d.longest).sort((a, b) => a - b)
	const weeks = ds.map((d) => d.weeksWithEvent).sort((a, b) => a - b)
	return {
		longest: percentile(longest, 0.5),
		weeksWithEvent: percentile(weeks, 0.5),
	}
}

// ── designing the curve instead of guessing it ─────────────────────────────

/** The gap, in days, a good ladder keeps between fun points at a given day. */
export type Cadence = { fromDay: number; everyDays: number }

export const DEFAULT_CADENCE: readonly Cadence[] = [
	{ fromDay: 1, everyDays: 2 },
	{ fromDay: 15, everyDays: 4 },
	{ fromDay: 61, everyDays: 7 },
	{ fromDay: 181, everyDays: 10 },
]

/** Target days for a ladder of fun points under a cadence. */
export function ladderDays(
	horizon: number,
	cadence: readonly Cadence[] = DEFAULT_CADENCE,
): number[] {
	const out: number[] = []
	let day = 1
	while (day <= horizon) {
		out.push(day)
		let every = cadence[0]?.everyDays ?? 7
		for (const c of cadence) if (day >= c.fromDay) every = c.everyDays
		day += every
	}
	return out
}

/** The XP a median player has on `day` (from the curve; days start at 1). */
export function xpAtDay(curve: Float64Array, day: number): number {
	return curve[Math.min(curve.length, Math.max(1, day)) - 1] ?? 0
}

/** Fit xp = a * level^p through (level, xp) points by least squares on logs. */
export function fitPower(points: { level: number; xp: number }[]): {
	a: number
	p: number
} {
	const pts = points.filter((q) => q.level > 0 && q.xp > 0)
	const n = pts.length
	if (n < 2) return { a: pts[0]?.xp ?? 50, p: 2 }
	let sx = 0
	let sy = 0
	let sxx = 0
	let sxy = 0
	for (const q of pts) {
		const x = Math.log(q.level)
		const y = Math.log(q.xp)
		sx += x
		sy += y
		sxx += x * x
		sxy += x * y
	}
	const p = (n * sxy - sx * sy) / (n * sxx - sx * sx)
	const a = Math.exp((sy - p * sx) / n)
	return { a, p }
}

/** Fit the level curve so the Nth fun point lands on its target day, for the
 * median player, using the ladder as the level schedule (one level per fun point). */
export function proposeLevelCurve(
	curve: Float64Array,
	horizon: number,
	cadence: readonly Cadence[] = DEFAULT_CADENCE,
): {
	a: number
	p: number
	levels: { level: number; day: number; xp: number }[]
} {
	const days = ladderDays(horizon, cadence)
	const levels = days.map((day, i) => ({
		level: i + 1,
		day,
		xp: xpAtDay(curve, day),
	}))
	const { a, p } = fitPower(levels.map((l) => ({ level: l.level, xp: l.xp })))
	return { a, p, levels }
}
