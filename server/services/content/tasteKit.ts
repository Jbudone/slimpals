// Loads the owner's verdicts as a taste kit for the next batch: what they
// approved becomes the examples to match, what they refused (with the reasons
// they tapped) the examples to avoid. This is the loop that lets the pipeline
// get closer to their taste as they review.
import { and, desc, eq, inArray } from "drizzle-orm"
import type { Example, Kit } from "../../../shared/content/tasteKit.js"
import { contentItems, contentReviews } from "../../db/schema.js"
import type { Db } from "../gym/layout3dStore.js"

const linesOf = (payload: unknown): string[] | null => {
	const l = (payload as { lines?: unknown } | null)?.lines
	return Array.isArray(l) && l.every((x) => typeof x === "string")
		? (l as string[])
		: null
}

export async function loadKit(db: Db, type: string, limit = 8): Promise<Kit> {
	const good = await db
		.select()
		.from(contentItems)
		.where(
			and(eq(contentItems.type, type), eq(contentItems.reviewState, "good")),
		)
		.orderBy(desc(contentItems.id))
		.limit(limit)
	const bad = await db
		.select()
		.from(contentItems)
		.where(
			and(
				eq(contentItems.type, type),
				inArray(contentItems.reviewState, ["bad", "meh"]),
			),
		)
		.orderBy(desc(contentItems.id))
		.limit(limit)
	const tagsByItem = new Map<number, string[]>()
	if (bad.length) {
		const rev = await db
			.select()
			.from(contentReviews)
			.where(
				inArray(
					contentReviews.itemId,
					bad.map((b) => b.id),
				),
			)
		for (const r of rev)
			tagsByItem.set(r.itemId, [
				...(tagsByItem.get(r.itemId) ?? []),
				...((r.tags as string[]) ?? []),
			])
	}
	const toExample = (note?: string) => (r: { payload: unknown }) => {
		const lines = linesOf(r.payload)
		return lines ? [{ lines, ...(note ? { note } : {}) } as Example] : []
	}
	return {
		gold: good.flatMap(toExample()),
		anti: bad.flatMap((b) => {
			const lines = linesOf(b.payload)
			if (!lines) return []
			const tags = [...new Set(tagsByItem.get(b.id) ?? [])]
			return [{ lines, note: tags.join(", ") || undefined } as Example]
		}),
	}
}
