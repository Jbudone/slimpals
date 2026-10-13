import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getBudget, setBudget } from "../../server/services/content/config.js"
import {
	type Adapters,
	BudgetError,
	createModelClient,
	openRouterAdapter,
} from "../../server/services/content/modelClient.js"
import {
	recordSpend,
	spendSummary,
	spentOnDay,
} from "../../server/services/content/spend.js"
import { dayOf, defaultBudget } from "../../shared/content/budget"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const now = new Date("2026-10-13T15:00:00Z")

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
})
afterAll(async () => {
	await closeTestDb()
})

function fakeAdapters(over: Partial<Adapters> = {}): Adapters {
	return {
		gemini: async () => ({ text: "hi", tokensIn: 1000, tokensOut: 500 }),
		openrouter: async () => ({
			text: "yo",
			tokensIn: 10,
			tokensOut: 10,
			usd: 0.002,
		}),
		...over,
	}
}

describe("spend ledger", () => {
	it("records calls, prices them and sums by day, purpose and model", async () => {
		const db = await getTestDb()
		await recordSpend(
			db,
			{
				provider: "gemini",
				model: "gemini-2.5-flash",
				purpose: "banter",
				tokensIn: 1_000_000,
			},
			now,
		)
		await recordSpend(
			db,
			{ provider: "openrouter", model: "x/y", purpose: "banter", usd: 0.5 },
			now,
		)
		await recordSpend(
			db,
			{
				provider: "gemini",
				model: "gemini-2.5-flash",
				purpose: "coach",
				ok: false,
			},
			now,
		)
		expect(await spentOnDay(db, "2026-10-13")).toBeCloseTo(0.8)
		expect(await spentOnDay(db, "2026-10-12")).toBe(0)
		const s = await spendSummary(db, 7, now)
		expect(s.totalUsd).toBeCloseTo(0.8)
		expect(s.calls).toBe(3)
		expect(s.failed).toBe(1)
		expect(s.byPurpose.find((b) => b.key === "banter")?.calls).toBe(2)
		expect(s.byModel[0].key).toBe("x/y")
	})
})

describe("budget config", () => {
	it("stores the default on first read so the start date holds", async () => {
		const db = await getTestDb()
		const a = await getBudget(db, now)
		expect(a).toEqual(defaultBudget(now))
		const later = new Date("2026-11-30T00:00:00Z")
		expect((await getBudget(db, later)).startDate).toBe(dayOf(now))
		await setBudget(db, { ...a, steps: [{ fromDay: 0, usd: 2 }] })
		expect((await getBudget(db, later)).steps).toEqual([{ fromDay: 0, usd: 2 }])
		await expect(setBudget(db, { nope: 1 })).rejects.toThrow()
	})
})

describe("model client", () => {
	it("routes to a model, records its cost and prefers a reported cost", async () => {
		const db = await getTestDb()
		const client = createModelClient(db, fakeAdapters(), () => now)
		const g = await client.generateText({ task: "banter", prompt: "hello" })
		expect(g.provider).toBe("gemini")
		expect(g.usd).toBeCloseTo((1000 * 0.3 + 500 * 2.5) / 1e6)
		const o = await client.generateText({
			task: "t",
			prompt: "hello",
			route: { provider: "openrouter", model: "x/y" },
		})
		expect(o.usd).toBe(0.002)
		expect(await spentOnDay(db, "2026-10-13")).toBeCloseTo(g.usd + 0.002)
	})

	it("refuses a call once the day's budget is used and writes nothing", async () => {
		const db = await getTestDb()
		await setBudget(db, {
			...defaultBudget(now),
			steps: [{ fromDay: 0, usd: 0.0001 }],
		})
		let called = 0
		const client = createModelClient(
			db,
			fakeAdapters({
				gemini: async () => {
					called++
					return { text: "x", tokensIn: 1, tokensOut: 1 }
				},
			}),
			() => now,
		)
		await expect(
			client.generateText({ task: "a", prompt: "p" }),
		).rejects.toBeInstanceOf(BudgetError)
		expect(called).toBe(0)
		expect(await spentOnDay(db, "2026-10-13")).toBe(0)
	})

	it("lets an owner request use the reserve", async () => {
		const db = await getTestDb()
		// cap $0.01: the pipeline may use $0.009, the reserve covers the rest
		await setBudget(db, {
			...defaultBudget(now),
			steps: [{ fromDay: 0, usd: 0.01 }],
		})
		await recordSpend(
			db,
			{ provider: "gemini", model: "m", purpose: "p", usd: 0.0095 },
			now,
		)
		const client = createModelClient(db, fakeAdapters(), () => now)
		const req = {
			task: "a",
			prompt: "p",
			maxOutputTokens: 1,
			route: { provider: "gemini" as const, model: "gemini-2.5-flash-lite" },
		}
		await expect(client.generateText(req)).rejects.toBeInstanceOf(BudgetError)
		await expect(
			client.generateText({ ...req, reserve: true }),
		).resolves.toBeTruthy()
	})

	it("records a failed call as a failure and rethrows", async () => {
		const db = await getTestDb()
		const client = createModelClient(
			db,
			fakeAdapters({
				openrouter: async () => {
					throw new Error("boom")
				},
			}),
			() => now,
		)
		await expect(
			client.generateText({
				task: "a",
				prompt: "p",
				route: { provider: "openrouter", model: "x/y" },
			}),
		).rejects.toThrow("boom")
		expect((await spendSummary(db, 1, now)).failed).toBe(1)
	})
})

describe("openrouter adapter", () => {
	const route = { provider: "openrouter" as const, model: "a/b" }
	const req = { task: "t", prompt: "hi", system: "sys", maxOutputTokens: 50 }

	it("sends the request and reads text, tokens and cost", async () => {
		let sent: { url: string; init: RequestInit } | null = null
		const fake = (async (url: string, init: RequestInit) => {
			sent = { url, init }
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: "ok" } }],
					usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.0003 },
				}),
			)
		}) as unknown as typeof fetch
		const out = await openRouterAdapter(fake, "key")(route, req)
		expect(out).toEqual({ text: "ok", tokensIn: 5, tokensOut: 2, usd: 0.0003 })
		expect(sent?.url).toContain("openrouter.ai")
		const body = JSON.parse(String(sent?.init.body))
		expect(body.model).toBe("a/b")
		expect(body.messages[0]).toEqual({ role: "system", content: "sys" })
		expect((sent?.init.headers as Record<string, string>).Authorization).toBe(
			"Bearer key",
		)
	})

	it("fails clearly without a key or on an error answer", async () => {
		await expect(
			openRouterAdapter(fetch, undefined)(route, req),
		).rejects.toThrow("OPENROUTER_API_KEY")
		const bad = (async () =>
			new Response(JSON.stringify({ error: { message: "no credit" } }), {
				status: 402,
			})) as unknown as typeof fetch
		await expect(openRouterAdapter(bad, "k")(route, req)).rejects.toThrow(
			"no credit",
		)
	})
})
