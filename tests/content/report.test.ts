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
