import { and, desc, eq, inArray, notInArray } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import {
	AI_BANTER_SITUATIONS,
	cleanBanterLines,
	parseBanterBlocks,
} from "../../../shared/gym3d/banterAi.js"
import type * as schema from "../../db/schema.js"
import { banterPool } from "../../db/schema.js"
import type { AIService } from "../ai/index.js"
import { BANTER_SCENARIOS } from "../contentTuning/npcBanter.js"

type Db = MySql2Database<typeof schema>

/** How many exchanges of each situation the pool keeps (the newest). */
export const POOL_PER_SITUATION = 8

/** The nightly batch: asks the AI for exchanges per situation, keeps the ones
 * that follow the banter style and prunes the pool to the newest few. Returns
 * how many exchanges were added; 0 without an AI method or when it fails. */
export async function generateBanterPool(
	db: Db,
	ai: AIService,
): Promise<{ added: number }> {
	if (!ai.generateBanter) return { added: 0 }
	let added = 0
	for (const situation of AI_BANTER_SITUATIONS) {
		try {
			const text = await ai.generateBanter(
				BANTER_SCENARIOS[situation] ?? BANTER_SCENARIOS.quiet,
			)
			const rows = parseBanterBlocks(text).flatMap((block) => {
				const lines = cleanBanterLines(block)
				return lines ? [{ situation, lines }] : []
			})
			if (rows.length) {
				await db.insert(banterPool).values(rows)
				added += rows.length
				// keep only the newest few of this situation
				const keep = await db
					.select({ id: banterPool.id })
					.from(banterPool)
					.where(eq(banterPool.situation, situation))
					.orderBy(desc(banterPool.id))
					.limit(POOL_PER_SITUATION)
				await db.delete(banterPool).where(
					and(
						eq(banterPool.situation, situation),
						notInArray(
							banterPool.id,
							keep.map((k) => k.id),
						),
					),
				)
			}
		} catch (err) {
			console.error(`[banter] ${situation} failed, keeping the pool:`, err)
		}
	}
	return { added }
}

/** The pool as the client reads it: newest first. */
export async function loadBanterPool(
	db: Db,
): Promise<{ id: number; situation: string; lines: string[] }[]> {
	const rows = await db
		.select()
		.from(banterPool)
		.where(inArray(banterPool.situation, [...AI_BANTER_SITUATIONS]))
		.orderBy(desc(banterPool.id))
	return rows.map((r) => ({
		id: r.id,
		situation: r.situation,
		lines: Array.isArray(r.lines) ? (r.lines as string[]) : [],
	}))
}
