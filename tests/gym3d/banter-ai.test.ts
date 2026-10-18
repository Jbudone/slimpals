import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	contentItems,
	contentSeen,
	invites,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { setAutoPublish } from "../../server/services/content/config.js"
import {
	generateBanterPool,
	loadBanterPool,
	POOL_PER_SITUATION,
} from "../../server/services/gym/banterPool.js"
import {
	type BanterContext,
	banterFor,
	pickBanter,
} from "../../shared/gym3d/banter.js"
import {
	AI_BANTER_SITUATIONS,
	banterFromAi,
	cleanBanterLines,
	parseBanterBlocks,
} from "../../shared/gym3d/banterAi.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("AI banter rules", () => {
	it("parses blocks of A:/B: lines and drops the labels", () => {
		const text =
			"A: No lap pool, still.\nB: They did say we have a treadmill.\n\nsome chatter\n\nA: Busy in here.\nB: Always is.\nA: Mind the queue."
		expect(parseBanterBlocks(text)).toEqual([
			["No lap pool, still.", "They did say we have a treadmill."],
			["Busy in here.", "Always is.", "Mind the queue."],
		])
		expect(parseBanterBlocks("nothing useful")).toEqual([])
	})

	it("keeps 2-3 short dry lines and rejects the rest", () => {
		expect(cleanBanterLines(["One line here.", "And another."])).toEqual([
			"One line here.",
			"And another.",
		])
		expect(cleanBanterLines(["Only one line."])).toBeNull()
		expect(
			cleanBanterLines(["a", "b", "c", "d"].map((x) => `${x} line`)),
		).toBeNull()
		expect(cleanBanterLines(["Great gym!", "It really is."])).toBeNull()
		expect(cleanBanterLines(["x".repeat(81), "Fine line."])).toBeNull()
		expect(cleanBanterLines(["Mind your diet.", "Fine line."])).toBeNull()
	})

	it("turns an exchange into a picker entry for its situation", () => {
		const lines = ["Is the pool open yet?", "In our dreams."]
		const ctx: BanterContext = { rooms: ["cardio"], gear: [], crowded: false }
		const pool = (situation: string, over: Partial<BanterContext> = {}) => {
			const b = banterFromAi({ id: 7, situation, lines })
			return b ? banterFor({ ...ctx, ...over }, [b]).map((x) => x.id) : null
		}
		expect(pool("no_pool")).toContain("ai-7")
		expect(pool("no_pool", { rooms: ["cardio", "pool"] })).not.toContain("ai-7")
		expect(pool("crowded")).not.toContain("ai-7")
		expect(pool("crowded", { crowded: true })).toContain("ai-7")
		expect(pool("maxout", { maxout: true })).toContain("ai-7")
		expect(pool("fresh_upgrade", { upgraded: true })).toContain("ai-7")
		expect(banterFromAi({ id: 1, situation: "nope", lines })).toBeNull()
		expect(banterFromAi({ id: 1, situation: "quiet", lines: ["x"] })).toBeNull()
		expect(AI_BANTER_SITUATIONS).toContain("quiet")
	})
})

let uniq = 0
/** Banter text that never resembles an earlier call's (the pool drops near-duplicates). */
const freshText = () => {
	const n = ++uniq
	return `A: Kettle${n} hums near window${n}.\nB: Nobody${n} answers doorbell${n}.\n\nA: Parcel${n} waits beside cabinet${n}.\nB: Courier${n} forgot signature${n}.`
}

const goodAI = {
	generateBanter: async () =>
		`${freshText()}\n\nA: This breaks the rules!\nB: It does.`,
} as unknown as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: goodAI })

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

describe("the nightly banter pool", () => {
	it("stores the good exchanges for every situation and drops the rest", async () => {
		const db = await getTestDb()
		const r = await generateBanterPool(db, goodAI)
		expect(r.added).toBe(AI_BANTER_SITUATIONS.length * 2)
		const pool = await loadBanterPool(db)
		expect(pool).toHaveLength(AI_BANTER_SITUATIONS.length * 2)
		expect(new Set(pool.map((p) => p.situation))).toEqual(
			new Set(AI_BANTER_SITUATIONS),
		)
		// the one with an exclamation mark never got in
		expect(JSON.stringify(pool)).not.toContain("breaks the rules")
	})

	it("tells a player which exchanges they have not seen", async () => {
		const db = await getTestDb()
		await generateBanterPool(db, goodAI)
		const [first] = await loadBanterPool(db)
		await db
			.insert(contentSeen)
			.values({ itemId: (first as { id: number }).id, userId: "u-seen" })
		const pool = await loadBanterPool(db, "u-seen")
		expect(pool.filter((p) => p.seen)).toHaveLength(1)
		expect(pool.find((p) => p.id === first?.id)?.seen).toBe(true)
		expect((await loadBanterPool(db, "nobody")).every((p) => !p.seen)).toBe(
			true,
		)
	})

	it("picks an unseen exchange most of the time", () => {
		const ctx: BanterContext = { rooms: [], gear: [], crowded: true }
		const extra = [
			{
				id: "ai-1",
				lines: ["One two three.", "Four five six."],
				crowded: true,
				unseen: true,
			},
			{
				id: "ai-2",
				lines: ["Seven eight nine.", "Ten eleven twelve."],
				crowded: true,
			},
		] as never
		let hits = 0
		for (let i = 0; i < 50; i++) {
			const b = pickBanter(ctx, [], () => 0.1, extra)
			if (b?.id === "ai-1") hits++
		}
		expect(hits).toBe(50)
	})

	it("keeps only the newest few of a situation", async () => {
		const db = await getTestDb()
		for (let i = 0; i < 6; i++) {
			await generateBanterPool(db, goodAI)
			// players saw them, so the next night tops the pool up again
			await db.update(contentItems).set({ shownCount: 1 })
		}
		const rows = await db.select().from(contentItems)
		const quiet = rows.filter(
			(x) => x.situation === "quiet" && x.status === "published",
		)
		expect(quiet).toHaveLength(POOL_PER_SITUATION)
		expect(
			rows.filter((x) => x.situation === "quiet" && x.status === "retired")
				.length,
		).toBeGreaterThan(0)
	})

	it("does nothing without an AI method and survives an AI that throws", async () => {
		const db = await getTestDb()
		expect((await generateBanterPool(db, {} as AIService)).added).toBe(0)
		const down = {
			generateBanter: async () => {
				throw new Error("down")
			},
		} as unknown as AIService
		expect((await generateBanterPool(db, down)).added).toBe(0)
		expect(await loadBanterPool(db)).toEqual([])
	})

	it("is served to a signed-in player at /api/gym/banter", async () => {
		const db = await getTestDb()
		await db
			.insert(users)
			.values({ id: "admin-001", email: "a@x.test", name: "A" })
		await db.insert(invites).values({
			code: "BANTER-1",
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "P",
			email: "p@slimpals.test",
			password: "Password1!",
			inviteCode: "BANTER-1",
		})
		const cookies = res.headers["set-cookie"] as string[]
		const cookie = Array.isArray(cookies) ? cookies.join("; ") : cookies
		await generateBanterPool(db, goodAI)
		const got = await request(app).get("/api/gym/banter").set("Cookie", cookie)
		expect(got.status).toBe(200)
		expect(got.body.banter.length).toBe(AI_BANTER_SITUATIONS.length * 2)
		expect(got.body.banter[0]).toMatchObject({ lines: expect.any(Array) })
		expect((await request(app).get("/api/gym/banter")).status).toBe(401)

		// the player reports what played; it is counted against the item
		const id = got.body.banter[0].id as number
		const seen = await request(app)
			.post("/api/gym/content/seen")
			.set("Cookie", cookie)
			.send({ ids: [id, id, 424242] })
		expect(seen.status).toBe(200)
		expect(seen.body.recorded).toBe(1)
		const [row] = await db
			.select()
			.from(contentItems)
			.where(eq(contentItems.id, id))
		expect(row.shownCount).toBe(2)
		expect(
			(
				await request(app)
					.post("/api/gym/content/seen")
					.send({ ids: [id] })
			).status,
		).toBe(401)
		// junk in the body is ignored, not an error
		expect(
			(
				await request(app)
					.post("/api/gym/content/seen")
					.set("Cookie", cookie)
					.send({ ids: "no" })
			).body.recorded,
		).toBe(0)
	})
})
