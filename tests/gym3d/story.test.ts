import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { gymRewards, invites, userGyms, users } from "../../server/db/schema.js"
import { getStoryDto, markBeatSeen } from "../../server/services/gym/story.js"
import {
	MIN_BEAT_GAP_HOURS,
	SPEAKERS,
	STORY,
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
	it("are well formed, in order, and keep to the tone rules", () => {
		expect(new Set(STORY.map((b) => b.id)).size).toBe(STORY.length)
		for (let i = 1; i < STORY.length; i++)
			expect(STORY[i].level).toBeGreaterThanOrEqual(STORY[i - 1].level)
		for (const b of STORY) {
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

describe("which chapter waits", () => {
	it("opens the first at its level, never before", () => {
		expect(storyState(0, [], t0).pending).toBeNull()
		expect(storyState(1, [], t0).pending?.id).toBe(STORY[0].id)
		expect(storyState(0, [], t0).nextLevel).toBe(STORY[0].level)
	})

	it("goes one at a time, in order, with a gap between chapters", () => {
		const seen = [{ id: STORY[0].id, at: t0 }]
		const soon = new Date(t0.getTime() + (MIN_BEAT_GAP_HOURS - 1) * HOUR)
		// level is high enough but it is too soon
		const early = storyState(20, seen, soon)
		expect(early.pending).toBeNull()
		expect(early.log.map((b) => b.id)).toEqual([STORY[0].id])
		expect(early.nextLevel).toBe(STORY[1].level)
		// later: the next one, not one further on
		const later = new Date(t0.getTime() + MIN_BEAT_GAP_HOURS * HOUR)
		expect(storyState(20, seen, later).pending?.id).toBe(STORY[1].id)
		// the level still gates it
		expect(storyState(STORY[1].level - 1, seen, later).pending).toBeNull()
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

	it("opens the next chapter after the gap and the level, through the service", async () => {
		const { gymId, db } = await setup()
		await db.update(userGyms).set({ level: 10 }).where(eq(userGyms.id, gymId))
		const now = new Date()
		await markBeatSeen(db, gymId, STORY[0].id, now)
		expect((await getStoryDto(db, gymId, now)).pending).toBeNull()
		const later = new Date(now.getTime() + (MIN_BEAT_GAP_HOURS + 1) * HOUR)
		expect((await getStoryDto(db, gymId, later)).pending?.id).toBe(STORY[1].id)
	})
})
