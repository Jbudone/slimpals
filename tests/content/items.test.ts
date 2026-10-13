import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { contentItems, contentSeen, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { setBudget } from "../../server/services/content/config.js"
import {
	contentStats,
	publishItems,
	recordSeen,
	retireBeyond,
	unseenBacklog,
} from "../../server/services/content/items.js"
import { recordSpend } from "../../server/services/content/spend.js"
import {
	BANTER_TYPE,
	generateBanterPool,
	UNSEEN_BACKLOG_MAX,
} from "../../server/services/gym/banterPool.js"
import { defaultBudget } from "../../shared/content/budget"
import { AI_BANTER_SITUATIONS } from "../../shared/gym3d/banterAi"
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
	const db = await getTestDb()
	await db.insert(users).values({ id: "u1", email: "p@x.test", name: "P" })
})
afterAll(async () => {
	await closeTestDb()
})

const ai = (usd = 0) =>
	({
		generateBanter: async () => {
			// what GeminiAIService does through tracked()
			const db = await getTestDb()
			if (usd)
				await recordSpend(db, {
					provider: "gemini",
					model: "gemini-2.5-flash",
					purpose: "generateBanter",
					usd,
				})
			return "A: First one here.\nB: Quite so.\n\nA: Second one here.\nB: Indeed."
		},
	}) as unknown as AIService

describe("content items", () => {
	it("publishes with provenance and retires the oldest past the newest few", async () => {
		const db = await getTestDb()
		const ids = await publishItems(
			db,
			[1, 2, 3, 4].map((n) => ({
				type: "banter",
				situation: "quiet",
				payload: { lines: ["a", `b${n}`] },
				model: "m",
				costMicros: 100,
			})),
		)
		expect(ids).toHaveLength(4)
		expect(await retireBeyond(db, "banter", "quiet", 2)).toBe(2)
		const rows = await db.select().from(contentItems)
		expect(
			rows
				.filter((r) => r.status === "retired")
				.map((r) => r.id)
				.sort(),
		).toEqual(ids.slice(0, 2))
		expect(await retireBeyond(db, "banter", "quiet", 5)).toBe(0)
	})

	it("counts what players see, per item and per player, and ignores strangers", async () => {
		const db = await getTestDb()
		const [a, b] = await publishItems(db, [
			{ type: "banter", situation: "quiet", payload: { lines: ["x", "y"] } },
			{ type: "banter", situation: "quiet", payload: { lines: ["x", "z"] } },
		])
		expect(await unseenBacklog(db, "banter", "quiet")).toBe(2)
		expect(await recordSeen(db, "u1", "banter", [a, a, 9999, -1, 3.5])).toBe(1)
		await recordSeen(db, "u1", "banter", [a])
		const [row] = await db
			.select()
			.from(contentItems)
			.where(eq(contentItems.id, a))
		expect(row.shownCount).toBe(3)
		expect(row.firstSeenAt).not.toBeNull()
		const [seen] = await db
			.select()
			.from(contentSeen)
			.where(eq(contentSeen.itemId, a))
		expect(seen.count).toBe(3)
		expect(await unseenBacklog(db, "banter", "quiet")).toBe(1)
		const [other] = await db
			.select()
			.from(contentItems)
			.where(eq(contentItems.id, b))
		expect(other.shownCount).toBe(0)
		// a type that does not match is not recorded
		expect(await recordSeen(db, "u1", "coach", [b])).toBe(0)
	})

	it("reports the exposure rate on items old enough to judge", async () => {
		const db = await getTestDb()
		const ids = await publishItems(
			db,
			[1, 2, 3, 4].map((n) => ({
				type: "banter",
				situation: "quiet",
				payload: { lines: ["x", `y${n}`] },
				costMicros: 1_000_000,
			})),
		)
		const old = new Date(now.getTime() - 20 * 86_400_000)
		await db.update(contentItems).set({ publishedAt: old })
		await db
			.update(contentItems)
			.set({ shownCount: 1 })
			.where(eq(contentItems.id, ids[0]))
		await db
			.update(contentItems)
			.set({ shownCount: 4 })
			.where(eq(contentItems.id, ids[1]))
		const s = await contentStats(db, now)
		expect(s.matured).toBe(4)
		expect(s.maturedSeen).toBe(2)
		expect(s.exposureRate).toBeCloseTo(0.5)
		expect(s.unseen).toBe(2)
		expect(s.costUsd).toBeCloseTo(4)
		expect(s.seenCostUsd).toBeCloseTo(2)
		expect(
			(await contentStats(db, new Date("2026-10-01T00:00:00Z"))).exposureRate,
		).toBeNull()
	})
})

describe("the banter job on items", () => {
	it("puts the batch's cost and model on the items it made", async () => {
		const db = await getTestDb()
		const run = await generateBanterPool(db, ai(0.07), now)
		expect(run.added).toBe(AI_BANTER_SITUATIONS.length * 2)
		const rows = await db.select().from(contentItems)
		expect(rows.every((r) => r.model === "gemini-2.5-flash")).toBe(true)
		// 0.07 dollars a call split over two exchanges
		expect(rows[0].costMicros).toBe(35_000)
	})

	it("does not top up a situation whose exchanges nobody has seen", async () => {
		const db = await getTestDb()
		await generateBanterPool(db, ai(), now)
		await generateBanterPool(db, ai(), now)
		const third = await generateBanterPool(db, ai(), now)
		expect(UNSEEN_BACKLOG_MAX).toBe(4)
		expect(third.added).toBe(0)
		expect(third.skippedBacklog).toHaveLength(AI_BANTER_SITUATIONS.length)
		const rows = await db.select().from(contentItems)
		expect(rows).toHaveLength(AI_BANTER_SITUATIONS.length * 4)
		// once players see them, it generates again
		await db.update(contentItems).set({ shownCount: 1 })
		expect((await generateBanterPool(db, ai(), now)).added).toBeGreaterThan(0)
	})

	it("stops when the day's budget is used", async () => {
		const db = await getTestDb()
		await setBudget(db, {
			...defaultBudget(now),
			steps: [{ fromDay: 0, usd: 0.001 }],
		})
		const run = await generateBanterPool(db, ai(), now)
		expect(run.skippedBudget).toBe(true)
		expect(run.added).toBe(0)
	})
})

describe("the seen route", () => {
	it("is covered through recordSeen; the type is banter", () => {
		expect(BANTER_TYPE).toBe("banter")
	})
})
