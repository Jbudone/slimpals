import { and, eq, inArray } from "drizzle-orm"
import { canSpend, dayOf } from "../../../shared/content/budget.js"
import { nearDuplicate } from "../../../shared/content/quality.js"
import {
	AI_BANTER_SITUATIONS,
	cleanBanterLines,
	parseBanterBlocks,
} from "../../../shared/gym3d/banterAi.js"
import { contentSeen } from "../../db/schema.js"
import type { AIService } from "../ai/index.js"
import { getAutoPublish, getBudget, hasRoute } from "../content/config.js"
import {
	candidateCount,
	publishedItems,
	publishItems,
	retireBeyond,
	unseenBacklog,
} from "../content/items.js"
import { judgePending } from "../content/judge.js"
import { BudgetError, type ModelClient } from "../content/modelClient.js"
import { collectSpend, spentOnDay } from "../content/spend.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import { BANTER_SCENARIOS } from "../contentTuning/npcBanter.js"
import type { Db } from "./layout3dStore.js"

/** How many exchanges of each situation the pool keeps (the newest). */
export const POOL_PER_SITUATION = 8

/** A situation with this many published exchanges nobody has seen is not
 * topped up: generated content players do not see is wasted money. */
export const UNSEEN_BACKLOG_MAX = 4

/** Candidates waiting for the owner, per type, before more are not written:
 * a long queue of unreviewed lines is a cost, not a stock. */
export const CANDIDATE_MAX = 12

/** What one batch call is expected to cost at most, for the budget check. */
const BATCH_ESTIMATE_USD = 0.01

export const BANTER_TYPE = "banter"

export type BanterRun = {
	added: number
	/** Dropped for being too close to an exchange already in the pool. */
	duplicates: number
	judged: number
	judgeRejected: number
	skippedBacklog: string[]
	skippedBudget: boolean
	/** The review queue was full, so nothing was written. */
	skippedReviewQueue?: boolean
}

/** The nightly batch: asks the AI for exchanges per situation, keeps the ones
 * that follow the banter style and publishes them as content items (the oldest
 * of a situation are retired past the newest few). Skips a situation that
 * still has unseen exchanges, and stops when the day's budget is used. */
export async function generateBanterPool(
	db: Db,
	ai: AIService,
	now: Date = new Date(),
	judge?: ModelClient,
): Promise<BanterRun> {
	// once the owner picks a model for "banter" (the bake-off), it writes the
	// batch through the budgeted client; until then the app's own AI does
	const viaClient = judge && (await hasRoute(db, "banter")) ? judge : null
	const run: BanterRun = {
		added: 0,
		duplicates: 0,
		judged: 0,
		judgeRejected: 0,
		skippedBacklog: [],
		skippedBudget: false,
	}
	if (!ai.generateBanter && !viaClient) return run
	const auto = (await getAutoPublish(db))[BANTER_TYPE] === true
	if (!auto && (await candidateCount(db, BANTER_TYPE)) >= CANDIDATE_MAX) {
		run.skippedReviewQueue = true
		return run
	}
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
			const scenario = BANTER_SCENARIOS[situation] ?? BANTER_SCENARIOS.quiet
			const {
				result: text,
				usd,
				models,
			} = await collectSpend(async () => {
				if (!viaClient)
					return (await ai.generateBanter?.(scenario as string)) as string
				const res = await viaClient.generateText({
					task: "banter",
					system: readTuningDoc(
						"server/services/contentTuning/docs/npc_banter.md",
					),
					prompt: `Situation: ${scenario}\n\nWrite the three exchanges now.`,
					maxOutputTokens: 600,
				})
				return res.text
			})
			const existing = (
				await publishedItems(db, BANTER_TYPE, [...AI_BANTER_SITUATIONS])
			).map((r) => (r.payload as { lines?: string[] }).lines ?? [])
			const good: string[][] = []
			for (const block of parseBanterBlocks(text)) {
				const lines = cleanBanterLines(block)
				if (!lines) continue
				if (nearDuplicate(lines, [...existing, ...good])) {
					run.duplicates++
					continue
				}
				good.push(lines)
			}
			if (good.length) {
				const each = Math.round((usd * 1_000_000) / good.length)
				await publishItems(
					db,
					good.map((lines) => ({
						type: BANTER_TYPE,
						situation,
						status: auto ? "published" : "candidate",
						payload: { lines },
						model: models[0] ?? null,
						costMicros: each,
					})),
				)
				run.added += good.length
				await retireBeyond(db, BANTER_TYPE, situation, POOL_PER_SITUATION)
			}
		} catch (err) {
			if (err instanceof BudgetError) {
				run.skippedBudget = true
				break
			}
			console.error(`[banter] ${situation} failed, keeping the pool:`, err)
		}
	}
	if (judge) {
		try {
			const j = await judgePending(db, judge, BANTER_TYPE)
			run.judged = j.judged
			run.judgeRejected = j.rejected
		} catch (err) {
			console.error("[banter] judging failed, items stay unjudged:", err)
		}
	}
	return run
}

/** The pool as the client reads it: newest first. The id is the content item's. */
export async function loadBanterPool(
	db: Db,
	userId?: string,
): Promise<
	{ id: number; situation: string; lines: string[]; seen?: boolean }[]
> {
	const rows = await publishedItems(db, BANTER_TYPE, [...AI_BANTER_SITUATIONS])
	// exposure-first: tell the client which ones this player has not seen
	const seen = new Set<number>()
	if (userId && rows.length) {
		const s = await db
			.select({ id: contentSeen.itemId })
			.from(contentSeen)
			.where(
				and(
					eq(contentSeen.userId, userId),
					inArray(
						contentSeen.itemId,
						rows.map((r) => r.id),
					),
				),
			)
		for (const x of s) seen.add(x.id)
	}
	return rows.map((r) => {
		const lines = (r.payload as { lines?: unknown } | null)?.lines
		return {
			id: r.id,
			situation: r.situation,
			lines: Array.isArray(lines) ? (lines as string[]) : [],
			...(userId ? { seen: seen.has(r.id) } : {}),
		}
	})
}
