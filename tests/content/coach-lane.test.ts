import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { contentItems, contentSeen, users } from "../../server/db/schema.js"
import { setAutoPublish } from "../../server/services/content/config.js"
import {
	type Adapters,
	createModelClient,
} from "../../server/services/content/modelClient.js"
import {
	COACH_TYPE,
	generateCoachPool,
	loadCoachPool,
} from "../../server/services/gym/coachPool.js"
import {
	cleanCoachPair,
	parseCoachKey,
	parseCoachPairs,
} from "../../shared/gym3d/coachAi.js"
import { coachLineFor, seededRng } from "../../shared/gym3d/coachLines.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("coach lane rules", () => {
	it("parses lead | follow-up lines and checks the style", () => {
		const pairs = parseCoachPairs(
			"1. Mat's waiting | Ten minutes is plenty.\nnoise\n- Easy start | One set, then see.",
		)
		expect(pairs).toHaveLength(2)
		expect(cleanCoachPair("Mat's waiting", "Ten minutes is plenty.")).toEqual([
			"Mat's waiting",
			"Ten minutes is plenty.",
		])
		expect(cleanCoachPair("Go go go!", "Now.")).toBeNull()
		expect(cleanCoachPair("One two three four five six", "Fine.")).toBeNull()
		expect(cleanCoachPair("Fine", "Watch the {n} left.")).toBeNull()
		expect(cleanCoachPair("Fine", "Mind your weight today.")).toBeNull()
		expect(parseCoachKey("bro:morning")).toEqual({
			voice: "bro",
			situation: "morning",
		})
		expect(parseCoachKey("bro:gear")).toBeNull()
	})

	it("uses an unseen AI line for the moment, scripted ones otherwise", () => {
		const ctx = {
			left: 2,
			total: 3,
			loaded: true,
			hour: 8,
			ai: [
				{
					id: 5,
					situation: "morning",
					lead: "Fresh",
					rest: "Line five.",
					unseen: true,
				},
				{ id: 6, situation: "morning", lead: "Old", rest: "Line six." },
				{ id: 7, situation: "evening", lead: "Late", rest: "Line seven." },
			],
		}
		const got = new Set<string>()
		for (let i = 0; i < 60; i++)
			got.add(coachLineFor("bro", ctx, [], seededRng(i)).id)
		expect(got.has("ai-5")).toBe(true)
		expect(got.has("ai-7")).toBe(false) // wrong moment
		expect([...got].some((id) => !id.startsWith("ai-"))).toBe(true)
		const none = coachLineFor("bro", { ...ctx, ai: [] }, [], seededRng(1))
		expect(none.id.startsWith("ai-")).toBe(false)
	})
})

let n = 0
const adapters: Adapters = {
	gemini: async () => ({
		text: [1, 2, 3, 4]
			.map(
				(k) =>
					`Lead${++n} word | Follow${n} sentence ${k} stands alone ${n}x${n}`,
			)
			.join("\n"),
		tokensIn: 100,
		tokensOut: 50,
	}),
	openrouter: async () => ({ text: "", tokensIn: 0, tokensOut: 0 }),
}

describe("coach lane (db)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
		await setAutoPublish(await getTestDb(), "coach", true)
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("writes lines for the voices in use, tells what is unseen, honours the backlog", async () => {
		const db = await getTestDb()
		await db.insert(users).values([
			{ id: "c1", email: "c1@t.test", name: "A", coachPersonality: "bro" },
			{ id: "c2", email: "c2@t.test", name: "B", coachPersonality: "bro" },
		])
		const client = createModelClient(db, adapters)
		const run = await generateCoachPool(db, client)
		expect(run.voices).toEqual(["bro"])
		expect(run.added).toBeGreaterThanOrEqual(8)
		const pool = await loadCoachPool(db, "c1")
		expect(pool.every((p) => p.voice === "bro")).toBe(true)
		expect(pool.every((p) => p.seen === false)).toBe(true)
		await db
			.insert(contentSeen)
			.values({ itemId: pool[0]?.id as number, userId: "c1" })
		const again = await loadCoachPool(db, "c1")
		expect(again.filter((p) => p.seen)).toHaveLength(1)
		// the unseen lines are still waiting: the next night skips those moments
		const second = await generateCoachPool(db, client)
		expect(second.skippedBacklog.length).toBeGreaterThan(0)
		expect(COACH_TYPE).toBe("coach")
	})
})

describe("review gate (db)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("writes candidates by default and stops when too many wait", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "g1",
			email: "g1@t.test",
			name: "G",
			coachPersonality: "bro",
		})
		const client = createModelClient(db, adapters)
		const first = await generateCoachPool(db, client)
		expect(first.added).toBeGreaterThan(0)
		expect(await loadCoachPool(db, "g1")).toHaveLength(0) // none plays yet
		const rows = await db.select().from(contentItems)
		expect(
			rows.every((r) => r.status === "candidate" || r.status === "rejected"),
		).toBe(true)
		const second = await generateCoachPool(db, client)
		expect(second.skippedReviewQueue).toBe(true)
		expect(second.added).toBe(0)
	})
})
