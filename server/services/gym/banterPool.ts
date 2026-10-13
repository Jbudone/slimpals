import { canSpend, dayOf } from "../../../shared/content/budget.js"
import {
	AI_BANTER_SITUATIONS,
	cleanBanterLines,
	parseBanterBlocks,
} from "../../../shared/gym3d/banterAi.js"
import type { AIService } from "../ai/index.js"
import { getBudget } from "../content/config.js"
import {
	publishedItems,
	publishItems,
	retireBeyond,
	unseenBacklog,
} from "../content/items.js"
import { collectSpend, spentOnDay } from "../content/spend.js"
import { BANTER_SCENARIOS } from "../contentTuning/npcBanter.js"
import type { Db } from "./layout3dStore.js"

/** How many exchanges of each situation the pool keeps (the newest). */
export const POOL_PER_SITUATION = 8

/** A situation with this many published exchanges nobody has seen is not
 * topped up: generated content players do not see is wasted money. */
export const UNSEEN_BACKLOG_MAX = 4

/** What one batch call is expected to cost at most, for the budget check. */
const BATCH_ESTIMATE_USD = 0.01

export const BANTER_TYPE = "banter"

export type BanterRun = {
	added: number
	skippedBacklog: string[]
	skippedBudget: boolean
}

/** The nightly batch: asks the AI for exchanges per situation, keeps the ones
 * that follow the banter style and publishes them as content items (the oldest
 * of a situation are retired past the newest few). Skips a situation that
 * still has unseen exchanges, and stops when the day's budget is used. */
export async function generateBanterPool(
	db: Db,
	ai: AIService,
	now: Date = new Date(),
): Promise<BanterRun> {
	const run: BanterRun = { added: 0, skippedBacklog: [], skippedBudget: false }
	if (!ai.generateBanter) return run
	for (const situation of AI_BANTER_SITUATIONS) {
		try {
			if (
				(await unseenBacklog(db, BANTER_TYPE, situation)) >= UNSEEN_BACKLOG_MAX
			) {
				run.skippedBacklog.push(situation)
				continue
			}
			const verdict = canSpend(
				await getBudget(db, now),
				now,
				await spentOnDay(db, dayOf(now)),
				BATCH_ESTIMATE_USD,
			)
			if (!verdict.ok) {
				run.skippedBudget = true
				break
			}
			const {
				result: text,
				usd,
				models,
			} = await collectSpend(
				() =>
					ai.generateBanter?.(
						BANTER_SCENARIOS[situation] ?? BANTER_SCENARIOS.quiet,
					) as Promise<string>,
			)
			const good = parseBanterBlocks(text).flatMap((block) => {
				const lines = cleanBanterLines(block)
				return lines ? [lines] : []
			})
			if (good.length) {
				const each = Math.round((usd * 1_000_000) / good.length)
				await publishItems(
					db,
					good.map((lines) => ({
						type: BANTER_TYPE,
						situation,
						payload: { lines },
						model: models[0] ?? null,
						costMicros: each,
					})),
				)
				run.added += good.length
				await retireBeyond(db, BANTER_TYPE, situation, POOL_PER_SITUATION)
			}
		} catch (err) {
			console.error(`[banter] ${situation} failed, keeping the pool:`, err)
		}
	}
	return run
}

/** The pool as the client reads it: newest first. The id is the content item's. */
export async function loadBanterPool(
	db: Db,
): Promise<{ id: number; situation: string; lines: string[] }[]> {
	const rows = await publishedItems(db, BANTER_TYPE, [...AI_BANTER_SITUATIONS])
	return rows.map((r) => {
		const lines = (r.payload as { lines?: unknown } | null)?.lines
		return {
			id: r.id,
			situation: r.situation,
			lines: Array.isArray(lines) ? (lines as string[]) : [],
		}
	})
}
