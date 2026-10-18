// The blind model bake-off (docs/content_pipeline.md, phase 2b): every
// candidate model writes banter for the same situations; the owner then picks
// the funnier of two unnamed exchanges. The standings choose the generator.
import { eq, sql } from "drizzle-orm"
import {
	BAKEOFF_DEFAULT_MODELS,
	type Duel,
	type Entry,
	type ModelRoute,
	modelLabel,
	pairKey,
	pickPair,
	type Standing,
	standings,
} from "../../../shared/content/bakeoff.js"
import {
	AI_BANTER_SITUATIONS,
	cleanBanterLines,
	parseBanterBlocks,
} from "../../../shared/gym3d/banterAi.js"
import { contentBakeoffEntries, contentBakeoffVotes } from "../../db/schema.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import { BANTER_SCENARIOS } from "../contentTuning/npcBanter.js"
import type { Db } from "../gym/layout3dStore.js"
import { BudgetError, type ModelClient } from "./modelClient.js"

export type BakeoffRun = {
	round: string
	entries: number
	errors: { model: string; message: string }[]
	stoppedByBudget: boolean
}

const running = new Set<string>()
export const bakeoffRunning = (): boolean => running.size > 0

/** Every model writes the three exchanges for every situation. A model that
 * fails (bad slug, no key) is reported and skipped; the budget stops the
 * rest. Owner-requested, so it may use the held-back reserve. */
export async function runBakeoff(
	db: Db,
	client: ModelClient,
	models: ModelRoute[] = BAKEOFF_DEFAULT_MODELS,
	round = `b${Date.now().toString(36)}`,
): Promise<BakeoffRun> {
	const out: BakeoffRun = {
		round,
		entries: 0,
		errors: [],
		stoppedByBudget: false,
	}
	running.add(round)
	let styleDoc = ""
	try {
		styleDoc = readTuningDoc("server/services/contentTuning/docs/npc_banter.md")
	} catch {
		// the models still have the situation text
	}
	try {
		for (const route of models) {
			const label = modelLabel(route)
			for (const situation of AI_BANTER_SITUATIONS) {
				try {
					const res = await client.generateText({
						task: "bakeoff",
						route,
						reserve: true,
						system: styleDoc,
						prompt: `Situation: ${BANTER_SCENARIOS[situation] ?? BANTER_SCENARIOS.quiet}\n\nWrite the three exchanges now.`,
						maxOutputTokens: 600,
					})
					const good = parseBanterBlocks(res.text)
						.map(cleanBanterLines)
						.filter((l): l is NonNullable<typeof l> => l !== null)
					if (!good.length) continue
					const each = Math.round((res.usd * 1_000_000) / good.length)
					await db.insert(contentBakeoffEntries).values(
						good.map((lines) => ({
							round,
							situation,
							model: label,
							lines,
							costMicros: each,
						})),
					)
					out.entries += good.length
				} catch (err) {
					if (err instanceof BudgetError) {
						out.stoppedByBudget = true
						return out
					}
					out.errors.push({
						model: label,
						message: err instanceof Error ? err.message : String(err),
					})
					break // this model is not working; move to the next
				}
			}
		}
		return out
	} finally {
		running.delete(round)
	}
}

export async function latestRound(db: Db): Promise<string | null> {
	const [row] = await db
		.select({ round: contentBakeoffEntries.round })
		.from(contentBakeoffEntries)
		.orderBy(sql`${contentBakeoffEntries.id} DESC`)
		.limit(1)
	return row?.round ?? null
}

export type PairCard = {
	round: string
	a: { id: number; lines: string[] }
	b: { id: number; lines: string[] }
	situation: string
	left: number
}

/** The next blind pair for this voter; the models are not in the answer. */
export async function nextPair(
	db: Db,
	userId: string,
	round: string,
	rand: () => number = Math.random,
): Promise<PairCard | null> {
	const entries = await db
		.select()
		.from(contentBakeoffEntries)
		.where(eq(contentBakeoffEntries.round, round))
	const votes = await db
		.select()
		.from(contentBakeoffVotes)
		.where(eq(contentBakeoffVotes.round, round))
	const voted = new Set(
		votes
			.filter((v) => v.userId === userId)
			.map((v) => pairKey(v.entryA, v.entryB)),
	)
	const per = new Map<number, number>()
	for (const v of votes) {
		per.set(v.entryA, (per.get(v.entryA) ?? 0) + 1)
		per.set(v.entryB, (per.get(v.entryB) ?? 0) + 1)
	}
	const list: Entry[] = entries.map((e) => ({
		id: e.id,
		situation: e.situation,
		model: e.model,
	}))
	const pair = pickPair(list, voted, per, rand)
	if (!pair) return null
	const byId = new Map(entries.map((e) => [e.id, e]))
	const lines = (id: number) => (byId.get(id)?.lines as string[]) ?? []
	return {
		round,
		a: { id: pair[0].id, lines: lines(pair[0].id) },
		b: { id: pair[1].id, lines: lines(pair[1].id) },
		situation: pair[0].situation,
		left: Math.max(0, countPairs(list, voted) - 1),
	}
}

function countPairs(list: Entry[], voted: Set<string>): number {
	let n = 0
	for (let i = 0; i < list.length; i++)
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i] as Entry
			const b = list[j] as Entry
			if (
				a.situation === b.situation &&
				a.model !== b.model &&
				!voted.has(pairKey(a.id, b.id))
			)
				n++
		}
	return n
}

export class BakeoffError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message)
	}
}

/** Records "A", "B" or a tie (winner null). One vote per voter and pair. */
export async function castVote(
	db: Db,
	userId: string,
	body: { a?: unknown; b?: unknown; winner?: unknown },
): Promise<void> {
	const { a, b, winner } = body
	if (!Number.isInteger(a) || !Number.isInteger(b) || a === b)
		throw new BakeoffError("a and b must be two entry ids")
	if (winner !== null && winner !== a && winner !== b)
		throw new BakeoffError("winner must be a, b or null")
	const rows = await db
		.select()
		.from(contentBakeoffEntries)
		.where(sql`${contentBakeoffEntries.id} IN (${a as number}, ${b as number})`)
	if (rows.length !== 2 || rows[0]?.round !== rows[1]?.round)
		throw new BakeoffError("those entries are not a pair", 404)
	const [lo, hi] = (a as number) < (b as number) ? [a, b] : [b, a]
	await db
		.insert(contentBakeoffVotes)
		.values({
			round: rows[0]?.round as string,
			userId,
			entryA: lo as number,
			entryB: hi as number,
			winner: (winner as number | null) ?? null,
		})
		.onDuplicateKeyUpdate({
			set: { winner: (winner as number | null) ?? null },
		})
}

export type BakeoffState = {
	round: string | null
	running: boolean
	entries: number
	votes: number
	standings: (Standing & { avgCostUsd: number | null })[]
}

export async function bakeoffState(
	db: Db,
	round: string | null,
): Promise<BakeoffState> {
	if (!round)
		return {
			round,
			running: bakeoffRunning(),
			entries: 0,
			votes: 0,
			standings: [],
		}
	const entries = await db
		.select()
		.from(contentBakeoffEntries)
		.where(eq(contentBakeoffEntries.round, round))
	const votes = await db
		.select()
		.from(contentBakeoffVotes)
		.where(eq(contentBakeoffVotes.round, round))
	const byId = new Map(entries.map((e) => [e.id, e]))
	const duels: Duel[] = []
	for (const v of votes) {
		const a = byId.get(v.entryA)
		const b = byId.get(v.entryB)
		if (!a || !b) continue
		duels.push({
			modelA: a.model,
			modelB: b.model,
			winner: v.winner === null ? null : (byId.get(v.winner)?.model ?? null),
		})
	}
	const models = [...new Set(entries.map((e) => e.model))]
	const cost = new Map<string, { sum: number; n: number }>()
	for (const e of entries) {
		const c = cost.get(e.model) ?? { sum: 0, n: 0 }
		c.sum += e.costMicros
		c.n++
		cost.set(e.model, c)
	}
	return {
		round,
		running: bakeoffRunning(),
		entries: entries.length,
		votes: votes.length,
		standings: standings(models, duels).map((s) => {
			const c = cost.get(s.model)
			return {
				...s,
				avgCostUsd: c?.n ? c.sum / c.n / 1_000_000 : null,
			}
		}),
	}
}
