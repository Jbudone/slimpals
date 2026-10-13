// The content pipeline's daily budget (docs/content_pipeline.md). Pure: given
// the config and a date, what may be spent that day. All days are UTC.

export type BudgetStep = {
	/** Day number from the start date (0 is the start day) this cap begins. */
	fromDay: number
	/** Cap for each day from `fromDay` until the next step, in USD. */
	usd: number
}

export type BudgetConfig = {
	/** UTC date (YYYY-MM-DD) the budget schedule counts from. */
	startDate: string
	/** Steps in ascending `fromDay`; the first is at day 0. */
	steps: BudgetStep[]
	/** Share of the day's cap kept back for owner-requested regenerations. */
	reservePct: number
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const MS_DAY = 86_400_000

export function dayOf(d: Date): string {
	return d.toISOString().slice(0, 10)
}

/** The first week at $5 a day, then $1 a day (the owner's choice). */
export function defaultBudget(today: Date): BudgetConfig {
	return {
		startDate: dayOf(today),
		steps: [
			{ fromDay: 0, usd: 5 },
			{ fromDay: 7, usd: 1 },
		],
		reservePct: 10,
	}
}

export function validateBudget(raw: unknown): BudgetConfig | string {
	if (!raw || typeof raw !== "object") return "budget must be an object"
	const b = raw as Partial<BudgetConfig>
	if (typeof b.startDate !== "string" || !DAY_RE.test(b.startDate))
		return "startDate must be YYYY-MM-DD"
	if (Number.isNaN(Date.parse(`${b.startDate}T00:00:00Z`)))
		return "startDate is not a date"
	if (!Array.isArray(b.steps) || b.steps.length === 0 || b.steps.length > 12)
		return "steps must be 1 to 12 entries"
	let last = -1
	for (const s of b.steps) {
		if (!s || !Number.isInteger(s.fromDay) || s.fromDay < 0)
			return "each step needs a whole fromDay of 0 or more"
		if (s.fromDay <= last) return "steps must go up by fromDay"
		if (typeof s.usd !== "number" || !(s.usd >= 0) || s.usd > 1000)
			return "each step needs usd between 0 and 1000"
		last = s.fromDay
	}
	if (b.steps[0].fromDay !== 0) return "the first step must start at day 0"
	const r = b.reservePct
	if (typeof r !== "number" || !(r >= 0) || r > 50)
		return "reservePct must be between 0 and 50"
	return {
		startDate: b.startDate,
		steps: b.steps.map((s) => ({ fromDay: s.fromDay, usd: s.usd })),
		reservePct: r,
	}
}

/** Day number of `now` counted from the start date (negative before it). */
export function dayNumber(cfg: BudgetConfig, now: Date): number {
	const start = Date.parse(`${cfg.startDate}T00:00:00Z`)
	const today = Date.parse(`${dayOf(now)}T00:00:00Z`)
	return Math.round((today - start) / MS_DAY)
}

/** The cap for the UTC day `now` falls in. Before the start date: 0. */
export function dailyCapUsd(cfg: BudgetConfig, now: Date): number {
	const n = dayNumber(cfg, now)
	if (n < 0) return 0
	let cap = cfg.steps[0].usd
	for (const s of cfg.steps) if (n >= s.fromDay) cap = s.usd
	return cap
}

/** What the pipeline itself may spend today: the cap less the reserve. */
export function pipelineCapUsd(cfg: BudgetConfig, now: Date): number {
	return (dailyCapUsd(cfg, now) * (100 - cfg.reservePct)) / 100
}

export type SpendVerdict = { ok: true } | { ok: false; reason: string }

/** May a call that is estimated to cost `estimateUsd` go ahead, given what
 * was already spent today? `reserve` true lets it use the held-back share
 * (an owner-requested regeneration). */
export function canSpend(
	cfg: BudgetConfig,
	now: Date,
	spentTodayUsd: number,
	estimateUsd: number,
	reserve = false,
): SpendVerdict {
	const cap = reserve ? dailyCapUsd(cfg, now) : pipelineCapUsd(cfg, now)
	if (spentTodayUsd + estimateUsd > cap + 1e-9)
		return {
			ok: false,
			reason: `daily budget of $${cap.toFixed(2)} reached ($${spentTodayUsd.toFixed(4)} spent)`,
		}
	return { ok: true }
}
