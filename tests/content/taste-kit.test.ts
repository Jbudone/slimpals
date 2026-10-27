import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { contentItems } from "../../server/db/schema.js"
import {
	keepTopCandidates,
	publishItems,
} from "../../server/services/content/items.js"
import {
	type Adapters,
	createModelClient,
} from "../../server/services/content/modelClient.js"
import { submitReview } from "../../server/services/content/reviews.js"
import { loadKit } from "../../server/services/content/tasteKit.js"
import { generateBanterPool } from "../../server/services/gym/banterPool.js"
import {
	banterBrief,
	GOLD_BANTER,
	hasCliche,
	judgeAnchors,
} from "../../shared/content/tasteKit.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("taste kit (pure)", () => {
	it("refuses stock gym talk", () => {
		expect(hasCliche(["No pain, no gain.", "Sure."])).toBe(true)
		expect(hasCliche(["The fan points at nobody.", "It's loyal."])).toBe(false)
	})

	it("puts the owner's taste and the situation in the brief", () => {
		const brief = banterBrief(
			"A quiet afternoon.",
			{
				gold: [{ lines: ["Owner liked this.", "Yes they did."] }],
				anti: [
					{ lines: ["Bad one here.", "Really bad."], note: "Too generic" },
				],
			},
			10,
			() => 0.5,
		)
		expect(brief).toContain("Owner liked this.")
		expect(brief).toContain("Bad one here.")
		expect(brief).toContain("why not: Too generic")
		expect(brief).toContain("Situation: A quiet afternoon.")
		expect(brief).toContain("Write 10 different exchanges")
		expect(GOLD_BANTER.length).toBeGreaterThan(5)
		expect(judgeAnchors({ gold: [], anti: [] })).toContain("under 50")
	})
})

let n = 0
const adapters = (seen: string[]): Adapters => ({
	gemini: async (_r, req) => {
		seen.push(req.prompt)
		const blocks = Array.from(
			{ length: 6 },
			() =>
				`A: Item${++n} alpha thing here\nB: Reply${n} beta words there\nA: Close${n} gamma ender`,
		)
		return { text: blocks.join("\n\n"), tokensIn: 100, tokensOut: 50 }
	},
	openrouter: async () => ({ text: "", tokensIn: 0, tokensOut: 0 }),
})

describe("taste kit (db)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("loads what the owner approved and refused, with their reasons", async () => {
		const db = await getTestDb()
		const [g, b] = await publishItems(db, [
			{
				type: "banter",
				situation: "quiet",
				payload: { lines: ["Good line one.", "Good reply."] },
			},
			{
				type: "banter",
				situation: "quiet",
				payload: { lines: ["Bad line one.", "Bad reply."] },
			},
		])
		await submitReview(db, "o1", { itemId: g, verdict: "good" })
		await submitReview(db, "o1", {
			itemId: b,
			verdict: "bad",
			tags: ["Too generic"],
		})
		const kit = await loadKit(db, "banter")
		expect(kit.gold[0]?.lines).toEqual(["Good line one.", "Good reply."])
		expect(kit.anti[0]?.note).toBe("Too generic")
	})

	it("keeps only the best judged candidates of a batch", async () => {
		const db = await getTestDb()
		const ids = await publishItems(
			db,
			[90, 70, 60, 85].map((_, i) => ({
				type: "banter",
				situation: "quiet",
				status: "candidate" as const,
				payload: { lines: [`Line ${i} aaa.`, `Reply ${i} bbb.`] },
			})),
		)
		for (const [i, score] of [90, 70, 60, 85].entries())
			await db
				.update(contentItems)
				.set({ judgeScore: score })
				.where(eq(contentItems.id, ids[i] as number))
		expect(await keepTopCandidates(db, "banter", "quiet", 2)).toBe(2)
		const rows = await db.select().from(contentItems)
		const live = rows
			.filter((r) => r.status === "candidate")
			.map((r) => r.judgeScore)
		expect(live.sort()).toEqual([85, 90])
	})

	it("writes ten, uses the owner's examples in the brief and cuts clichés", async () => {
		const db = await getTestDb()
		const [g] = await publishItems(db, [
			{
				type: "banter",
				situation: "quiet",
				payload: { lines: ["Approved example line.", "Approved reply."] },
			},
		])
		await submitReview(db, "o1", { itemId: g, verdict: "good" })
		const prompts: string[] = []
		const run = await generateBanterPool(
			db,
			{} as never,
			new Date(),
			createModelClient(db, adapters(prompts)),
		)
		expect(prompts[0]).toContain("Approved example line.")
		// the room found nothing it could use, so the single-shot batch ran
		expect(
			prompts.some((q) => q.includes("Write 10 different exchanges")),
		).toBe(true)
		expect(run.added).toBeGreaterThan(0)
		const rows = await db.select().from(contentItems)
		expect(rows.filter((r) => r.status === "candidate").length).toBe(run.added)
	})
})
