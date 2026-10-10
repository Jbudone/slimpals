import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { gymRewards, invites, userGyms, users } from "../../server/db/schema.js"
import { getStoryDto, markBeatSeen } from "../../server/services/gym/story.js"
import {
	GUEST_BEATS,
	GUEST_MINUTES,
	MIN_BEAT_GAP_HOURS,
	priorFinaleRecap,
	SPEAKERS,
	STORIES,
	STORY,
	STORY_GUESTS,
	storyContext,
	storyFinaleOf,
	storyFor,
	storyGuestNow,
	storyState,
} from "../../shared/gym3d/story.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const HOUR = 3_600_000
const t0 = new Date("2026-10-04T10:00:00Z")

describe("the story's beats", () => {
	it("are well formed, in order, and keep to the tone rules, in every campaign", () => {
		const all = Object.values(STORIES).flat()
		// ids are unique across campaigns too
		expect(new Set(all.map((b) => b.id)).size).toBe(all.length)
		for (const beats of Object.values(STORIES))
			for (let i = 1; i < beats.length; i++)
				expect(beats[i].level).toBeGreaterThanOrEqual(beats[i - 1].level)
		for (const b of all) {
			expect(b.lines.length).toBeGreaterThanOrEqual(3)
			expect(b.lines.length).toBeLessThanOrEqual(6)
			expect(b.recap.length).toBeGreaterThan(10)
			for (const l of b.lines) {
				expect(l.who in SPEAKERS).toBe(true)
				expect(l.text.length).toBeLessThanOrEqual(100)
				expect(l.text).not.toContain("!")
				expect(l.text).not.toMatch(/weight|\bfat\b|lazy|skinny|diet|belly/i)
			}
		}
	})
})

describe("campaign one's threads", () => {
	it("every chapter belongs to a thread and each thread comes back", () => {
		const count = new Map<string, number>()
		for (const b of STORY) {
			expect(b.thread, b.id).toBeTruthy()
			count.set(b.thread ?? "", (count.get(b.thread ?? "") ?? 0) + 1)
		}
		for (const [thread, n] of count) expect(n, thread).toBeGreaterThanOrEqual(2)
		// one chapter per level up to the Open
		const levels = STORY.filter((b) => b.level < 17).map((b) => b.level)
		expect(levels).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
	})
})

describe("campaign stories", () => {
	it("each campaign has its own, the finale is its last chapter, later ones have none yet", () => {
		expect(storyFor(1)).toBe(STORY)
		expect(storyFor(2)[0].id).toBe("c2-arrival")
		expect(storyFinaleOf(1)).toBe("a3-finale")
		expect(storyFinaleOf(2)).toBe("c2-graduation")
		expect(storyFor(3)[0].id).toBe("c3-arrival")
		expect(storyFinaleOf(3)).toBe("c3-harbour-lights")
		expect(storyFor(4)[0].id).toBe("c4-return")
		expect(storyFinaleOf(4)).toBe("c4-street-party")
		expect(storyFor(5)[0].id).toBe("c5-reunion")
		expect(storyFinaleOf(5)).toBe("c5-finish")
		expect(storyFor(6)[0].id).toBe("c6-return")
		expect(storyFinaleOf(6)).toBe("c6-regatta")
		expect(storyFor(7)[0].id).toBe("c7-notice")
		expect(storyFinaleOf(7)).toBe("c7-final")
		expect(storyFor(8)[0].id).toBe("c8-week")
		expect(storyFinaleOf(8)).toBe("c8-summer")
		expect(storyFor(9)[0].id).toBe("c9-dark")
		expect(storyFinaleOf(9)).toBe("c9-light")
		expect(storyFor(10)[0].id).toBe("c10-spade")
		expect(storyFinaleOf(10)).toBe("c10-buried")
		expect(storyFor(11)).toEqual([])
		expect(storyFinaleOf(11)).toBeNull()
		// campaign two plays from gym level 1 through the same state rules
		const c2 = storyFor(2)
		expect(storyState(1, [], t0, null, c2).pending?.id).toBe("c2-arrival")
		expect(storyState(0, [], t0, null, c2).pending).toBeNull()
	})
})

describe("which chapter waits", () => {
	it("opens the first at its level, never before", () => {
		expect(storyState(0, [], t0).pending).toBeNull()
		expect(storyState(1, [], t0).pending?.id).toBe(STORY[0].id)
		expect(storyState(0, [], t0).nextLevel).toBe(STORY[0].level)
	})

	it("goes one at a time, in order, with no time gap: the level is the pacing", () => {
		expect(MIN_BEAT_GAP_HOURS).toBe(0)
		const seen = [{ id: STORY[0].id, at: t0 }]
		// right after the first, with the level high enough: the next one, not one further on
		const now = storyState(20, seen, t0)
		expect(now.pending?.id).toBe(STORY[1].id)
		expect(now.log.map((b) => b.id)).toEqual([STORY[0].id])
		// the level still gates it
		const low = storyState(STORY[1].level - 1, seen, t0)
		expect(low.pending).toBeNull()
		expect(low.nextLevel).toBe(STORY[1].level)
		// a big jump plays the chapters in turn, one pending at a time
		const two = [...seen, { id: STORY[1].id, at: t0 }]
		expect(storyState(20, two, t0).pending?.id).toBe(STORY[2].id)
	})

	it("gives a title card its place in the story, what happened before and when the next one opens", () => {
		const first = storyState(20, [], t0)
		const c0 = storyContext(STORY, first.pending, first.log)
		expect(c0.chapter).toEqual({ n: 1, of: STORY.length })
		expect(c0.previously).toBeNull()
		expect(c0.after).toBe(STORY[1].level)
		const seen = [{ id: STORY[0].id, at: t0 }]
		const second = storyState(20, seen, t0)
		const c1 = storyContext(STORY, second.pending, second.log)
		expect(c1.chapter?.n).toBe(2)
		expect(c1.previously).toBe(STORY[0].recap)
		// the first chapter of a later street starts "Previously" from the last street's finale
		const first2 = storyState(20, [], t0, null, storyFor(2))
		const c2 = storyContext(
			storyFor(2),
			first2.pending,
			first2.log,
			priorFinaleRecap(2),
		)
		expect(c2.previously).toBe(STORY[STORY.length - 1].recap)
		expect(priorFinaleRecap(1)).toBeNull()
		expect(priorFinaleRecap(3)).toBe(storyFor(2)[storyFor(2).length - 1].recap)
		// nothing waiting: nothing to show
		expect(storyContext(STORY, null, [])).toEqual({
			chapter: null,
			previously: null,
			after: null,
		})
	})

	it("ends cleanly when everything has been seen", () => {
		const seen = STORY.map((b, i) => ({
			id: b.id,
			at: new Date(t0.getTime() + i * 20 * HOUR),
		}))
		const end = new Date(t0.getTime() + 500 * HOUR)
		const s = storyState(99, seen, end)
		expect(s.pending).toBeNull()
		expect(s.nextLevel).toBeNull()
		expect(s.log).toHaveLength(STORY.length)
	})
})

describe("story guests", () => {
	it("only come from real chapters and have dry lines of their own", () => {
		for (const id of Object.keys(GUEST_BEATS))
			expect(
				Object.values(STORIES)
					.flat()
					.some((b) => b.id === id),
			).toBe(true)
		for (const g of Object.values(STORY_GUESTS)) {
			expect(g.lines.length).toBeGreaterThanOrEqual(3)
			for (const l of g.lines) {
				expect(l).not.toContain("!")
				expect(l.length).toBeLessThanOrEqual(60)
			}
		}
	})

	it("stay for a while after the chapter was seen, the latest one winning", () => {
		const seen = (id: string, minutesAgo: number) => ({
			id,
			seenAt: new Date(t0.getTime() - minutesAgo * 60_000).toISOString(),
		})
		expect(storyGuestNow([], t0)).toBeNull()
		// a chapter without a guest brings nobody
		expect(storyGuestNow([seen("a1-opening", 1)], t0)).toBeNull()
		expect(storyGuestNow([seen("a1-coat", 1)], t0)?.who).toBe("victor")
		expect(storyGuestNow([seen("a1-samples", 1)], t0)?.who).toBe("barry")
		// they leave after the stay
		expect(storyGuestNow([seen("a1-coat", GUEST_MINUTES + 1)], t0)).toBeNull()
		// the most recent guest chapter wins
		expect(
			storyGuestNow([seen("a1-coat", 8), seen("a1-samples", 2)], t0)?.who,
		).toBe("barry")
		// a time in the future (clock skew) is ignored
		expect(storyGuestNow([seen("a1-coat", -5)], t0)).toBeNull()
	})
})

const { createApp } = await import("../../server/app.js")
const app = createApp()

let inviteN = 0
async function setup() {
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "adm@x.test", name: "A" })
		.onDuplicateKeyUpdate({ set: { name: "A" } })
	const code = `STORY-${++inviteN}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({
			name: "Story",
			email: `story${inviteN}@slimpals.test`,
			password: "Password1!",
			inviteCode: code,
		})
	const cookies = res.headers["set-cookie"] as string[]
	const cookie = Array.isArray(cookies) ? cookies.join("; ") : cookies
	await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
	const [gym] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, res.body.user.id))
	return { cookie, gymId: gym.id, db }
}

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
})
afterAll(async () => {
	await closeTestDb()
})

describe("the story route", () => {
	it("shows the waiting chapter, records it once and holds the next back", async () => {
		const { cookie, gymId, db } = await setup()
		await db.update(userGyms).set({ level: 1 }).where(eq(userGyms.id, gymId))
		const first = await request(app).get("/api/gym/story").set("Cookie", cookie)
		expect(first.status).toBe(200)
		expect(first.body.pending.id).toBe(STORY[0].id)
		expect(first.body.log).toEqual([])
		// only the waiting chapter can be marked
		await request(app)
			.post(`/api/gym/story/${STORY[1].id}/seen`)
			.set("Cookie", cookie)
			.expect(409)
		await request(app)
			.post("/api/gym/story/nope/seen")
			.set("Cookie", cookie)
			.expect(409)
		const done = await request(app)
			.post(`/api/gym/story/${STORY[0].id}/seen`)
			.set("Cookie", cookie)
		expect(done.status).toBe(200)
		expect(done.body.pending).toBeNull()
		expect(done.body.log.map((c: { id: string }) => c.id)).toEqual([
			STORY[0].id,
		])
		expect(done.body.nextLevel).toBe(STORY[1].level)
		// seeing it again changes nothing
		await request(app)
			.post(`/api/gym/story/${STORY[0].id}/seen`)
			.set("Cookie", cookie)
			.expect(409)
		const rows = await db.select().from(gymRewards)
		expect(rows.map((r) => r.source)).toEqual([`story:${STORY[0].id}`])
	})

	it("needs a session", async () => {
		await request(app).get("/api/gym/story").expect(401)
	})

	it("opens the next chapter at once when the level is there, with its place in the story, through the service", async () => {
		const { gymId, db } = await setup()
		await db.update(userGyms).set({ level: 10 }).where(eq(userGyms.id, gymId))
		const now = new Date()
		await markBeatSeen(db, gymId, STORY[0].id, now)
		const dto = await getStoryDto(db, gymId, now)
		expect(dto.pending?.id).toBe(STORY[1].id)
		expect(dto.chapter).toEqual({ n: 2, of: STORY.length })
		expect(dto.previously).toBe(STORY[0].recap)
		expect(dto.after).toBe(STORY[2].level)
	})
})
