import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	bakeoffState,
	castVote,
	nextPair,
	runBakeoff,
} from "../../server/services/content/bakeoff.js"
import {
	setAutoPublish,
	setRoute,
} from "../../server/services/content/config.js"
import {
	type Adapters,
	createModelClient,
} from "../../server/services/content/modelClient.js"
import { generateBanterPool } from "../../server/services/gym/banterPool.js"
import {
	parseModelLabel,
	pickPair,
	standings,
} from "../../shared/content/bakeoff.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("bake-off (pure)", () => {
	it("pairs different models on one situation, never repeats a pair", () => {
		const e = [
			{ id: 1, situation: "quiet", model: "m1" },
			{ id: 2, situation: "quiet", model: "m2" },
			{ id: 3, situation: "quiet", model: "m1" },
			{ id: 4, situation: "crowded", model: "m2" },
		]
		const p = pickPair(e, new Set(), new Map(), () => 0.9)
		expect(p?.map((x) => x.model).sort()).toEqual(["m1", "m2"])
		expect(
			pickPair(e, new Set(["1-2", "2-3"]), new Map(), () => 0.1),
		).toBeNull()
	})
	it("ranks by win rate with ties counting half", () => {
		const s = standings(
			["a", "b", "c"],
			[
				{ modelA: "a", modelB: "b", winner: "a" },
				{ modelA: "a", modelB: "c", winner: null },
				{ modelA: "b", modelB: "c", winner: "c" },
			],
		)
		expect(s.map((x) => x.model)).toEqual(["a", "c", "b"])
		expect(s[0]?.rate).toBe(0.75)
	})
	it("parses provider:model labels", () => {
		expect(parseModelLabel("openrouter:openai/gpt-4o-mini")).toEqual({
			provider: "openrouter",
			model: "openai/gpt-4o-mini",
		})
		expect(parseModelLabel("nope:x")).toBeNull()
	})
})

let n = 0
const fakeText = () =>
	`A: Token${++n} alpha line here\nB: Reply${n} beta words there\n\nA: Second${n} gamma one\nB: Answer${n} delta two`
const adapters: Adapters = {
	gemini: async () => ({ text: fakeText(), tokensIn: 100, tokensOut: 50 }),
	openrouter: async (r) => {
		if (r.model === "broken/model") throw new Error("no such model")
		return { text: fakeText(), tokensIn: 100, tokensOut: 50, usd: 0.001 }
	},
}

describe("bake-off (db)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
		await setAutoPublish(await getTestDb(), "banter", true)
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("runs a round, skips a broken model, takes blind votes and ranks", async () => {
		const db = await getTestDb()
		const client = createModelClient(db, adapters)
		const run = await runBakeoff(
			db,
			client,
			[
				{ provider: "gemini", model: "g1" },
				{ provider: "openrouter", model: "o1" },
				{ provider: "openrouter", model: "broken/model" },
			],
			"r1",
		)
		expect(run.errors.map((e) => e.model)).toEqual(["openrouter:broken/model"])
		expect(run.entries).toBeGreaterThan(10)
		// the hand-written bar is always in the round
		const standing = await bakeoffState(db, "r1")
		expect(standing.standings.map((s) => s.model)).toContain("hand-written")

		const pair = await nextPair(db, "u1", "r1")
		expect(pair).not.toBeNull()
		expect(JSON.stringify(pair)).not.toContain("g1")
		if (!pair) return
		await castVote(db, "u1", { a: pair.a.id, b: pair.b.id, winner: pair.a.id })
		// voting again on the same pair changes it rather than doubling it
		await castVote(db, "u1", { a: pair.b.id, b: pair.a.id, winner: null })
		const st = await bakeoffState(db, "r1")
		expect(st.votes).toBe(1)
		expect(st.standings.every((s) => s.games <= 1)).toBe(true)
		await expect(
			castVote(db, "u1", { a: pair.a.id, b: pair.b.id, winner: 999999 }),
		).rejects.toThrow()
	})

	it("banter generation goes through the budgeted client when one is given", async () => {
		const db = await getTestDb()
		const client = createModelClient(db, adapters)
		let aiCalls = 0
		const ai = {
			generateBanter: async () => {
				aiCalls++
				return fakeText()
			},
		} as never
		const run = await generateBanterPool(db, ai, new Date(), client)
		expect(aiCalls).toBe(0)
		expect(run.added).toBeGreaterThan(0)
		await setRoute(db, "banter", { provider: "openrouter", model: "o1" })
		const again = await generateBanterPool(db, ai, new Date(), client)
		expect(aiCalls).toBe(0)
		expect(again.added).toBeGreaterThanOrEqual(0)
	})
})
