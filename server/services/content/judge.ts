// The model judge (docs/content_pipeline.md, phase 2): reads a new banter
// exchange against the style doc and scores it. A low score keeps the item
// from being published; the owner's review catches the judge's mistakes.
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import {
	JUDGE_THRESHOLD,
	type Judged,
	parseJudge,
} from "../../../shared/content/quality.js"
import { judgeAnchors, type Kit } from "../../../shared/content/tasteKit.js"
import { contentItems } from "../../db/schema.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import type { Db } from "../gym/layout3dStore.js"
import { BudgetError, type ModelClient } from "./modelClient.js"
import { loadKit } from "./tasteKit.js"

const SYSTEM = `You are a strict editor for a fitness game's ambient banter: two nearby gym-goers swap a short, dry exchange. Judge ONE exchange against the style rules. Score each of these from 1 (poor) to 5 (excellent): "specific" (a concrete detail, not a generic remark), "dry" (understated, deadpan, no jokes shouted), "natural" (people would really say it, no stiff phrasing), "in_character" (fits two ordinary gym members). Set "ai_speak" true if it sounds like an AI wrote it (a tidy moral, "as a fitness enthusiast", over-explaining the joke, lists). Reply with ONLY a JSON object: {"specific":n,"dry":n,"natural":n,"in_character":n,"ai_speak":bool,"note":"one short sentence"}.`

const COACH_SYSTEM = `You are a strict editor for a fitness game's coach bubble: a short bold lead and one short follow-up the coach says to the player, in a chosen voice (friendly, drill sergeant, roaster, anime sensei, bro). Judge ONE line against the style rules. Score each of these from 1 (poor) to 5 (excellent): "specific" (a concrete detail of the moment, not a generic slogan), "dry" (restrained wit, no shouting), "natural" (a person would really say it), "in_character" (matches the named voice and stays on the player's side). Set "ai_speak" true if it sounds like an AI wrote it (a tidy moral, over-explaining, stock motivational filler). Reply with ONLY a JSON object: {"specific":n,"dry":n,"natural":n,"in_character":n,"ai_speak":bool,"note":"one short sentence"}.`

/** The rubric and style doc each content type is judged against. */
const SPECS: Record<string, { system: string; doc: string }> = {
	banter: {
		system: SYSTEM,
		doc: "server/services/contentTuning/docs/npc_banter.md",
	},
	coach: {
		system: COACH_SYSTEM,
		doc: "server/services/contentTuning/docs/coach_lines.md",
	},
}

export function judgePrompt(
	styleDoc: string,
	situation: string,
	lines: readonly string[],
	kit?: Kit,
): string {
	return [
		"Style rules:",
		styleDoc.trim(),
		"",
		...(kit ? [judgeAnchors(kit), ""] : []),
		`Situation: ${situation}`,
		"Exchange:",
		...lines.map((l, i) => `${i % 2 ? "B" : "A"}: ${l}`),
	].join("\n")
}

export type JudgeResult = Judged & { model: string; usd: number }

/** Judges one exchange; null when the judge's answer is unusable. Throws
 * `BudgetError` when the day's budget is used. */
export async function judgeExchange(
	client: ModelClient,
	situation: string,
	lines: readonly string[],
	type = "banter",
	kit?: Kit,
): Promise<JudgeResult | null> {
	const spec = SPECS[type] ?? (SPECS.banter as { system: string; doc: string })
	let styleDoc = ""
	try {
		styleDoc = readTuningDoc(spec.doc)
	} catch {
		// the judge still has the rubric in its instructions
	}
	const out = await client.generateText({
		task: "judge",
		system: spec.system,
		prompt: judgePrompt(styleDoc, situation, lines, kit),
		maxOutputTokens: 200,
	})
	const j = parseJudge(out.text)
	return j ? { ...j, model: out.model, usd: out.usd } : null
}

/** Judges items that have no score yet; a score under the threshold rejects
 * the item (out of the pool, still shown in the review queue). Returns how
 * many were judged and rejected. Stops quietly at the budget. */
export async function judgePending(
	db: Db,
	client: ModelClient,
	type: string,
	limit = 30,
): Promise<{ judged: number; rejected: number; stoppedByBudget: boolean }> {
	const rows = await db
		.select()
		.from(contentItems)
		.where(
			and(
				eq(contentItems.type, type),
				inArray(contentItems.status, ["published", "candidate"]),
				isNull(contentItems.judgeScore),
			),
		)
		.limit(limit)
	const kit = await loadKit(db, type)
	let judged = 0
	let rejected = 0
	for (const r of rows) {
		const lines = (r.payload as { lines?: string[] } | null)?.lines
		if (!Array.isArray(lines)) continue
		try {
			const j = await judgeExchange(client, r.situation, lines, type, kit)
			if (!j) continue
			const reject = j.score < JUDGE_THRESHOLD
			await db
				.update(contentItems)
				.set({
					judgeScore: j.score,
					judgeModel: j.model,
					judgeNote: j.note,
					costMicros: sql`${contentItems.costMicros} + ${Math.round(j.usd * 1_000_000)}`,
					...(reject ? { status: "rejected" as const } : {}),
				})
				.where(eq(contentItems.id, r.id))
			judged++
			if (reject) rejected++
		} catch (err) {
			if (err instanceof BudgetError)
				return { judged, rejected, stoppedByBudget: true }
			console.error(`[judge] item ${r.id} failed:`, err)
		}
	}
	return { judged, rejected, stoppedByBudget: false }
}
