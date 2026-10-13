// The spend report: built from the ledger and the budget (pure text builder),
// sent by email on the owner's schedule, shown on the admin page too.
import { eq } from "drizzle-orm"
import {
	type BudgetConfig,
	dailyCapUsd,
	dayNumber,
	dayOf,
} from "../../../shared/content/budget.js"
import { users } from "../../db/schema.js"
import { type SendResult, sendEmail } from "../email/resend.js"
import type { Db } from "../gym/layout3dStore.js"
import {
	getBudget,
	getReportConfig,
	type ReportConfig,
	setReportConfig,
} from "./config.js"
import { type ContentStats, contentStats } from "./items.js"
import {
	type SpendBucket,
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

export type ReportInput = {
	now: Date
	budget: BudgetConfig
	today: number
	summary: SpendSummary
	content?: ContentStats
	/** Public address of the admin page, when known. */
	pageUrl?: string
}

const pct = (n: number) => `${Math.round(n * 100)}%`

function contentLines(c?: ContentStats): string[] {
	if (!c) return ["Content: not tracked"]
	const rate =
		c.exposureRate === null
			? "no items are old enough to judge yet"
			: `${pct(c.exposureRate)} of items published 14+ days ago were seen (target 85%)`
	return [
		`Content: ${c.published} published, ${c.unseen} not seen by anyone yet`,
		`Exposure: ${rate}`,
		`Item cost ${usd(c.costUsd)}, of which ${usd(c.seenCostUsd)} on items players saw`,
		"Not tracked yet: review feedback (a later phase).",
	]
}

export function buildReport(i: ReportInput): { subject: string; text: string } {
	const cap = dailyCapUsd(i.budget, i.now)
	const day = dayNumber(i.budget, i.now)
	const subject = `SlimPals content report: ${usd(i.today)} of ${usd(cap)} today`
	const text = [
		`Content pipeline report for ${dayOf(i.now)} (budget day ${day + 1})`,
		"",
		`Today: ${usd(i.today)} spent of a ${usd(cap)} daily cap`,
		`Last ${i.summary.byDay.length} day(s): ${usd(i.summary.totalUsd)} over ${i.summary.calls} calls` +
			(i.summary.failed ? `, ${i.summary.failed} failed` : ""),
		"",
		...lines("By day", i.summary.byDay.slice(-7)),
		"",
		...lines("By purpose", i.summary.byPurpose),
		"",
		...lines("By model", i.summary.byModel),
		"",
		...contentLines(i.content),
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
	const { subject, text } = buildReport({
		now,
		budget,
		today: await spentOnDay(db, dayOf(now)),
		summary: await spendSummary(db, cfg.cadence === "weekly" ? 7 : 14, now),
		content: await contentStats(db, now),
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
