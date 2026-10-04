import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { gymRewards, invites, userGyms, users } from "../../server/db/schema.js"
import { getStoryDto, markBeatSeen } from "../../server/services/gym/story.js"
import {
	OPEN_DAYS,
	OPEN_START_BEAT,
	openState,
	rivalScore,
} from "../../shared/gym3d/open.js"
import { STORY, storyState } from "../../shared/gym3d/story.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const DAY = 24 * 60 * 60 * 1000
const t0 = new Date("2026-10-04T10:00:00Z")
const at = (days: number) => new Date(t0.getTime() + days * DAY)

describe("the Open's rules", () => {
	it("gives MaxOut a score that grows with the level", () => {
		expect(rivalScore(1)).toBeLessThan(rivalScore(10))
		expect(rivalScore(0)).toBe(rivalScore(1))
	})

	it("is idle, running (rival at an even pace) and then decided", () => {
		const start = { at: t0, xp: 1000, level: 17 }
		const none = openState({ start: null, end: null, xpNow: 5000, now: t0 })
		expect(none.phase).toBe("idle")
		const mid = openState({ start, end: null, xpNow: 1200, now: at(3.5) })
		expect(mid.phase).toBe("running")
		expect(mid.you).toBe(200)
		expect(mid.rival).toBe(Math.floor(rivalScore(17) / 2))
		expect(mid.daysLeft).toBe(4)
		expect(mid.result).toBeNull()
		const winEnd = openState({
			start,
			end: { xp: 1000 + rivalScore(17) },
			xpNow: 99999,
			now: at(OPEN_DAYS),
		})
		expect(winEnd).toMatchObject({ phase: "ended", result: "win", daysLeft: 0 })
		const loseEnd = openState({
			start,
			end: { xp: 1100 },
			xpNow: 99999,
			now: at(OPEN_DAYS + 3),
		})
		// XP earned after the end does not count once it was recorded
		expect(loseEnd).toMatchObject({ phase: "ended", result: "lose", you: 100 })
	})
})

describe("the Open's chapters", () => {
	const seenBefore = STORY.filter((b) => !b.id.startsWith("a3-")).map(
		(b, i) => ({
			id: b.id,
			at: at(-60 + i),
		}),
	)

	it("start by level and time, then wait for the result and skip the other one", () => {
		const start = storyState(17, seenBefore, t0)
		expect(start.pending?.id).toBe(OPEN_START_BEAT)
		const seen = [...seenBefore, { id: OPEN_START_BEAT, at: t0 }]
		// the Open is on: the next chapter waits for it, not for a level
		const during = storyState(30, seen, at(3), null)
		expect(during.pending).toBeNull()
		expect(during.waitingForOpen).toBe(true)
		// a win shows the win chapter, a loss the loss chapter
		expect(storyState(30, seen, at(8), "win").pending?.id).toBe("a3-win")
		expect(storyState(30, seen, at(8), "lose").pending?.id).toBe("a3-lose")
		// the other result's chapter never turns up, the finale follows either
		const afterWin = [...seen, { id: "a3-win", at: at(8) }]
		expect(storyState(30, afterWin, at(9), "win").pending?.id).toBe("a3-finale")
		const afterLose = [...seen, { id: "a3-lose", at: at(8) }]
		expect(storyState(30, afterLose, at(9), "lose").pending?.id).toBe(
			"a3-finale",
		)
		const done = [...afterWin, { id: "a3-finale", at: at(9) }]
		const end = storyState(30, done, at(20), "win")
		expect(end.pending).toBeNull()
		expect(end.nextLevel).toBeNull()
		expect(end.log.map((b) => b.id)).not.toContain("a3-lose")
	})
})

const { createApp } = await import("../../server/app.js")
const app = createApp()
let inviteN = 0
async function setup(xp: number, level = 17) {
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "adm@x.test", name: "A" })
		.onDuplicateKeyUpdate({ set: { name: "A" } })
	const code = `OPEN-${++inviteN}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({
			name: "Open",
			email: `open${inviteN}@slimpals.test`,
			password: "Password1!",
			inviteCode: code,
		})
	const cookie = (res.headers["set-cookie"] as string[]).join("; ")
	await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
	const [gym] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, res.body.user.id))
	await db
		.update(userGyms)
		.set({ xp, level, coins: 1000 })
		.where(eq(userGyms.id, gym.id))
	// everything before act three was seen long ago
	for (const [i, b] of STORY.filter((x) => !x.id.startsWith("a3-")).entries())
		await db.insert(gymRewards).values({
			gymId: gym.id,
			source: `story:${b.id}`,
			sweat: 0,
			greens: 0,
			createdAt: new Date(Date.now() - (80 - i) * DAY),
		})
	return { gymId: gym.id, db, cookie }
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

const coinsOf = async (
	db: Awaited<ReturnType<typeof getTestDb>>,
	gymId: number,
) => (await db.select().from(userGyms).where(eq(userGyms.id, gymId)))[0].coins

describe("a whole Open, through the service", () => {
	it("a win: starts on its chapter, scores the XP gained, pays the win chapter once", async () => {
		const { gymId, db } = await setup(14450)
		const now = new Date()
		const t = (d: number) => new Date(now.getTime() + d * DAY)
		expect((await getStoryDto(db, gymId, now)).pending?.id).toBe(
			OPEN_START_BEAT,
		)
		const started = await markBeatSeen(db, gymId, OPEN_START_BEAT, now)
		expect(started.pending).toBeNull()
		expect(started.open?.phase).toBe("running")
		expect(started.waitingForOpen).toBe(true)
		// XP climbs during the week
		await db
			.update(userGyms)
			.set({ xp: 14450 + 300 })
			.where(eq(userGyms.id, gymId))
		const mid = await getStoryDto(db, gymId, t(3))
		expect(mid.open?.you).toBe(300)
		expect(mid.pending).toBeNull()
		// the week ends with enough XP
		await db
			.update(userGyms)
			.set({ xp: 14450 + rivalScore(17) + 10 })
			.where(eq(userGyms.id, gymId))
		const ended = await getStoryDto(db, gymId, t(OPEN_DAYS + 1))
		expect(ended.open?.result).toBe("win")
		expect(ended.pending?.id).toBe("a3-win")
		const before = await coinsOf(db, gymId)
		const afterWin = await markBeatSeen(db, gymId, "a3-win", t(OPEN_DAYS + 1))
		expect(await coinsOf(db, gymId)).toBe(before + 1500)
		// (claims are stamped by the real clock, so with this injected clock the
		// gap is long over: the loss chapter never comes up, the finale does)
		expect(afterWin.pending?.id).toBe("a3-finale")
		const finale = await getStoryDto(db, gymId, t(OPEN_DAYS + 3))
		expect(finale.pending?.id).toBe("a3-finale")
		await markBeatSeen(db, gymId, "a3-finale", t(OPEN_DAYS + 3))
		const end = await getStoryDto(db, gymId, t(OPEN_DAYS + 9))
		expect(end.pending).toBeNull()
		expect(end.log.map((c) => c.id)).toContain("a3-win")
		expect(end.log.map((c) => c.id)).not.toContain("a3-lose")
		// paying is once: a repeated mark is refused
		await expect(
			markBeatSeen(db, gymId, "a3-win", t(OPEN_DAYS + 9)),
		).rejects.toThrow()
		expect(await coinsOf(db, gymId)).toBe(before + 1500)
	})

	it("a loss: XP earned after the week does not turn it around", async () => {
		const { gymId, db } = await setup(14450)
		const now = new Date()
		const t = (d: number) => new Date(now.getTime() + d * DAY)
		await markBeatSeen(db, gymId, OPEN_START_BEAT, now)
		await db
			.update(userGyms)
			.set({ xp: 14450 + 50 })
			.where(eq(userGyms.id, gymId))
		const ended = await getStoryDto(db, gymId, t(OPEN_DAYS + 1))
		expect(ended.open).toMatchObject({ result: "lose", you: 50 })
		expect(ended.pending?.id).toBe("a3-lose")
		// a burst of XP afterwards changes nothing
		await db
			.update(userGyms)
			.set({ xp: 14450 + 5000 })
			.where(eq(userGyms.id, gymId))
		const later = await getStoryDto(db, gymId, t(OPEN_DAYS + 2))
		expect(later.open).toMatchObject({ result: "lose", you: 50 })
		const before = await coinsOf(db, gymId)
		await markBeatSeen(db, gymId, "a3-lose", t(OPEN_DAYS + 2))
		expect(await coinsOf(db, gymId)).toBe(before + 400)
	})

	it("shows the scoreboard to the player over the route", async () => {
		const { gymId, db, cookie } = await setup(14450)
		await markBeatSeen(db, gymId, OPEN_START_BEAT, new Date())
		const res = await request(app).get("/api/gym/story").set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body.open.phase).toBe("running")
		expect(res.body.waitingForOpen).toBe(true)
		expect(res.body.pending).toBeNull()
	})
})
