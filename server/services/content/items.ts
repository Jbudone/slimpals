// The item record (docs/content_pipeline.md, phase 1): every published piece
// of generated content, where it came from, and who has seen it. Banter is the
// first type. Seen counts feed the exposure rate that the budget protects.
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { contentItems, contentSeen } from "../../db/schema.js"
import type { Db } from "../gym/layout3dStore.js"

export type NewItem = {
	type: string
	situation: string
	payload: unknown
	source?: "ai" | "scripted"
	/** `candidate` waits for the owner's good before it plays. */
	status?: "candidate" | "published"
	model?: string | null
	costMicros?: number
}

/** Published at once (the automatic tier) unless the item is a `candidate`
 * that waits for the owner's review; returns the new ids. */
export async function publishItems(
	db: Db,
	items: NewItem[],
): Promise<number[]> {
	if (items.length === 0) return []
	const now = new Date()
	const ids: number[] = []
	for (const i of items) {
		const [res] = await db.insert(contentItems).values({
			type: i.type,
			situation: i.situation,
			payload: i.payload,
			status: i.status ?? "published",
			source: i.source ?? "ai",
			model: i.model ?? null,
			costMicros: i.costMicros ?? 0,
			publishedAt: (i.status ?? "published") === "published" ? now : null,
		})
		ids.push(Number((res as { insertId: number }).insertId))
	}
	return ids
}

export async function publishedItems(
	db: Db,
	type: string,
	situations: string[],
) {
	return db
		.select()
		.from(contentItems)
		.where(
			and(
				eq(contentItems.type, type),
				eq(contentItems.status, "published"),
				inArray(contentItems.situation, situations),
			),
		)
		.orderBy(desc(contentItems.id))
}

/** Retires the oldest published items of a situation beyond the newest `keep`. */
export async function retireBeyond(
	db: Db,
	type: string,
	situation: string,
	keep: number,
): Promise<number> {
	const newest = await db
		.select({ id: contentItems.id })
		.from(contentItems)
		.where(
			and(
				eq(contentItems.type, type),
				eq(contentItems.situation, situation),
				eq(contentItems.status, "published"),
			),
		)
		.orderBy(desc(contentItems.id))
		.limit(keep)
	if (newest.length < keep) return 0
	const lowest = newest[newest.length - 1].id
	const [res] = await db
		.update(contentItems)
		.set({ status: "retired" })
		.where(
			and(
				eq(contentItems.type, type),
				eq(contentItems.situation, situation),
				eq(contentItems.status, "published"),
				sql`${contentItems.id} < ${lowest}`,
			),
		)
	return Number((res as { affectedRows?: number }).affectedRows ?? 0)
}

/** Published items of a situation nobody has seen yet: the backlog that says
 * whether more is worth generating. */
export async function unseenBacklog(
	db: Db,
	type: string,
	situation: string,
): Promise<number> {
	const [row] = await db
		.select({ n: sql<string>`COUNT(*)` })
		.from(contentItems)
		.where(
			and(
				eq(contentItems.type, type),
				eq(contentItems.situation, situation),
				eq(contentItems.status, "published"),
				eq(contentItems.shownCount, 0),
			),
		)
	return Number(row?.n ?? 0)
}

/** A player saw these items (at most 30 ids per call; unknown ids ignored). */
export async function recordSeen(
	db: Db,
	userId: string,
	type: string,
	rawIds: number[],
	now: Date = new Date(),
): Promise<number> {
	const wanted = [
		...new Set(rawIds.filter((n) => Number.isInteger(n) && n > 0)),
	].slice(0, 30)
	if (wanted.length === 0) return 0
	const known = await db
		.select({ id: contentItems.id })
		.from(contentItems)
		.where(and(eq(contentItems.type, type), inArray(contentItems.id, wanted)))
	// the same id twice in a call counts twice, up to what was sent
	const counts = new Map<number, number>()
	for (const id of rawIds.slice(0, 30))
		counts.set(id, (counts.get(id) ?? 0) + 1)
	for (const { id } of known) {
		const n = counts.get(id) ?? 1
		await db
			.insert(contentSeen)
			.values({ itemId: id, userId, count: n, lastSeenAt: now })
			.onDuplicateKeyUpdate({
				set: {
					count: sql`${contentSeen.count} + ${n}`,
					lastSeenAt: now,
				},
			})
		await db
			.update(contentItems)
			.set({
				shownCount: sql`${contentItems.shownCount} + ${n}`,
				firstSeenAt: sql`COALESCE(${contentItems.firstSeenAt}, ${now})`,
				lastSeenAt: now,
			})
			.where(eq(contentItems.id, id))
	}
	return known.length
}

export type ContentStats = {
	byStatus: Record<string, number>
	published: number
	/** Published at least 14 days ago: the group the 85% target is judged on. */
	matured: number
	maturedSeen: number
	/** maturedSeen / matured (null when nothing has matured yet). */
	exposureRate: number | null
	/** Published items nobody has seen, any age. */
	unseen: number
	/** What the items cost, and the share that went on items players saw. */
	costUsd: number
	seenCostUsd: number
	byType: { type: string; published: number; seen: number }[]
}

export const MATURE_DAYS = 14

export async function contentStats(db: Db, now: Date): Promise<ContentStats> {
	const rows = await db.select().from(contentItems)
	const cutoff = new Date(now.getTime() - MATURE_DAYS * 86_400_000)
	const byStatus: Record<string, number> = {}
	const types = new Map<string, { published: number; seen: number }>()
	let matured = 0
	let maturedSeen = 0
	let unseen = 0
	let costMicros = 0
	let seenCostMicros = 0
	for (const r of rows) {
		byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
		costMicros += r.costMicros
		if (r.shownCount > 0) seenCostMicros += r.costMicros
		if (r.status !== "published" && r.status !== "retired") continue
		const t = types.get(r.type) ?? { published: 0, seen: 0 }
		t.published++
		if (r.shownCount > 0) t.seen++
		types.set(r.type, t)
		if (r.status === "published" && r.shownCount === 0) unseen++
		if (r.publishedAt && r.publishedAt <= cutoff) {
			matured++
			if (r.shownCount > 0) maturedSeen++
		}
	}
	return {
		byStatus,
		published: byStatus.published ?? 0,
		matured,
		maturedSeen,
		exposureRate: matured ? maturedSeen / matured : null,
		unseen,
		costUsd: costMicros / 1_000_000,
		seenCostUsd: seenCostMicros / 1_000_000,
		byType: [...types].map(([type, v]) => ({ type, ...v })),
	}
}

/** Items made since `since`, newest first (the report shows their text). */
export async function recentItems(db: Db, since: Date, limit: number) {
	return db
		.select()
		.from(contentItems)
		.where(gte(contentItems.createdAt, since))
		.orderBy(desc(contentItems.id))
		.limit(limit)
}

/** Published items nobody has seen, counted per type and situation. */
export async function unseenBySituation(
	db: Db,
): Promise<{ type: string; situation: string; n: number }[]> {
	const rows = await db
		.select({
			type: contentItems.type,
			situation: contentItems.situation,
			n: sql<string>`COUNT(*)`,
		})
		.from(contentItems)
		.where(
			and(eq(contentItems.status, "published"), eq(contentItems.shownCount, 0)),
		)
		.groupBy(contentItems.type, contentItems.situation)
	return rows.map((r) => ({ ...r, n: Number(r.n) }))
}

/** The items played most, for spotting a line that repeats too much. */
export async function mostPlayed(db: Db, limit: number) {
	return db
		.select()
		.from(contentItems)
		.where(
			and(
				eq(contentItems.status, "published"),
				sql`${contentItems.shownCount} > 0`,
			),
		)
		.orderBy(desc(contentItems.shownCount))
		.limit(limit)
}

/** How many players saw content since `since`, and how many different items. */
export async function activitySince(
	db: Db,
	since: Date,
): Promise<{ players: number; items: number }> {
	const [row] = await db
		.select({
			players: sql<string>`COUNT(DISTINCT ${contentSeen.userId})`,
			items: sql<string>`COUNT(DISTINCT ${contentSeen.itemId})`,
		})
		.from(contentSeen)
		.where(gte(contentSeen.lastSeenAt, since))
	return { players: Number(row?.players ?? 0), items: Number(row?.items ?? 0) }
}

/** Candidates of a type waiting for the owner's review. */
export async function candidateCount(db: Db, type: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<string>`COUNT(*)` })
		.from(contentItems)
		.where(
			and(eq(contentItems.type, type), eq(contentItems.status, "candidate")),
		)
	return Number(row?.n ?? 0)
}

/** Takes every AI item of these types that is playing and that the owner has
 * not reviewed out of play (retired, so it can be put back). Returns how many. */
export async function pullUnreviewed(db: Db, types: string[]): Promise<number> {
	const [res] = await db
		.update(contentItems)
		.set({ status: "retired" })
		.where(
			and(
				inArray(contentItems.type, types),
				eq(contentItems.status, "published"),
				eq(contentItems.source, "ai"),
				sql`${contentItems.reviewState} IS NULL`,
			),
		)
	return Number((res as { affectedRows?: number }).affectedRows ?? 0)
}
