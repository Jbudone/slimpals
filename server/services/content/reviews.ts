// The owner's review queue (docs/content_pipeline.md, phase 2): which item to
// show next, and what a verdict does. Good keeps an item (and restores one the
// judge rejected); bad takes it out of play at once; meh keeps it with tags.
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import {
	isVerdict,
	JUDGE_THRESHOLD,
	REVIEW_TAGS,
	reviewValue,
	type Verdict,
} from "../../../shared/content/quality.js"
import { contentItems, contentReviews } from "../../db/schema.js"
import type { Db } from "../gym/layout3dStore.js"

export type ReviewCard = {
	id: number
	type: string
	situation: string
	lines: string[]
	status: string
	source: string
	model: string | null
	judgeScore: number | null
	judgeNote: string | null
}

const POOL = 300

/** The next items worth a review, best first. Items the owner already reviewed
 * are skipped; so are `skip` ids (cards skipped this session). */
export async function nextForReview(
	db: Db,
	limit: number,
	skip: number[] = [],
	rand: () => number = Math.random,
): Promise<{ cards: ReviewCard[]; waiting: number }> {
	const rows = await db
		.select()
		.from(contentItems)
		.where(
			and(
				sql`${contentItems.reviewState} IS NULL`,
				inArray(contentItems.status, ["published", "rejected"]),
			),
		)
		.orderBy(desc(contentItems.id))
		.limit(POOL)
	const ranked = rows
		.filter((r) => !skip.includes(r.id))
		.map((r) => ({
			r,
			v: reviewValue(
				{
					judgeScore: r.judgeScore,
					status: r.status,
					reviewState: r.reviewState,
					shownCount: r.shownCount,
				},
				rand,
			),
		}))
		.sort((a, b) => b.v - a.v)
	return {
		waiting: ranked.length,
		cards: ranked.slice(0, limit).map(({ r }) => ({
			id: r.id,
			type: r.type,
			situation: r.situation,
			lines: ((r.payload as { lines?: unknown })?.lines as string[]) ?? [],
			status: r.status,
			source: r.source,
			model: r.model,
			judgeScore: r.judgeScore,
			judgeNote: r.judgeNote,
		})),
	}
}

export class ReviewError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message)
	}
}

export async function submitReview(
	db: Db,
	userId: string,
	input: { itemId: unknown; verdict: unknown; tags?: unknown; note?: unknown },
): Promise<{ verdict: Verdict; status: string }> {
	const itemId = Number(input.itemId)
	if (!Number.isInteger(itemId) || itemId < 1)
		throw new ReviewError(400, "itemId must be a whole number")
	if (!isVerdict(input.verdict))
		throw new ReviewError(400, "verdict must be good, meh or bad")
	const verdict = input.verdict
	const tags = Array.isArray(input.tags)
		? (input.tags as unknown[])
				.filter((t): t is string =>
					(REVIEW_TAGS as readonly string[]).includes(t as string),
				)
				.slice(0, 8)
		: []
	const note = typeof input.note === "string" ? input.note.slice(0, 300) : null
	const [item] = await db
		.select()
		.from(contentItems)
		.where(eq(contentItems.id, itemId))
	if (!item) throw new ReviewError(404, "No such item")
	await db
		.insert(contentReviews)
		.values({ itemId, userId, verdict, tags, note })
		.onDuplicateKeyUpdate({ set: { verdict, tags, note } })
	// the owner has the last word on what plays
	let status = item.status
	if (verdict === "bad") status = "rejected"
	else if (verdict === "good" && item.status === "rejected")
		status = "published"
	await db
		.update(contentItems)
		.set({
			reviewState: verdict,
			status: status as typeof item.status,
			...(status === "published" && item.status === "rejected"
				? { publishedAt: new Date() }
				: {}),
		})
		.where(eq(contentItems.id, itemId))
	return { verdict, status }
}

export type ReviewStats = {
	total: number
	byVerdict: Record<string, number>
	today: number
	/** Reviewed items the judge also scored: how often the judge and the owner
	 * agreed that it was fit to publish (score >= threshold vs not "bad"). */
	judgeAgreement: number | null
	judgeCompared: number
	topTags: { tag: string; n: number }[]
}

export async function reviewStats(db: Db, since: Date): Promise<ReviewStats> {
	const reviews = await db.select().from(contentReviews)
	const items = reviews.length
		? await db
				.select({ id: contentItems.id, judgeScore: contentItems.judgeScore })
				.from(contentItems)
				.where(
					inArray(
						contentItems.id,
						reviews.map((r) => r.itemId),
					),
				)
		: []
	const score = new Map(items.map((i) => [i.id, i.judgeScore]))
	const byVerdict: Record<string, number> = {}
	const tagCount = new Map<string, number>()
	let compared = 0
	let agreed = 0
	let today = 0
	for (const r of reviews) {
		byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1
		if (r.createdAt >= since) today++
		for (const t of (r.tags as string[]) ?? [])
			tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
		const js = score.get(r.itemId)
		if (js != null) {
			compared++
			if (js >= JUDGE_THRESHOLD === (r.verdict !== "bad")) agreed++
		}
	}
	return {
		total: reviews.length,
		byVerdict,
		today,
		judgeAgreement: compared ? agreed / compared : null,
		judgeCompared: compared,
		topTags: [...tagCount]
			.map(([tag, n]) => ({ tag, n }))
			.sort((a, b) => b.n - a.n)
			.slice(0, 5),
	}
}
