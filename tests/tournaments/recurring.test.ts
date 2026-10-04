// System-run weekly and monthly tournaments (gh-123): period/rotation math
// (pure) and creation (idempotent per period) and the winner's feed post.
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	dailyCheckins,
	socialPosts,
	tournamentParticipants,
	tournaments,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { resolveDueTournaments } from "../../server/services/tournaments/index.js"
import { ensureRecurringTournaments } from "../../server/services/tournaments/recurring.js"
import {
	monthlyPeriod,
	recurringPeriods,
	weeklyPeriod,
} from "../../shared/tournaments/recurring.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const DAY = 24 * 60 * 60 * 1000

describe("recurring tournament periods", () => {
	it("a week runs Monday to Monday (UTC) and is keyed by its Monday", () => {
		// Sunday 2026-10-04 still belongs to the week of Monday 2026-09-28
		const sun = weeklyPeriod(new Date("2026-10-04T23:59:00Z"))
		expect(sun.key).toBe("weekly:2026-09-28")
		expect(sun.start.toISOString()).toBe("2026-09-28T00:00:00.000Z")
		expect(sun.end.toISOString()).toBe("2026-10-05T00:00:00.000Z")
		expect(weeklyPeriod(new Date("2026-10-05T00:00:00Z")).key).toBe(
			"weekly:2026-10-05",
		)
	})

	it("a month runs from the 1st to the next 1st, across the year end", () => {
		const dec = monthlyPeriod(new Date("2026-12-15T12:00:00Z"))
		expect(dec.key).toBe("monthly:2026-12")
		expect(dec.end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
	})

	it("rotates types week to week and month to month, never weight loss weekly", () => {
		const types = [0, 1, 2, 3, 4, 5].map(
			(i) => weeklyPeriod(new Date(Date.UTC(2026, 9, 5 + 7 * i))).type,
		)
		expect(types[0]).not.toBe(types[1])
		expect(types.slice(0, 3)).toEqual(types.slice(3, 6))
		expect(types).not.toContain("weight_loss")
		const months = [0, 1, 2, 3].map(
			(i) => monthlyPeriod(new Date(Date.UTC(2026, 9 + i, 1))).type,
		)
		expect(new Set(months).size).toBe(4)
	})

	it("always lines up this and next period, with distinct keys", () => {
		const ps = recurringPeriods(new Date("2026-10-07T10:00:00Z"))
		expect(ps.map((p) => p.key)).toEqual([
			"weekly:2026-10-05",
			"weekly:2026-10-12",
			"monthly:2026-10",
			"monthly:2026-11",
		])
	})
})

describe("recurring tournaments (DB)", () => {
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("creates each period once however often it runs", async () => {
		const db = await getTestDb()
		const now = new Date("2026-10-07T10:00:00Z")
		expect((await ensureRecurringTournaments(db, now)).created).toBe(4)
		expect((await ensureRecurringTournaments(db, now)).created).toBe(0)
		// the next day only adds nothing, the next week adds one
		expect(
			(await ensureRecurringTournaments(db, new Date(now.getTime() + DAY)))
				.created,
		).toBe(0)
		expect(
			(await ensureRecurringTournaments(db, new Date(now.getTime() + 7 * DAY)))
				.created,
		).toBe(1)
		const rows = await db.select().from(tournaments)
		expect(rows).toHaveLength(5)
		expect(rows.every((r) => r.creatorId === null && r.systemKey)).toBe(true)
	})

	it("resolves a system tournament and posts the winner to the feed", async () => {
		const db = await getTestDb()
		await db
			.insert(users)
			.values({ id: "sys-w", email: "sys-w@sp.test", name: "Winner" })
		const now = new Date("2026-10-12T00:30:00Z")
		await ensureRecurringTournaments(db, new Date("2026-10-05T10:00:00Z"))
		const [week] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.systemKey, "weekly:2026-10-05"))
		await db
			.insert(tournamentParticipants)
			.values({ tournamentId: week.id, userId: "sys-w" })
		// only a streak week can be scored with a check-in
		await db
			.update(tournaments)
			.set({ type: "streak" })
			.where(eq(tournaments.id, week.id))
		await db.insert(dailyCheckins).values({
			userId: "sys-w",
			date: new Date("2026-10-07T08:00:00Z"),
			streakCount: 3,
		})
		const ai = {
			generateVictoryMessage: async () => "Well done",
		} as unknown as AIService
		expect((await resolveDueTournaments(ai, now)).resolved).toBeGreaterThan(0)
		const [done] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, week.id))
		expect(done.winnerId).toBe("sys-w")
		const posts = await db.select().from(socialPosts)
		expect(posts.map((p) => p.userId)).toEqual(["sys-w"])
		expect((posts[0].content as { text: string }).text).toContain(week.name)
	})
})
