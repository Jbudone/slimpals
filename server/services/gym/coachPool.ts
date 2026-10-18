// The nightly coach-line batch (content pipeline, second lane): for each coach
// voice some players have chosen, a few new lines per situation, written
// through the budgeted model client, gated, judged and published as content
// items. Same rules as banter: a situation with unseen lines waiting is not
// topped up, the budget stops the run, and the scripted lines always remain.
import { and, eq, inArray } from "drizzle-orm"
import { canSpend, dayOf } from "../../../shared/content/budget.js"
import { nearDuplicate } from "../../../shared/content/quality.js"
import { hasCliche } from "../../../shared/content/tasteKit.js"
import {
	COACH_AI_SITUATIONS,
	cleanCoachPair,
	coachSituationKey,
	parseCoachKey,
	parseCoachPairs,
} from "../../../shared/gym3d/coachAi.js"
import {
	COACH_NAMES,
	COACH_VOICES,
	type CoachVoice,
} from "../../../shared/gym3d/coachLines.js"
import { contentSeen, users } from "../../db/schema.js"
import { getAutoPublish, getBudget } from "../content/config.js"
import {
	candidateCount,
	keepTopCandidates,
	publishedItems,
	publishItems,
	retireBeyond,
	unseenBacklog,
} from "../content/items.js"
import { judgePending } from "../content/judge.js"
import { BudgetError, type ModelClient } from "../content/modelClient.js"
import { collectSpend, spentOnDay } from "../content/spend.js"
import { loadKit } from "../content/tasteKit.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import type { Db } from "./layout3dStore.js"

export const COACH_TYPE = "coach"
/** Lines of one voice and situation the pool keeps (the newest). */
export const COACH_POOL_PER_KEY = 6
/** Unseen lines waiting for a key before it is not topped up. */
export const COACH_UNSEEN_MAX = 3
/** Unreviewed candidates before no more are written. */
export const COACH_CANDIDATE_MAX = 12
const ASK = 8
/** Of a batch, how many the judge lets through to the owner. */
const KEEP_PER_KEY = 2
const BATCH_ESTIMATE_USD = 0.005

const VOICE_BRIEF: Record<CoachVoice, string> = {
	friendly: "warm and encouraging, like a good friend who coaches",
	drill_sergeant:
		"clipped orders, short sentences, gruff but on the player's side",
	roaster: "teases the habit or the plan with dry wit, never the person",
	anime_sensei: "calm and a little poetic, speaks in small proverbs",
	bro: "easy, casual and upbeat, relaxed slang kept light",
}

const MOMENT: Record<(typeof COACH_AI_SITUATIONS)[number], string> = {
	morning: "it is morning and the player still has tasks to do today",
	day: "it is the middle of the day and tasks are still open",
	evening: "it is evening and a few tasks are still open",
	done: "the player has finished every task today",
}

export type CoachRun = {
	added: number
	duplicates: number
	judged: number
	judgeRejected: number
	skippedBacklog: string[]
	skippedBudget: boolean
	skippedReviewQueue?: boolean
	voices: CoachVoice[]
}

/** Coach voices that active players have picked (so no money goes to a voice
 * nobody hears). */
async function voicesInUse(db: Db): Promise<CoachVoice[]> {
	const rows = await db
		.selectDistinct({ v: users.coachPersonality })
		.from(users)
	const set = new Set(rows.map((r) => r.v as string))
	return COACH_VOICES.filter((v) => set.has(v))
}

export async function generateCoachPool(
	db: Db,
	client: ModelClient,
	now: Date = new Date(),
): Promise<CoachRun> {
	const run: CoachRun = {
		added: 0,
		duplicates: 0,
		judged: 0,
		judgeRejected: 0,
		skippedBacklog: [],
		skippedBudget: false,
		voices: [],
	}
	let styleDoc = ""
	try {
		styleDoc = readTuningDoc(
			"server/services/contentTuning/docs/coach_lines.md",
		)
	} catch {
		// the brief below still carries the voice
	}
	const auto = (await getAutoPublish(db))[COACH_TYPE] === true
	if (!auto && (await candidateCount(db, COACH_TYPE)) >= COACH_CANDIDATE_MAX) {
		run.skippedReviewQueue = true
		return run
	}
	run.voices = await voicesInUse(db)
	const kit = await loadKit(db, COACH_TYPE)
	const examples = (list: { lines: readonly string[] }[]) =>
		list
			.slice(0, 4)
			.map((e) => `${e.lines[0]} | ${e.lines[1]}`)
			.join("\n")
	outer: for (const voice of run.voices) {
		for (const sit of COACH_AI_SITUATIONS) {
			const key = coachSituationKey(voice, sit)
			try {
				if ((await unseenBacklog(db, COACH_TYPE, key)) >= COACH_UNSEEN_MAX) {
					run.skippedBacklog.push(key)
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
					break outer
				}
				const { result, usd, models } = await collectSpend(() =>
					client.generateText({
						task: "coach",
						system: styleDoc,
						prompt: `You are ${COACH_NAMES[voice]}, ${VOICE_BRIEF[voice]}. Moment: ${MOMENT[sit]}. Write ${ASK} different coach lines for this moment, one per line, in the form: lead | follow-up. The lead is 1 to 5 words, the follow-up one short sentence. No exclamation marks, no placeholders, nothing about the body. Make them specific to the moment and different from each other, with a little dry wit rather than stock motivation.${kit.gold.length ? `\nLines the owner liked:\n${examples(kit.gold)}` : ""}${kit.anti.length ? `\nLines the owner rejected (nothing like these):\n${examples(kit.anti)}` : ""} Output only the lines.`,
						maxOutputTokens: 900,
					}),
				)
				const existing = (await publishedItems(db, COACH_TYPE, [key])).map(
					(r) => (r.payload as { lines?: string[] }).lines ?? [],
				)
				const good: [string, string][] = []
				for (const [lead, rest] of parseCoachPairs(result.text)) {
					const pair = cleanCoachPair(lead, rest)
					if (!pair || hasCliche(pair)) continue
					if (nearDuplicate(pair, [...existing, ...good])) {
						run.duplicates++
						continue
					}
					good.push(pair)
				}
				if (good.length) {
					const each = Math.round((usd * 1_000_000) / good.length)
					await publishItems(
						db,
						good.map((lines) => ({
							type: COACH_TYPE,
							situation: key,
							status: auto ? "published" : "candidate",
							payload: { lines },
							model: models[0] ?? result.model,
							costMicros: each,
						})),
					)
					run.added += good.length
					await retireBeyond(db, COACH_TYPE, key, COACH_POOL_PER_KEY)
				}
			} catch (err) {
				if (err instanceof BudgetError) {
					run.skippedBudget = true
					break outer
				}
				console.error(`[coach] ${key} failed, keeping the pool:`, err)
			}
		}
	}
	try {
		const j = await judgePending(db, client, COACH_TYPE)
		run.judged = j.judged
		run.judgeRejected = j.rejected
		if (!auto)
			for (const v of run.voices)
				for (const s of COACH_AI_SITUATIONS)
					await keepTopCandidates(
						db,
						COACH_TYPE,
						coachSituationKey(v, s),
						KEEP_PER_KEY,
					)
	} catch (err) {
		console.error("[coach] judging failed, items stay unjudged:", err)
	}
	return run
}

export type CoachPoolRow = {
	id: number
	voice: CoachVoice
	situation: string
	lead: string
	rest: string
	seen?: boolean
}

/** The pool as the client reads it, with what this player has not seen yet. */
export async function loadCoachPool(
	db: Db,
	userId?: string,
): Promise<CoachPoolRow[]> {
	const keys = COACH_VOICES.flatMap((v) =>
		COACH_AI_SITUATIONS.map((s) => coachSituationKey(v, s)),
	)
	const rows = await publishedItems(db, COACH_TYPE, keys)
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
	return rows.flatMap((r) => {
		const k = parseCoachKey(r.situation)
		const lines = (r.payload as { lines?: unknown } | null)?.lines
		if (!k || !Array.isArray(lines) || lines.length !== 2) return []
		return [
			{
				id: r.id,
				voice: k.voice,
				situation: k.situation,
				lead: String(lines[0]),
				rest: String(lines[1]),
				...(userId ? { seen: seen.has(r.id) } : {}),
			},
		]
	})
}
