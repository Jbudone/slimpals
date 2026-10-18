// The blind model bake-off (docs/content_pipeline.md, phase 2b): the same
// situations written by several models, shown to the owner two at a time
// without names, "which is funnier?". Pure: choosing a pair and the standings.

export type ModelRoute = { provider: "gemini" | "openrouter"; model: string }

/** Starting candidates. Slugs are unverified; edit them on the Admin card. */
export const BAKEOFF_DEFAULT_MODELS: ModelRoute[] = [
	{ provider: "gemini", model: "gemini-2.5-flash" },
	{ provider: "gemini", model: "gemini-2.5-flash-lite" },
	{ provider: "openrouter", model: "anthropic/claude-haiku-4.5" },
	{ provider: "openrouter", model: "openai/gpt-4o-mini" },
	{ provider: "openrouter", model: "deepseek/deepseek-chat" },
]

export function modelLabel(r: ModelRoute): string {
	return `${r.provider}:${r.model}`
}

export function parseModelLabel(s: string): ModelRoute | null {
	const m = /^(gemini|openrouter):(\S{2,100})$/.exec(s.trim())
	return m ? { provider: m[1] as ModelRoute["provider"], model: m[2] } : null
}

export type Entry = { id: number; situation: string; model: string }

/** A pair of entries from different models for the same situation that the
 * voter has not compared yet, preferring pairs with the fewest votes. */
export function pickPair(
	entries: readonly Entry[],
	voted: ReadonlySet<string>,
	votesPer: ReadonlyMap<number, number>,
	rand: () => number = Math.random,
): [Entry, Entry] | null {
	const cands: { pair: [Entry, Entry]; w: number }[] = []
	for (let i = 0; i < entries.length; i++) {
		for (let j = i + 1; j < entries.length; j++) {
			const a = entries[i] as Entry
			const b = entries[j] as Entry
			if (a.situation !== b.situation || a.model === b.model) continue
			if (voted.has(pairKey(a.id, b.id))) continue
			const n = (votesPer.get(a.id) ?? 0) + (votesPer.get(b.id) ?? 0)
			cands.push({ pair: [a, b], w: n + rand() })
		}
	}
	if (!cands.length) return null
	cands.sort((x, y) => x.w - y.w)
	const [a, b] = (cands[0] as (typeof cands)[number]).pair
	// shown in random order so position never tells which model it is
	return rand() < 0.5 ? [a, b] : [b, a]
}

export function pairKey(a: number, b: number): string {
	return a < b ? `${a}-${b}` : `${b}-${a}`
}

export type Duel = { modelA: string; modelB: string; winner: string | null }

export type Standing = {
	model: string
	wins: number
	losses: number
	ties: number
	games: number
	/** Wins plus half the ties, over games; null before any game. */
	rate: number | null
}

export function standings(
	models: readonly string[],
	duels: readonly Duel[],
): Standing[] {
	const t = new Map<string, Standing>(
		models.map((m) => [
			m,
			{ model: m, wins: 0, losses: 0, ties: 0, games: 0, rate: null },
		]),
	)
	const get = (m: string): Standing => {
		let s = t.get(m)
		if (!s) {
			s = { model: m, wins: 0, losses: 0, ties: 0, games: 0, rate: null }
			t.set(m, s)
		}
		return s
	}
	for (const d of duels) {
		const a = get(d.modelA)
		const b = get(d.modelB)
		a.games++
		b.games++
		if (d.winner === null) {
			a.ties++
			b.ties++
		} else if (d.winner === d.modelA) {
			a.wins++
			b.losses++
		} else {
			b.wins++
			a.losses++
		}
	}
	for (const s of t.values())
		s.rate = s.games ? (s.wins + s.ties / 2) / s.games : null
	return [...t.values()].sort(
		(x, y) => (y.rate ?? -1) - (x.rate ?? -1) || y.games - x.games,
	)
}

/** Votes after which the standings are settled enough to choose; the voting
 * page stops offering pairs (more votes are a cost to the owner's hour). */
export const BAKEOFF_ENOUGH = 40

/** The situations a round uses (a spread, not all seven: fewer pairs to judge). */
export const BAKEOFF_SITUATIONS = [
	"no_pool",
	"crowded",
	"fresh_upgrade",
	"quiet",
] as const
