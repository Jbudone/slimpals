import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	contentItems,
	contentReviews,
	invites,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { publishItems } from "../../server/services/content/items.js"
import { judgePending } from "../../server/services/content/judge.js"
import {
	BudgetError,
	type ModelClient,
} from "../../server/services/content/modelClient.js"
import {
	nextForReview,
	reviewStats,
	submitReview,
} from "../../server/services/content/reviews.js"
import { generateBanterPool } from "../../server/services/gym/banterPool.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
})
afterAll(async () => {
	await closeTestDb()
})

const verdictJson = (n: number) =>
	JSON.stringify({
		specific: n,
		dry: n,
		natural: n,
		in_character: n,
		ai_speak: false,
		note: `all ${n}`,
	})

const judgeWith = (answers: (string | Error)[]) => {
	let i = 0
	return {
		generateText: async () => {
			const a = answers[i++] ?? answers[answers.length - 1]
			if (a instanceof Error) throw a
			return {
				text: a,
				provider: "gemini",
				model: "judge-m",
				usd: 0.001,
				tokensIn: 1,
				tokensOut: 1,
			}
		},
	} as unknown as ModelClient
}

const item = (n: number, situation = "quiet") => ({
	type: "banter",
	situation,
	payload: { lines: [`Line a ${n}`, `Line b ${n}`] },
	model: "gen",
	costMicros: 1000,
})

describe("the judge", () => {
	it("scores new items, rejects the weak and adds its cost", async () => {
		const db = await getTestDb()
		const ids = await publishItems(db, [item(1), item(2)])
		const j = await judgePending(
			db,
			judgeWith([verdictJson(5), verdictJson(2)]),
			"banter",
		)
		expect(j).toMatchObject({ judged: 2, rejected: 1, stoppedByBudget: false })
		const rows = await db.select().from(contentItems)
		const a = rows.find((r) => r.id === ids[0])
		const b = rows.find((r) => r.id === ids[1])
		expect(a).toMatchObject({
			status: "published",
			judgeScore: 100,
			judgeModel: "judge-m",
		})
		expect(a?.costMicros).toBe(2000)
		expect(b).toMatchObject({
			status: "rejected",
			judgeScore: 40,
			judgeNote: "all 2",
		})
	})

	it("leaves an item alone when the answer is unusable, and stops at the budget", async () => {
		const db = await getTestDb()
		await publishItems(db, [item(1), item(2)])
		expect(
			(await judgePending(db, judgeWith(["no idea"]), "banter")).judged,
		).toBe(0)
		const stop = await judgePending(
			db,
			judgeWith([new BudgetError("used")]),
			"banter",
		)
		expect(stop.stoppedByBudget).toBe(true)
		expect(
			(await db.select().from(contentItems)).every(
				(r) => r.status === "published",
			),
		).toBe(true)
	})
})

describe("the banter job's gates", () => {
	const ai = (text: string) =>
		({ generateBanter: async () => text }) as unknown as AIService

	it("drops a near-duplicate of what is already in the pool, then judges the rest", async () => {
		const db = await getTestDb()
		const now = new Date("2026-10-16T01:00:00Z")
		const text =
			"A: The cooler is new.\nB: It was there in March.\n\nA: Mirrors need cleaning.\nB: Nobody cleans mirrors."
		await generateBanterPool(db, ai(text), now, judgeWith([verdictJson(4)]))
		const again = await generateBanterPool(
			db,
			ai("A: The cooler is new.\nB: It was there in March."),
			now,
			judgeWith([verdictJson(4)]),
		)
		expect(again.duplicates).toBeGreaterThan(0)
		expect(again.added).toBe(0)
		const first = await db.select().from(contentItems)
		// the same text for every situation: only the first copy gets in
		expect(first.length).toBe(2)
		expect(first.every((r) => r.judgeScore === 80)).toBe(true)
	})
})

describe("the review queue", () => {
	it("shows the borderline and unjudged first, skips reviewed and skipped ones", async () => {
		const db = await getTestDb()
		const ids = await publishItems(db, [item(1), item(2), item(3), item(4)])
		await db
			.update(contentItems)
			.set({ judgeScore: 95 })
			.where(eq(contentItems.id, ids[0]))
		await db
			.update(contentItems)
			.set({ judgeScore: 62 })
			.where(eq(contentItems.id, ids[1]))
		await db
			.update(contentItems)
			.set({ judgeScore: 20, status: "rejected" })
			.where(eq(contentItems.id, ids[2]))
		// ids[3] is unjudged
		const q = await nextForReview(db, 4, [], () => 0)
		expect(q.cards.map((c) => c.id)).toEqual([ids[3], ids[1], ids[2], ids[0]])
		expect(q.waiting).toBe(4)
		expect((await nextForReview(db, 4, [ids[3]], () => 0)).cards[0].id).toBe(
			ids[1],
		)
	})

	it("a bad verdict takes an item out of play; good restores one the judge rejected", async () => {
		const db = await getTestDb()
		await db.insert(users).values({ id: "o1", email: "o@x.test", name: "O" })
		const [a, b] = await publishItems(db, [item(1), item(2)])
		await db
			.update(contentItems)
			.set({ status: "rejected", judgeScore: 30 })
			.where(eq(contentItems.id, b))
		expect(
			await submitReview(db, "o1", {
				itemId: a,
				verdict: "bad",
				tags: ["Not funny", "bogus"],
			}),
		).toEqual({ verdict: "bad", status: "rejected" })
		expect(
			await submitReview(db, "o1", { itemId: b, verdict: "good" }),
		).toEqual({ verdict: "good", status: "published" })
		const rows = await db.select().from(contentItems)
		expect(rows.find((r) => r.id === a)).toMatchObject({
			status: "rejected",
			reviewState: "bad",
		})
		expect(rows.find((r) => r.id === b)).toMatchObject({
			status: "published",
			reviewState: "good",
		})
		const rv = await db
			.select()
			.from(contentReviews)
			.where(eq(contentReviews.itemId, a))
		expect(rv[0].tags).toEqual(["Not funny"])
		// reviewed items leave the queue; changing a verdict is allowed
		expect((await nextForReview(db, 5)).cards).toHaveLength(0)
		await submitReview(db, "o1", { itemId: a, verdict: "meh" })
		expect(await db.select().from(contentReviews)).toHaveLength(2)
		await expect(
			submitReview(db, "o1", { itemId: a, verdict: "great" }),
		).rejects.toMatchObject({ status: 400 })
		await expect(
			submitReview(db, "o1", { itemId: 9999, verdict: "good" }),
		).rejects.toMatchObject({ status: 404 })
	})

	it("compares the judge with the owner", async () => {
		const db = await getTestDb()
		await db.insert(users).values({ id: "o1", email: "o@x.test", name: "O" })
		const ids = await publishItems(db, [item(1), item(2), item(3)])
		await db
			.update(contentItems)
			.set({ judgeScore: 90 })
			.where(eq(contentItems.id, ids[0]))
		await db
			.update(contentItems)
			.set({ judgeScore: 90 })
			.where(eq(contentItems.id, ids[1]))
		await db
			.update(contentItems)
			.set({ judgeScore: 30 })
			.where(eq(contentItems.id, ids[2]))
		await submitReview(db, "o1", { itemId: ids[0], verdict: "good" })
		await submitReview(db, "o1", {
			itemId: ids[1],
			verdict: "bad",
			tags: ["Not funny"],
		})
		await submitReview(db, "o1", {
			itemId: ids[2],
			verdict: "bad",
			tags: ["Not funny"],
		})
		const s = await reviewStats(db, new Date(Date.now() - 60_000))
		expect(s.total).toBe(3)
		expect(s.today).toBe(3)
		expect(s.judgeCompared).toBe(3)
		expect(s.judgeAgreement).toBeCloseTo(2 / 3)
		expect(s.topTags[0]).toEqual({ tag: "Not funny", n: 2 })
	})
})

describe("the review API", () => {
	let n = 0
	async function login(email: string, admin: boolean) {
		const db = await getTestDb()
		await db
			.insert(users)
			.values({ id: "admin-001", email: "a@x.test", name: "A" })
			.onDuplicateKeyUpdate({ set: { name: "A" } })
		const code = `REVIEW-${++n}`
		await db.insert(invites).values({
			code,
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})
		const res = await request(app)
			.post("/api/auth/sign-up/email")
			.send({ name: "T", email, password: "Password1!", inviteCode: code })
		if (admin)
			await db
				.update(users)
				.set({ isAdmin: true })
				.where(eq(users.id, res.body.user.id))
		const c = res.headers["set-cookie"] as string[]
		return Array.isArray(c) ? c.join("; ") : c
	}

	it("is for the admin only and records a verdict", async () => {
		const db = await getTestDb()
		const [id] = await publishItems(db, [item(1)])
		const player = await login("p@slimpals.test", false)
		expect(
			(
				await request(app)
					.get("/api/admin/content/review/next")
					.set("Cookie", player)
			).status,
		).toBe(403)
		const boss = await login("b@slimpals.test", true)
		const next = await request(app)
			.get("/api/admin/content/review/next")
			.set("Cookie", boss)
		expect(next.status).toBe(200)
		expect(next.body.cards[0]).toMatchObject({
			id,
			lines: ["Line a 1", "Line b 1"],
		})
		expect(next.body.stats.total).toBe(0)
		const done = await request(app)
			.post("/api/admin/content/review")
			.set("Cookie", boss)
			.send({ itemId: id, verdict: "good" })
		expect(done.status).toBe(200)
		expect(
			(
				await request(app)
					.post("/api/admin/content/review")
					.set("Cookie", boss)
					.send({ itemId: id, verdict: "x" })
			).status,
		).toBe(400)
		const after = await request(app)
			.get("/api/admin/content/review/next")
			.set("Cookie", boss)
		expect(after.body.cards).toHaveLength(0)
		expect(after.body.stats.byVerdict.good).toBe(1)
	})
})
