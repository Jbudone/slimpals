// DB-backed pieces of the scheduler (gh-122): the scheduled_job_runs claim,
// the nightly gym job's "active gyms" target set, tournament auto-resolve,
// the real job list end to end with a stub AI, and the admin endpoints.
import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	challenges,
	dailyCheckins,
	invites,
	scheduledJobRuns,
	sessions,
	tournamentParticipants,
	tournaments,
	userGyms,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { findActiveGymUserIds } from "../../server/services/gym/content.js"
import { createScheduler } from "../../server/services/scheduler/index.js"
import { buildScheduledJobs } from "../../server/services/scheduler/jobs.js"
import { createDbRunStore } from "../../server/services/scheduler/store.js"
import { resolveDueTournaments } from "../../server/services/tournaments/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const DAY = 24 * 60 * 60 * 1000
let aiCalls: string[] = []

const stubAI = {
	generateMonthlyChallenge: async () => {
		aiCalls.push("challenge")
		return {
			title: "Stub Challenge",
			description: "stub",
			theme: "wellness",
			goals: [],
		}
	},
	generateWeeklySprint: async () => {
		aiCalls.push("sprint")
		return { title: "Stub Sprint", tasks: [] }
	},
	generateWeeklyInspiration: async () => {
		aiCalls.push("inspiration")
		return "Keep going!"
	},
	generateNpcDialogs: async () => {
		aiCalls.push("dialog")
		return []
	},
	generateGymEvent: async () => {
		aiCalls.push("event")
		throw new Error("no events in this test")
	},
	generateNpcPortrait: async () => null,
	generateVictoryMessage: async (name: string) => {
		aiCalls.push("victory")
		return `${name} wins`
	},
} as unknown as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

const quiet = { log: () => {}, error: () => {} }

async function addUser(id: string) {
	const db = await getTestDb()
	await db.insert(users).values({ id, email: `${id}@sp.test`, name: id })
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	aiCalls = []
})

afterAll(async () => {
	await closeTestDb()
})

describe("createDbRunStore", () => {
	it("lets exactly one of two racing claims win a period", async () => {
		const store = createDbRunStore(await getTestDb())
		const now = new Date("2026-10-01T00:05:00Z")
		const results = await Promise.all([
			store.claim("job-a", "2026-10", null, now, "schedule"),
			store.claim("job-a", "2026-10", null, now, "schedule"),
			store.claim("job-a", "2026-10", null, now, "schedule"),
		])
		expect(results.filter((r) => r === 1)).toHaveLength(1)
		expect(results.filter((r) => r === null)).toHaveLength(2)
	})

	it("re-claims only from the row the caller saw, and ignores a stale finish", async () => {
		const db = await getTestDb()
		const store = createDbRunStore(db)
		const t0 = new Date("2026-10-02T00:20:00Z")
		expect(await store.claim("job-b", "2026-10-02", null, t0, "schedule")).toBe(
			1,
		)
		await store.finish(
			"job-b",
			"2026-10-02",
			1,
			{ status: "failed", error: "boom" },
			t0,
		)
		const seen = await store.get("job-b", "2026-10-02")
		expect(seen).toMatchObject({ status: "failed", attempts: 1 })

		const t1 = new Date("2026-10-02T01:30:00Z")
		const [a, b] = await Promise.all([
			store.claim("job-b", "2026-10-02", seen, t1, "schedule"),
			store.claim("job-b", "2026-10-02", seen, t1, "schedule"),
		])
		expect([a, b].sort()).toEqual([2, null].sort())

		// The old attempt finishing late must not overwrite attempt 2.
		await store.finish(
			"job-b",
			"2026-10-02",
			1,
			{ status: "ok", result: {} },
			t1,
		)
		expect(await store.get("job-b", "2026-10-02")).toMatchObject({
			status: "running",
			attempts: 2,
		})
		await store.finish(
			"job-b",
			"2026-10-02",
			2,
			{ status: "ok", result: { generated: 3 } },
			t1,
		)
		const latest = await store.latest(["job-b", "job-none"])
		expect(latest.get("job-b")).toMatchObject({
			status: "ok",
			attempts: 2,
			result: { generated: 3 },
			error: null,
		})
		expect(latest.has("job-none")).toBe(false)
	})
})

describe("findActiveGymUserIds", () => {
	it("targets gyms with recent activity, not just recently created ones", async () => {
		const db = await getTestDb()
		const now = new Date()
		const old = new Date(now.getTime() - 60 * DAY)
		const recent = new Date(now.getTime() - 2 * DAY)
		const stale = new Date(now.getTime() - 20 * DAY)

		for (const id of [
			"u-new",
			"u-opened",
			"u-visited",
			"u-checkin",
			"u-session",
			"u-dormant",
			"u-oldcheckin",
		]) {
			await addUser(id)
		}
		await db.insert(userGyms).values([
			{ userId: "u-new", name: "New", createdAt: recent },
			{
				userId: "u-opened",
				name: "Opened",
				createdAt: old,
				lastOpenAt: recent,
			},
			{
				userId: "u-visited",
				name: "Visited",
				createdAt: old,
				lastGymVisitDate: recent,
			},
			{ userId: "u-checkin", name: "Checkin", createdAt: old },
			{ userId: "u-session", name: "Session", createdAt: old },
			{
				userId: "u-dormant",
				name: "Dormant",
				createdAt: old,
				lastOpenAt: stale,
				lastGymVisitDate: stale,
			},
			{ userId: "u-oldcheckin", name: "Old checkin", createdAt: old },
		])
		await db.insert(dailyCheckins).values([
			{ userId: "u-checkin", date: recent, streakCount: 1 },
			{ userId: "u-oldcheckin", date: stale, streakCount: 1 },
		])
		await db.insert(sessions).values([
			{
				id: "s-active",
				token: "tok-active",
				userId: "u-session",
				expiresAt: new Date(now.getTime() + 7 * DAY),
				createdAt: old,
				updatedAt: recent,
			},
			{
				id: "s-dormant",
				token: "tok-dormant",
				userId: "u-dormant",
				expiresAt: new Date(now.getTime() + 7 * DAY),
				createdAt: stale,
				updatedAt: stale,
			},
		])

		const ids = await findActiveGymUserIds(db, now)
		expect(ids.sort()).toEqual(
			["u-checkin", "u-new", "u-opened", "u-session", "u-visited"].sort(),
		)
	})
})

describe("resolveDueTournaments", () => {
	async function seedTournament(name: string, endDate: Date) {
		const db = await getTestDb()
		const [{ id }] = await db
			.insert(tournaments)
			.values({
				name,
				creatorId: "t-alice",
				type: "streak",
				startDate: new Date(endDate.getTime() - 7 * DAY),
				endDate,
			})
			.$returningId()
		await db
			.insert(tournamentParticipants)
			.values({ tournamentId: id, userId: "t-alice" })
		return id
	}

	it("resolves ended tournaments once, without anyone opening the leaderboard", async () => {
		const db = await getTestDb()
		await addUser("t-alice")
		const now = new Date()
		const endedId = await seedTournament("Ended", new Date(now.getTime() - DAY))
		const runningId = await seedTournament(
			"Running",
			new Date(now.getTime() + DAY),
		)
		await db.insert(dailyCheckins).values({
			userId: "t-alice",
			date: new Date(now.getTime() - 3 * DAY),
			streakCount: 4,
		})

		const [a, b] = await Promise.all([
			resolveDueTournaments(stubAI, now),
			resolveDueTournaments(stubAI, now),
		])
		expect(a.resolved + b.resolved).toBe(1)
		expect(aiCalls.filter((c) => c === "victory")).toHaveLength(1)

		const [ended] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, endedId))
		expect(ended.resolvedAt).not.toBeNull()
		expect(ended.winnerId).toBe("t-alice")
		const [running] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, runningId))
		expect(running.resolvedAt).toBeNull()

		await resolveDueTournaments(stubAI, now)
		expect(aiCalls.filter((c) => c === "victory")).toHaveLength(1)
	})
})

describe("scheduled jobs end to end (stub AI, real DB)", () => {
	it("a tick generates what is due once; the next tick and a restart generate nothing", async () => {
		const db = await getTestDb()
		await addUser("e2e-user")
		// A Wednesday afternoon: every job's window for its period is open.
		const now = new Date("2026-10-07T15:00:00Z")
		const make = () =>
			createScheduler({
				jobs: buildScheduledJobs(stubAI, db),
				store: createDbRunStore(db),
				now: () => now,
				log: quiet,
			})

		const scheduler = make()
		await scheduler.tick()
		const first = [...aiCalls].sort()
		// No gyms, so the nightly gym job makes no AI calls.
		expect(first).toEqual(["challenge", "inspiration", "sprint"])
		const [challenge] = await db.select().from(challenges)
		expect(challenge).toMatchObject({ month: 10, year: 2026 })
		const statuses = await scheduler.status()
		for (const s of statuses) {
			expect(s.lastRun?.status, s.key).toBe("ok")
		}

		await scheduler.tick()
		await make().tick() // a restart in the same periods
		expect([...aiCalls].sort()).toEqual(first)
		const rows = await db.select().from(scheduledJobRuns)
		expect(rows.map((r) => `${r.job}:${r.period}`).sort()).toEqual([
			"monthly-challenge:2026-10",
			"nightly-gym-content:2026-10-07",
			"tournament-resolve:interval",
			"weekly-inspiration:week-2026-10-05",
			"weekly-sprints:week-2026-10-05",
		])
	})
})

describe("admin scheduler endpoints", () => {
	let inviteN = 0
	async function signUp(email: string, admin: boolean) {
		const db = await getTestDb()
		const code = `SCHED-INVITE-${++inviteN}`
		if (
			!(await db.select().from(users).where(eq(users.id, "inviter"))).length
		) {
			await addUser("inviter")
		}
		await db.insert(invites).values({
			code,
			createdByUserId: "inviter",
			expiresAt: new Date(Date.now() + DAY),
		})
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: email,
			email,
			password: "Password1!",
			inviteCode: code,
		})
		const cookies = res.headers["set-cookie"] as unknown as string[]
		if (admin) {
			await db
				.update(users)
				.set({ isAdmin: true })
				.where(eq(users.id, res.body.user.id))
		}
		return cookies.join("; ")
	}

	it("is admin only", async () => {
		const cookie = await signUp("plain@sp.test", false)
		const res = await request(app)
			.get("/api/admin/scheduler")
			.set("Cookie", cookie)
		expect(res.status).toBe(403)
		const run = await request(app)
			.post("/api/admin/scheduler/tournament-resolve/run")
			.set("Cookie", cookie)
		expect(run.status).toBe(403)
	})

	it("lists every job and runs one on demand", async () => {
		const cookie = await signUp("boss@sp.test", true)
		const res = await request(app)
			.get("/api/admin/scheduler")
			.set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body.enabled).toBe(false) // never on under Vitest
		expect(res.body.jobs.map((j: { key: string }) => j.key)).toEqual([
			"monthly-challenge",
			"weekly-sprints",
			"weekly-inspiration",
			"nightly-gym-content",
			"tournament-resolve",
		])

		const run = await request(app)
			.post("/api/admin/scheduler/tournament-resolve/run")
			.set("Cookie", cookie)
		expect(run.status).toBe(200)
		expect(run.body).toEqual({
			status: "ok",
			result: { resolved: 0, failed: 0 },
		})

		const after = await request(app)
			.get("/api/admin/scheduler")
			.set("Cookie", cookie)
		const sweep = after.body.jobs.find(
			(j: { key: string }) => j.key === "tournament-resolve",
		)
		expect(sweep.lastRun).toMatchObject({ status: "ok", trigger: "manual" })

		const missing = await request(app)
			.post("/api/admin/scheduler/nope/run")
			.set("Cookie", cookie)
		expect(missing.status).toBe(404)
	})
})
