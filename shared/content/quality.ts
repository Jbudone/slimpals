// Quality checks for generated content (docs/content_pipeline.md, phase 2):
// the near-duplicate gate, the judge's rubric and score, and which items are
// worth the owner's review time. Pure.

/** The judge's rubric, one to five each (the style rules are in the style
 * doc the judge is also shown). */
export const JUDGE_CRITERIA = [
	"specific",
	"dry",
	"natural",
	"in_character",
] as const

/** An item scoring under this (0-100) after the judge is not published. */
export const JUDGE_THRESHOLD = 60

/** Tags for a "meh" or "bad" review (one tap each on the phone). */
export const REVIEW_TAGS = [
	"Not funny",
	"Too generic",
	"AI-speak",
	"Off-voice",
	"Repetitive",
	"Too long",
	"Mentions the body",
	"Ignores the situation",
] as const

export type Verdict = "good" | "meh" | "bad"

export function isVerdict(v: unknown): v is Verdict {
	return v === "good" || v === "meh" || v === "bad"
}

function tokens(lines: readonly string[]): Set<string> {
	return new Set(
		lines
			.join(" ")
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 2),
	)
}

/** Word overlap of two exchanges, 0 to 1. */
export function similarity(a: readonly string[], b: readonly string[]): number {
	const x = tokens(a)
	const y = tokens(b)
	if (x.size === 0 || y.size === 0) return 0
	let both = 0
	for (const w of x) if (y.has(w)) both++
	return both / (x.size + y.size - both)
}

/** An exchange that is too close to one already in the pool. */
export function nearDuplicate(
	lines: readonly string[],
	pool: readonly (readonly string[])[],
	limit = 0.6,
): boolean {
	return pool.some((p) => similarity(lines, p) >= limit)
}

export type Judged = {
	/** 0 to 100. */
	score: number
	/** One short sentence from the judge. */
	note: string
	aiSpeak: boolean
}

/** Reads the judge's answer (JSON with the four criteria, `ai_speak` and a
 * `note`); null when it is not usable. The score is the mean of the criteria
 * out of 100, less 20 for AI-speak. */
export function parseJudge(text: string): Judged | null {
	const m = text.match(/\{[\s\S]*\}/)
	if (!m) return null
	let raw: Record<string, unknown>
	try {
		raw = JSON.parse(m[0])
	} catch {
		return null
	}
	const nums: number[] = []
	for (const k of JUDGE_CRITERIA) {
		const v = Number(raw[k])
		if (!Number.isFinite(v) || v < 1 || v > 5) return null
		nums.push(v)
	}
	const aiSpeak = raw.ai_speak === true
	const mean = nums.reduce((s, n) => s + n, 0) / nums.length
	const score = Math.max(0, Math.round((mean / 5) * 100) - (aiSpeak ? 20 : 0))
	const note = typeof raw.note === "string" ? raw.note.slice(0, 280) : ""
	return { score, note, aiSpeak }
}

export type ReviewCandidate = {
	judgeScore: number | null
	status: string
	reviewState: string | null
	shownCount: number
}

/** How much a review of this item teaches us, 0 (nothing) to 1. Unreviewed
 * only. Uncertain judge scores come first, then items the judge never saw,
 * then ones it rejected (to catch false rejections), then the sure ones (a
 * small random audit). */
export function reviewValue(c: ReviewCandidate, rand: () => number): number {
	if (c.reviewState) return 0
	// something waiting on the owner comes first, the best judged at the top
	if (c.status === "candidate")
		return 0.95 + ((c.judgeScore ?? 50) / 100) * 0.04 + rand() * 0.005
	if (c.judgeScore === null) return 0.9 + rand() * 0.05
	const near = 1 - Math.min(1, Math.abs(c.judgeScore - JUDGE_THRESHOLD) / 40)
	const base = c.status === "rejected" ? 0.45 : 0.2
	return Math.min(0.89, Math.max(base, near * 0.85) + rand() * 0.05)
}
