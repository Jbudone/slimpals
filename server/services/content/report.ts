// The spend report: built from the ledger and the budget (pure text builder),
// sent by email on the owner's schedule, shown on the admin page too.
import { desc, eq } from "drizzle-orm"
import {
	type BudgetConfig,
	dailyCapUsd,
	dayNumber,
	dayOf,
} from "../../../shared/content/budget.js"
import { scheduledJobRuns, users } from "../../db/schema.js"
import { type SendResult, sendEmail } from "../email/resend.js"
import type { Db } from "../gym/layout3dStore.js"
import { type BakeoffState, bakeoffState, latestRound } from "./bakeoff.js"
import {
	getBudget,
	getReportConfig,
	type ReportConfig,
	setReportConfig,
} from "./config.js"
import {
	activitySince,
	type ContentStats,
	contentStats,
	mostPlayed,
	recentItems,
	unseenBySituation,
} from "./items.js"
import { type ReviewStats, reviewStats } from "./reviews.js"
import {
	recentFailures,
	type SpendBucket,
	type SpendFailure,
	type SpendSummary,
	spendSummary,
	spentOnDay,
} from "./spend.js"

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`

function lines(title: string, rows: SpendBucket[], max = 8): string[] {
	if (rows.length === 0) return [`${title}: nothing yet`]
	return [
		`${title}:`,
		...rows
			.slice(0, max)
			.map((r) => `  ${r.key}  ${usd(r.usd)}  (${r.calls} calls)`),
	]
}

/** An item as the report shows it. */
export type ReportItem = {
	id: number
	type: string
	situation: string
	payload: unknown
	model: string | null
	costMicros: number
	shownCount: number
	status: string
}

export type JobRunInfo = {
	status: string
	finishedAt: Date | null
	result: unknown
	error: string | null
} | null

export type ReportInput = {
	now: Date
	/** The report covers this long (24 hours for a daily one). */
	windowHours: number
	budget: BudgetConfig
	today: number
	summary: SpendSummary
	content?: ContentStats
	/** Items made inside the window, newest first. */
	newItems?: ReportItem[]
	failures?: SpendFailure[]
	banterRun?: JobRunInfo
	activity?: { players: number; items: number }
	unseenBy?: { type: string; situation: string; n: number }[]
	topPlayed?: ReportItem[]
	reviews?: ReviewStats
	bakeoff?: BakeoffState
	keys?: { gemini: boolean; openrouter: boolean }
	/** Public address of the admin page, when known. */
	pageUrl?: string
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** An item's text for reading: a banter exchange is its lines. */
export function itemText(payload: unknown): string[] {
	const lines = (payload as { lines?: unknown } | null)?.lines
	if (Array.isArray(lines)) return lines.map(String)
	const json = JSON.stringify(payload ?? "")
	return [json.length > 240 ? `${json.slice(0, 240)}...` : json]
}

function itemBlock(it: ReportItem): string[] {
	const cost =
		it.costMicros > 0
			? usd(it.costMicros / 1_000_000)
			: it.model
				? "$0 (rounded down)"
				: "cost not recorded"
	return [
		`#${it.id} [${it.situation}] ${it.model ?? "no model recorded"}, ${cost}` +
			(it.shownCount ? `, played ${it.shownCount}x` : ""),
		...itemText(it.payload).map((l) => `    "${l}"`),
	]
}

/** Things worth a look, in plain words. Empty when all is well. */
/** On the day a cheaper (or dearer) budget step begins, say so with what the
 * period before it actually cost, so the step can be kept or changed. */
export function budgetStepNotes(i: ReportInput): string[] {
	const day = dayNumber(i.budget, i.now)
	const steps = i.budget.steps
	const idx = steps.findIndex((s) => s.fromDay === day && day > 0)
	if (idx <= 0) return []
	const prev = steps[idx - 1] as { usd: number }
	const now = steps[idx] as { usd: number }
	const days = i.summary.byDay.length || 1
	return [
		`The daily budget steps from ${usd(prev.usd)} to ${usd(now.usd)} today. The last ${days} day(s) cost ${usd(i.summary.totalUsd)} (${usd(i.summary.totalUsd / days)} a day). Change it on the Admin card if that is not right.`,
	]
}

export function headsUp(i: ReportInput): string[] {
	const out: string[] = []
	const cap = dailyCapUsd(i.budget, i.now)
	if (cap > 0 && i.today / cap >= 0.8)
		out.push(`Today's spend is ${pct(i.today / cap)} of the ${usd(cap)} cap.`)
	out.push(...budgetStepNotes(i))
	if (i.failures && i.failures.length > 0)
		out.push(
			`${i.failures.length} model call(s) failed in this period (see Failures).`,
		)
	const fresh = (i.newItems ?? []).filter((x) => x.status !== "retired")
	const unpriced = fresh.filter((x) => x.costMicros === 0 && !x.model)
	if (unpriced.length > 0)
		out.push(
			`${unpriced.length} new item(s) have no cost recorded; the cost tracking may be broken.`,
		)
	const run = i.banterRun
	if (run && run.status === "failed")
		out.push(`The banter job failed: ${run.error ?? "no reason recorded"}.`)
	const res = run?.result as
		| { skippedBudget?: boolean; skippedBacklog?: string[] }
		| undefined
	if (res?.skippedBudget)
		out.push("The banter job stopped early because the day's budget was used.")
	if (
		i.content?.exposureRate != null &&
		i.content.exposureRate < 0.85 &&
		i.content.matured >= 10
	)
		out.push(
			`Exposure is ${pct(i.content.exposureRate)}, below the 85% target.`,
		)
	if (i.keys && !i.keys.openrouter)
		out.push("The OpenRouter key is not set (Gemini only for now).")
	return out
}

function contentLines(c?: ContentStats): string[] {
	if (!c) return ["Content: not tracked"]
	const rate =
		c.exposureRate === null
			? "no items are old enough to judge yet"
			: `${pct(c.exposureRate)} of items published 14+ days ago were seen (target 85%)`
	return [
		`Content: ${c.published} published, ${c.unseen} not seen by anyone yet, ${c.byStatus.retired ?? 0} retired`,
		`Exposure: ${rate}`,
		`Item cost ${usd(c.costUsd)}, of which ${usd(c.seenCostUsd)} on items players saw`,
		"Items copied from the old pool (before cost tracking) show no cost; they are not free.",
	]
}

function reviewLines(r?: ReviewStats): string[] {
	if (!r || r.total === 0)
		return ["No reviews yet (the phone review queue is at /review)."]
	const v = r.byVerdict
	return [
		`${r.today} reviewed in this period, ${r.total} in all: ${v.good ?? 0} good, ${v.meh ?? 0} meh, ${v.bad ?? 0} bad`,
		r.judgeAgreement === null
			? "Judge agreement: nothing to compare yet"
			: `Judge agreed with you on ${pct(r.judgeAgreement)} of ${r.judgeCompared} items`,
		...(r.topTags.length
			? [
					`Most used tags: ${r.topTags.map((t) => `${t.tag} ${t.n}`).join(", ")}`,
				]
			: []),
	]
}

export function bakeoffLines(b?: BakeoffState): string[] {
	if (!b?.round) return []
	if (b.running) return ["A bake-off round is still being written."]
	const lead = b.standings.find((s) => s.games > 0)
	return [
		`Round ${b.round}: ${b.entries} exchanges, ${b.votes} votes.`,
		lead
			? `Leading: ${lead.model}, ${pct(lead.rate ?? 0)} over ${lead.games} games.`
			: "No votes yet.",
		b.votes < 30
			? "A few more votes would settle it: open /review?mode=bakeoff on your phone."
			: "Enough votes to choose: use the winner on the Admin card.",
	]
}

function jobLines(run?: JobRunInfo): string[] {
	if (!run) return ["Nightly banter job: no run recorded yet"]
	const r = (run.result ?? {}) as {
		added?: number
		duplicates?: number
		judged?: number
		judgeRejected?: number
		skippedBacklog?: string[]
		skippedBudget?: boolean
	}
	const when = run.finishedAt ? run.finishedAt.toISOString().slice(0, 16) : "?"
	return [
		`Nightly banter job: ${run.status}, finished ${when} UTC` +
			(typeof r.added === "number" ? `, added ${r.added} exchanges` : ""),
		...(typeof r.judged === "number"
			? [
					`  judge scored ${r.judged}, rejected ${r.judgeRejected ?? 0}; ${r.duplicates ?? 0} near-duplicates dropped`,
				]
			: []),
		...(r.skippedBacklog?.length
			? [
					`  skipped (unseen exchanges already waiting): ${r.skippedBacklog.join(", ")}`,
				]
			: []),
		...(r.skippedBudget ? ["  stopped early: the day's budget was used"] : []),
		...(run.error ? [`  error: ${run.error}`] : []),
	]
}

export function buildReport(i: ReportInput): { subject: string; text: string } {
	const cap = dailyCapUsd(i.budget, i.now)
	const day = dayNumber(i.budget, i.now)
	const newItems = i.newItems ?? []
	const subject = `SlimPals content report: ${newItems.length} new, ${usd(i.today)} of ${usd(cap)} today`
	const period =
		i.windowHours >= 48
			? `last ${Math.round(i.windowHours / 24)} days`
			: "last 24 hours"
	const warn = headsUp(i)
	const text = [
		`Content pipeline report for ${dayOf(i.now)} (budget day ${day + 1})`,
		"",
		"HEADS UP",
		...(warn.length
			? warn.map((w) => `- ${w}`)
			: ["- Nothing needs attention."]),
		"",
		"SPEND",
		`Today: ${usd(i.today)} spent of a ${usd(cap)} daily cap`,
		`Last ${i.summary.byDay.length} day(s): ${usd(i.summary.totalUsd)} over ${i.summary.calls} calls` +
			(i.summary.failed ? `, ${i.summary.failed} failed` : ""),
		...lines("By day", i.summary.byDay.slice(-7)).map((l) => l),
		...lines("By purpose", i.summary.byPurpose),
		...lines("By model", i.summary.byModel),
		"",
		`NEW CONTENT (${period}): ${newItems.length} item(s)`,
		...(newItems.length
			? newItems.slice(0, 40).flatMap(itemBlock)
			: ["Nothing new."]),
		...(newItems.length > 40 ? [`...and ${newItems.length - 40} more`] : []),
		"",
		"GENERATION",
		...jobLines(i.banterRun),
		"",
		"WHAT PLAYERS SAW",
		i.activity
			? `In this period ${i.activity.players} player(s) saw ${i.activity.items} different item(s).`
			: "Not tracked.",
		...(i.unseenBy?.length
			? [
					`Waiting unseen: ${i.unseenBy.map((u) => `${u.situation} ${u.n}`).join(", ")}`,
				]
			: ["Nothing is waiting unseen."]),
		...(i.topPlayed?.length
			? ["Most played (watch for repeats):", ...i.topPlayed.flatMap(itemBlock)]
			: []),
		"",
		"YOUR REVIEWS",
		...reviewLines(i.reviews),
		...(i.bakeoff?.round
			? ["", "MODEL BAKE-OFF", ...bakeoffLines(i.bakeoff)]
			: []),
		"",
		"CONTENT TOTALS",
		...contentLines(i.content),
		...(i.failures?.length
			? [
					"",
					"FAILURES",
					...i.failures
						.slice(0, 10)
						.map(
							(f) =>
								`${f.at.toISOString().slice(0, 16)} ${f.provider} ${f.model} (${f.purpose}): ${f.note ?? "no reason recorded"}`,
						),
				]
			: []),
		"",
		...(i.pageUrl ? ["", `Page: ${i.pageUrl}`] : []),
	].join("\n")
	return { subject, text }
}

/** Whether the report is due: enabled, past its hour, and not sent for the
 * current period (a UTC day; weekly sends only on Mondays). */
export function reportDue(cfg: ReportConfig, now: Date): boolean {
	if (!cfg.enabled) return false
	if (cfg.cadence === "weekly" && now.getUTCDay() !== 1) return false
	if (now.getUTCHours() < cfg.hourUtc) return false
	return cfg.lastSentKey !== dayOf(now)
}

export async function reportRecipients(
	db: Db,
	cfg: ReportConfig,
): Promise<string[]> {
	if (cfg.recipients.length > 0) return cfg.recipients
	const admins = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.isAdmin, true))
	return admins.map((a) => a.email).filter((e) => !e.endsWith(".test"))
}

export async function sendReport(
	db: Db,
	now: Date,
	send: typeof sendEmail = sendEmail,
): Promise<SendResult> {
	const cfg = await getReportConfig(db)
	const budget = await getBudget(db, now)
	const windowHours = cfg.cadence === "weekly" ? 7 * 24 : 24
	const since = new Date(now.getTime() - windowHours * 3_600_000)
	const [job] = await db
		.select()
		.from(scheduledJobRuns)
		.where(eq(scheduledJobRuns.job, "nightly-banter"))
		.orderBy(desc(scheduledJobRuns.startedAt))
		.limit(1)
	const { subject, text } = buildReport({
		now,
		windowHours,
		budget,
		today: await spentOnDay(db, dayOf(now)),
		summary: await spendSummary(db, cfg.cadence === "weekly" ? 7 : 14, now),
		content: await contentStats(db, now),
		newItems: await recentItems(db, since, 200),
		failures: await recentFailures(db, since, 10),
		banterRun: job
			? {
					status: job.status,
					finishedAt: job.finishedAt,
					result: job.result,
					error: job.error,
				}
			: null,
		activity: await activitySince(db, since),
		unseenBy: await unseenBySituation(db),
		topPlayed: await mostPlayed(db, 3),
		reviews: await reviewStats(db, since),
		bakeoff: await bakeoffState(db, await latestRound(db)),
		keys: {
			gemini: Boolean(process.env.GEMINI_API_KEY),
			openrouter: Boolean(process.env.OPENROUTER_API_KEY),
		},
		pageUrl: process.env.APP_URL ? `${process.env.APP_URL}/admin` : undefined,
	})
	return send({ to: await reportRecipients(db, cfg), subject, text })
}

/** The scheduled check: sends when due and remembers it did. */
export async function maybeSendReport(
	db: Db,
	now: Date,
	send: typeof sendEmail = sendEmail,
): Promise<Record<string, unknown>> {
	const cfg = await getReportConfig(db)
	if (!reportDue(cfg, now)) return { sent: false, reason: "not due" }
	const res = await sendReport(db, now, send)
	if (res.sent) await setReportConfig(db, { ...cfg, lastSentKey: dayOf(now) })
	return res
}
