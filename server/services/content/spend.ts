// The spend ledger: every model call writes a row; the budget and the report
// read it back. Costs are stored as integer millionths of a dollar.
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { dayOf } from "../../../shared/content/budget.js"
import { costUsd } from "../../../shared/content/pricing.js"
import { db as appDb } from "../../db/index.js"
import { aiSpend } from "../../db/schema.js"
import type { Db } from "../gym/layout3dStore.js"
import { getPriceOverrides } from "./config.js"

export type SpendEntry = {
	provider: "gemini" | "openrouter"
	model: string
	purpose: string
	tokensIn?: number
	tokensOut?: number
	images?: number
	/** Cost reported by the provider; computed from the price table if absent. */
	usd?: number
	ok?: boolean
}

export async function recordSpend(
	db: Db,
	e: SpendEntry,
	now: Date = new Date(),
): Promise<number> {
	const usd =
		e.usd ??
		costUsd(
			e.model,
			e.tokensIn ?? 0,
			e.tokensOut ?? 0,
			e.images ?? 0,
			await getPriceOverrides(db),
		)
	await db.insert(aiSpend).values({
		day: dayOf(now),
		provider: e.provider,
		model: e.model.slice(0, 80),
		purpose: e.purpose.slice(0, 48),
		tokensIn: e.tokensIn ?? 0,
		tokensOut: e.tokensOut ?? 0,
		images: e.images ?? 0,
		usdMicros: Math.round(usd * 1_000_000),
		ok: e.ok ?? true,
	})
	return usd
}

/** For call sites that must never fail because of bookkeeping. */
export async function recordSpendSafe(
	db: Db = appDb,
	e: SpendEntry,
): Promise<void> {
	try {
		await recordSpend(db, e)
	} catch (err) {
		console.error("[spend] could not record a model call:", err)
	}
}

export async function spentOnDay(db: Db, day: string): Promise<number> {
	const [row] = await db
		.select({ micros: sql<string>`COALESCE(SUM(${aiSpend.usdMicros}), 0)` })
		.from(aiSpend)
		.where(eq(aiSpend.day, day))
	return Number(row?.micros ?? 0) / 1_000_000
}

export type SpendBucket = { key: string; usd: number; calls: number }

export type SpendSummary = {
	from: string
	to: string
	totalUsd: number
	calls: number
	failed: number
	byDay: SpendBucket[]
	byPurpose: SpendBucket[]
	byModel: SpendBucket[]
}

async function bucket(
	db: Db,
	col: typeof aiSpend.day | typeof aiSpend.purpose | typeof aiSpend.model,
	from: string,
	to: string,
): Promise<SpendBucket[]> {
	const rows = await db
		.select({
			key: col,
			micros: sql<string>`COALESCE(SUM(${aiSpend.usdMicros}), 0)`,
			calls: sql<string>`COUNT(*)`,
		})
		.from(aiSpend)
		.where(and(gte(aiSpend.day, from), lte(aiSpend.day, to)))
		.groupBy(col)
		.orderBy(desc(sql`SUM(${aiSpend.usdMicros})`))
	return rows.map((r) => ({
		key: String(r.key),
		usd: Number(r.micros) / 1_000_000,
		calls: Number(r.calls),
	}))
}

/** Spend from the day `days - 1` before `now` through `now` (UTC days). */
export async function spendSummary(
	db: Db,
	days: number,
	now: Date,
): Promise<SpendSummary> {
	const to = dayOf(now)
	const from = dayOf(new Date(now.getTime() - (days - 1) * 86_400_000))
	const byDay = (await bucket(db, aiSpend.day, from, to)).sort((a, b) =>
		a.key < b.key ? -1 : 1,
	)
	const [fails] = await db
		.select({ n: sql<string>`COUNT(*)` })
		.from(aiSpend)
		.where(
			and(gte(aiSpend.day, from), lte(aiSpend.day, to), eq(aiSpend.ok, false)),
		)
	return {
		from,
		to,
		totalUsd: byDay.reduce((s, b) => s + b.usd, 0),
		calls: byDay.reduce((s, b) => s + b.calls, 0),
		failed: Number(fails?.n ?? 0),
		byDay,
		byPurpose: await bucket(db, aiSpend.purpose, from, to),
		byModel: await bucket(db, aiSpend.model, from, to),
	}
}
