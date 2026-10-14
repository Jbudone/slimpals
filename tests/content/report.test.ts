import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { users } from "../../server/db/schema.js"
import {
	DEFAULT_REPORT,
	getReportConfig,
	setReportConfig,
	validateReport,
} from "../../server/services/content/config.js"
import {
	buildReport,
	maybeSendReport,
	reportDue,
} from "../../server/services/content/report.js"
import { recordSpend } from "../../server/services/content/spend.js"
import { sendEmail } from "../../server/services/email/resend.js"
import { defaultBudget } from "../../shared/content/budget"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const at = (iso: string) => new Date(iso)

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
})
afterAll(async () => {
	await closeTestDb()
})

describe("report timing", () => {
	it("is due daily after its hour, once per day", () => {
		const cfg = { ...DEFAULT_REPORT }
		expect(reportDue(cfg, at("2026-10-13T13:59:00Z"))).toBe(false)
		expect(reportDue(cfg, at("2026-10-13T14:00:00Z"))).toBe(true)
		expect(
			reportDue(
				{ ...cfg, lastSentKey: "2026-10-13" },
				at("2026-10-13T20:00:00Z"),
			),
		).toBe(false)
		expect(
			reportDue(
				{ ...cfg, lastSentKey: "2026-10-13" },
				at("2026-10-14T15:00:00Z"),
			),
		).toBe(true)
		expect(
			reportDue({ ...cfg, enabled: false }, at("2026-10-13T15:00:00Z")),
		).toBe(false)
	})

	it("sends weekly reports on Mondays only", () => {
		const cfg = { ...DEFAULT_REPORT, cadence: "weekly" as const }
		expect(reportDue(cfg, at("2026-10-13T15:00:00Z"))).toBe(false) // Tuesday
		expect(reportDue(cfg, at("2026-10-12T15:00:00Z"))).toBe(true) // Monday
	})

	it("validates settings", () => {
		expect(typeof validateReport({ ...DEFAULT_REPORT, hourUtc: 25 })).toBe(
			"string",
		)
		expect(
			typeof validateReport({ ...DEFAULT_REPORT, recipients: ["nope"] }),
		).toBe("string")
		expect(
			typeof validateReport({ ...DEFAULT_REPORT, cadence: "hourly" }),
		).toBe("string")
		expect(validateReport(DEFAULT_REPORT)).toEqual(DEFAULT_REPORT)
	})
})

describe("report text", () => {
	it("shows today against the cap and the breakdowns", () => {
		const r = buildReport({
			now: at("2026-10-13T15:00:00Z"),
			windowHours: 24,
			budget: defaultBudget(at("2026-10-13T00:00:00Z")),
			today: 1.5,
			summary: {
				from: "2026-10-13",
				to: "2026-10-13",
				totalUsd: 1.5,
				calls: 4,
				failed: 1,
				byDay: [{ key: "2026-10-13", usd: 1.5, calls: 4 }],
				byPurpose: [{ key: "banter", usd: 1.5, calls: 4 }],
				byModel: [{ key: "gemini-2.5-flash", usd: 1.5, calls: 4 }],
			},
		})
		expect(r.subject).toContain("$1.50 of $5.00")
		expect(r.text).toContain("banter")
		expect(r.text).toContain("1 failed")
	})
})

describe("sending", () => {
	it("goes to the admins when no addresses are set, once a day", async () => {
		const db = await getTestDb()
		await db.insert(users).values([
			{ id: "a1", email: "boss@example.com", name: "Boss", isAdmin: true },
			{ id: "a2", email: "dev@slimpals.test", name: "Dev", isAdmin: true },
			{ id: "u1", email: "friend@example.com", name: "Friend" },
		])
		await recordSpend(
			db,
			{
				provider: "gemini",
				model: "gemini-2.5-flash",
				purpose: "banter",
				usd: 0.1,
			},
			at("2026-10-13T10:00:00Z"),
		)
		const sent: { to: string[]; subject: string }[] = []
		const fake = (async (e: { to: string[]; subject: string }) => {
			sent.push(e)
			return { sent: true, id: "1" }
		}) as unknown as typeof sendEmail
		const now = at("2026-10-13T15:00:00Z")
		expect((await maybeSendReport(db, now, fake)).sent).toBe(true)
		expect(sent[0].to).toEqual(["boss@example.com"])
		expect((await maybeSendReport(db, now, fake)).sent).toBe(false)
		expect(sent).toHaveLength(1)
		expect((await getReportConfig(db)).lastSentKey).toBe("2026-10-13")
		await setReportConfig(db, {
			...DEFAULT_REPORT,
			recipients: ["me@example.com"],
		})
		expect(
			(await maybeSendReport(db, at("2026-10-14T15:00:00Z"), fake)).sent,
		).toBe(true)
		expect(sent[1].to).toEqual(["me@example.com"])
	})

	it("does not mark the day as sent when sending fails", async () => {
		const db = await getTestDb()
		await setReportConfig(db, {
			...DEFAULT_REPORT,
			recipients: ["me@example.com"],
		})
		const fail = (async () => ({
			sent: false,
			reason: "down",
		})) as unknown as typeof sendEmail
		const now = at("2026-10-13T15:00:00Z")
		expect((await maybeSendReport(db, now, fail)).sent).toBe(false)
		expect((await getReportConfig(db)).lastSentKey).toBeNull()
	})
})

describe("resend", () => {
	it("needs a key and recipients, posts to Resend and reports failures", async () => {
		const prev = process.env.RESEND_API_KEY
		try {
			process.env.RESEND_API_KEY = ""
			expect(
				(await sendEmail({ to: ["a@b.co"], subject: "s", text: "t" })).sent,
			).toBe(false)
			process.env.RESEND_API_KEY = "k"
			expect((await sendEmail({ to: [], subject: "s", text: "t" })).sent).toBe(
				false,
			)
			let body: Record<string, unknown> = {}
			const ok = (async (_u: string, init: RequestInit) => {
				body = JSON.parse(String(init.body))
				return new Response(JSON.stringify({ id: "abc" }))
			}) as unknown as typeof fetch
			expect(
				await sendEmail({ to: ["a@b.co"], subject: "s", text: "t" }, ok),
			).toEqual({
				sent: true,
				id: "abc",
			})
			expect(body.to).toEqual(["a@b.co"])
			const bad = (async () =>
				new Response(JSON.stringify({ message: "domain not verified" }), {
					status: 403,
				})) as unknown as typeof fetch
			const r = await sendEmail(
				{ to: ["a@b.co"], subject: "s", text: "t" },
				bad,
			)
			expect(r).toEqual({ sent: false, reason: "domain not verified" })
		} finally {
			process.env.RESEND_API_KEY = prev
		}
	})
})

describe("report detail", () => {
	const base = {
		now: at("2026-10-14T15:00:00Z"),
		windowHours: 24,
		budget: defaultBudget(at("2026-10-13T00:00:00Z")),
		today: 0.5,
		summary: {
			from: "2026-10-13",
			to: "2026-10-14",
			totalUsd: 0.5,
			calls: 2,
			failed: 1,
			byDay: [{ key: "2026-10-14", usd: 0.5, calls: 2 }],
			byPurpose: [],
			byModel: [],
		},
	}
	const item = (over = {}) => ({
		id: 7,
		type: "banter",
		situation: "quiet",
		payload: { lines: ["The treadmill is fine.", "It is a treadmill."] },
		model: "gemini-2.5-flash",
		costMicros: 2100,
		shownCount: 0,
		status: "published",
		...over,
	})

	it("shows the text of what was added, with its model and cost", () => {
		const r = buildReport({ ...base, newItems: [item()] })
		expect(r.text).toContain("NEW CONTENT (last 24 hours): 1 item(s)")
		expect(r.text).toContain('"The treadmill is fine."')
		expect(r.text).toContain("#7 [quiet] gemini-2.5-flash, $0.0021")
		expect(r.subject).toContain("1 new")
	})

	it("says plainly when an item has no recorded cost, and flags new ones", () => {
		const migrated = item({ id: 3, model: null, costMicros: 0 })
		const r = buildReport({ ...base, newItems: [migrated] })
		expect(r.text).toContain("cost not recorded")
		expect(r.text).toContain(
			"no cost recorded; the cost tracking may be broken",
		)
		// an item with a model but a sub-cent cost is not flagged as broken
		const tiny = buildReport({
			...base,
			newItems: [item({ costMicros: 0 })],
		})
		expect(tiny.text).toContain("$0 (rounded down)")
		expect(tiny.text).not.toContain("tracking may be broken")
	})

	it("lists heads-up lines, failures and the job result", () => {
		const r = buildReport({
			...base,
			today: 4.5,
			failures: [
				{
					at: at("2026-10-14T01:00:00Z"),
					provider: "openrouter",
					model: "x/y",
					purpose: "banter",
					note: "no credit",
				},
			],
			banterRun: {
				status: "ok",
				finishedAt: at("2026-10-14T00:41:00Z"),
				error: null,
				result: { added: 6, skippedBacklog: ["quiet"], skippedBudget: false },
			},
			activity: { players: 2, items: 9 },
			unseenBy: [{ type: "banter", situation: "quiet", n: 4 }],
			keys: { gemini: true, openrouter: false },
		})
		expect(r.text).toContain("is 90% of the $5.00 cap")
		expect(r.text).toContain("1 model call(s) failed")
		expect(r.text).toContain("no credit")
		expect(r.text).toContain("added 6 exchanges")
		expect(r.text).toContain(
			"skipped (unseen exchanges already waiting): quiet",
		)
		expect(r.text).toContain("2 player(s) saw 9 different item(s)")
		expect(r.text).toContain("Waiting unseen: quiet 4")
		expect(r.text).toContain("OpenRouter key is not set")
	})

	it("is calm when all is well", () => {
		const r = buildReport({ ...base, summary: { ...base.summary, failed: 0 } })
		expect(r.text).toContain("Nothing needs attention.")
		expect(r.text).toContain("Nothing new.")
	})
})
