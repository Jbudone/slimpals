import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	dailyCheckins,
	gymCosmetics,
	invites,
	socialPosts,
	userGyms,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	claimTrackStep,
	listCosmetics,
} from "../../server/services/gym/rewardTrack.js"
import {
	claimBlock,
	daysInMonth,
	monthKey,
	stepReward,
	TRACK,
	trackSteps,
} from "../../shared/gym3d/rewardTrack.js"
import type { GymRewardTrackDto } from "../../shared/types.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) => `Congrats ${userName}!`,
	generateWeeklyInspiration: async () => "Keep going!",
	generateNpcDialogs: async () => [],
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

describe("reward track rules", () => {
	it("has a step for every day of the month, with big ones every seventh and last", () => {
		expect(daysInMonth("2026-02")).toBe(28)
		expect(daysInMonth("2026-10")).toBe(31)
		expect(monthKey(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10")
		expect(monthKey(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11")
		const steps = trackSteps("2026-10")
		expect(steps).toHaveLength(31)
		expect(steps.filter((s) => s.milestone).map((s) => s.n)).toEqual([
			7, 14, 21, 28, 31,
		])
		expect(stepReward(7, 31).coins).toBe(TRACK.milestoneCoins)
		expect(stepReward(2, 31).coins).toBe(TRACK.stepCoins)
	})

	it("October's first three big steps give a Halloween cosmetic, every month has one", () => {
		const oct = trackSteps("2026-10")
		expect(oct.filter((s) => s.reward.cosmetic).map((s) => s.n)).toEqual([
			7, 14, 21,
		])
		expect(oct[6].reward.cosmetic).toBe("halloween_lantern")
		for (let m = 1; m <= 12; m++) {
			const key = `2026-${String(m).padStart(2, "0")}`
			expect(trackSteps(key).some((s) => s.reward.cosmetic)).toBe(true)
		}
	})

	it("blocks a second step the same day, no check-in and a finished track", () => {
		const ok = { claimed: 3, claimedToday: false, checkedIn: true, total: 31 }
		expect(claimBlock(ok)).toBeNull()
		expect(claimBlock({ ...ok, claimedToday: true })).toMatch(/tomorrow/)
		expect(claimBlock({ ...ok, checkedIn: false })).toMatch(/Check in/)
		expect(claimBlock({ ...ok, claimed: 31 })).toMatch(/done/)
	})
})

describe("reward track route", () => {
	let n = 0
	async function login() {
		const db = await getTestDb()
		const code = `TRACK-INVITE-${++n}`
		await db.insert(invites).values({
			code,
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})
		const res = await request(app)
			.post("/api/auth/sign-up/email")
			.send({
				name: "Tester",
				email: `track${n}@slimpals.test`,
				password: "Password1!",
				inviteCode: code,
			})
		const c = res.headers["set-cookie"] as string[]
		const cookie = Array.isArray(c) ? c.join("; ") : c
		const userId = res.body.user.id as string
		await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
		await request(app).get("/api/gym/layout").set("Cookie", cookie).expect(200)
		return { cookie, userId }
	}

	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
		const db = await getTestDb()
		await db.insert(users).values({
			id: "admin-001",
			email: "admin@slimpals.test",
			name: "Admin",
		})
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("pays one step a day, only after a check-in", async () => {
		const { cookie, userId } = await login()
		const db = await getTestDb()
		const claim = () =>
			request(app).post("/api/gym/reward-track/claim").set("Cookie", cookie)

		const before = (
			await request(app).get("/api/gym/reward-track").set("Cookie", cookie)
		).body as GymRewardTrackDto
		expect(before.canClaim).toBe(false)
		expect(before.claimed).toBe(0)
		await claim().expect(409)

		await db.insert(dailyCheckins).values({ userId, date: new Date() })
		const [g0] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, userId))
		const res = await claim().expect(200)
		expect(res.body.paid.n).toBe(1)
		// the first step earns the Track badge, once
		expect(res.body.newBadges.map((b: { key: string }) => b.key)).toEqual([
			"track_first",
		])
		// ...and, with auto-share on (the default), posts it to the feed
		const posts = await db
			.select()
			.from(socialPosts)
			.where(eq(socialPosts.userId, userId))
		expect(posts.map((p) => p.type)).toEqual(["milestone"])
		expect((posts[0].content as { badgeKey: string }).badgeKey).toBe(
			"track_first",
		)
		expect(res.body.track.claimed).toBe(1)
		expect(res.body.track.claimedToday).toBe(true)
		const [g1] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, userId))
		expect(g1.coins - g0.coins).toBe(res.body.paid.reward.coins)
		expect(g1.sweat - g0.sweat).toBe(res.body.paid.reward.sweat)

		// a second tap, even racing ones, pays nothing more today
		await claim().expect(409)
		const [g2] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, userId))
		expect(g2.coins).toBe(g1.coins)
	})
})

describe("cosmetics from the track", () => {
	let n = 0
	beforeAll(async () => {
		await resetSchema()
	})
	beforeEach(async () => {
		await truncateAll()
		const db = await getTestDb()
		await db.insert(users).values({
			id: "admin-001",
			email: "admin@slimpals.test",
			name: "Admin",
		})
	})
	afterAll(async () => {
		await closeTestDb()
	})

	it("a big step grants its cosmetic once and the inventory lists it", async () => {
		const db = await getTestDb()
		const code = `COSM-INVITE-${++n}`
		await db.insert(invites).values({
			code,
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})
		const res = await request(app).post("/api/auth/sign-up/email").send({
			name: "Tester",
			email: "cosm@slimpals.test",
			password: "Password1!",
			inviteCode: code,
		})
		const c = res.headers["set-cookie"] as string[]
		const cookie = Array.isArray(c) ? c.join("; ") : c
		const userId = res.body.user.id as string
		await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
		await request(app).get("/api/gym/layout").set("Cookie", cookie).expect(200)
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, userId))

		// claim steps 1..7 of October on seven different days
		for (let day = 1; day <= 7; day++) {
			const now = new Date(Date.UTC(2026, 9, day, 12))
			await db.insert(dailyCheckins).values({ userId, date: now })
			const r = await claimTrackStep(db, gym.id, userId, now)
			expect(r.paid.n).toBe(day)
			if (day < 7) expect(await listCosmetics(db, gym.id)).toHaveLength(0)
		}
		const owned = await listCosmetics(db, gym.id)
		expect(owned.map((o) => o.key)).toEqual(["halloween_lantern"])
		expect(owned[0].name).toBe("Jack-o'-lantern")
		expect((await db.select().from(gymCosmetics)).map((r) => r.source)).toEqual(
			["track:2026-10:7"],
		)

		const api = await request(app)
			.get("/api/gym/cosmetics")
			.set("Cookie", cookie)
		expect(api.status).toBe(200)
		expect(api.body).toHaveLength(1)

		// an owned outfit can be taken off and put on again; decor cannot be worn
		await db.insert(gymCosmetics).values({
			gymId: gym.id,
			cosmeticKey: "halloween_hat",
			source: "test",
		})
		const wear = (key: string, worn: boolean) =>
			request(app)
				.post(`/api/gym/cosmetics/${key}/wear`)
				.set("Cookie", cookie)
				.send({ worn })
		const hat = async () =>
			(await listCosmetics(db, gym.id)).find((o) => o.key === "halloween_hat")
		expect((await hat())?.worn).toBe(true)
		await wear("halloween_hat", false).expect(200)
		expect((await hat())?.worn).toBe(false)
		await wear("halloween_hat", true).expect(200)
		expect((await hat())?.worn).toBe(true)
		await wear("halloween_lantern", false).expect(400)
		await wear("challenge_trophy", false).expect(400)
	})
})
