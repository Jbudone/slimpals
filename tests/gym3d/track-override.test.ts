// An admin authors a month of the reward track (#126): validation rules, the
// admin routes, and the player's track showing the authored theme and payouts.
import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
import {
	monthKey,
	stepReward,
	themeOf,
	trackSteps,
	validateTrackOverride,
} from "../../shared/gym3d/rewardTrack.js"
import type { GymRewardTrackDto } from "../../shared/types.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

describe("track override rules", () => {
	it("accepts a theme and per-step payouts, and rejects the rest", () => {
		expect(
			validateTrackOverride(
				{ theme: " Big Month ", steps: { "3": { coins: 100 } } },
				30,
			),
		).toEqual({
			ok: true,
			value: { theme: "Big Month", steps: { "3": { coins: 100 } } },
		})
		for (const bad of [
			null,
			[],
			{ theme: "" },
			{ theme: "x".repeat(41) },
			{ steps: [] },
			{ steps: { "0": { coins: 1 } } },
			{ steps: { "31": { coins: 1 } } },
			{ steps: { "2": { coins: -1 } } },
			{ steps: { "2": { sweat: 1.5 } } },
			{ steps: { "2": { greens: 51 } } },
		])
			expect(validateTrackOverride(bad, 30).ok).toBe(false)
	})

	it("changes only what it names", () => {
		const o = { theme: "Mine", steps: { "2": { coins: 999 } } }
		const base = trackSteps("2026-11")
		const steps = trackSteps("2026-11", o)
		expect(steps[1].reward).toEqual({ ...base[1].reward, coins: 999 })
		expect(steps[0]).toEqual(base[0])
		expect(themeOf("2026-11", o)).toBe("Mine")
		expect(themeOf("2026-11")).toBe("Gratitude")
		expect(stepReward(7, 30, "2026-11").cosmetic).toBe("harvest_basket")
	})
})

describe("track override routes", () => {
	let n = 0
	async function login(admin: boolean) {
		const db = await getTestDb()
		const code = `TRACK-OVR-${++n}`
		await db.insert(invites).values({
			code,
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})
		const res = await request(app)
			.post("/api/auth/sign-up/email")
			.send({
				name: "Tester",
				email: `ovr${n}@slimpals.test`,
				password: "Password1!",
				inviteCode: code,
			})
		const c = res.headers["set-cookie"] as string[]
		const userId = res.body.user.id as string
		if (admin)
			await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId))
		return { cookie: Array.isArray(c) ? c.join("; ") : c, userId }
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

	it("is for admins only, and refuses bad months and bad payouts", async () => {
		const player = await login(false)
		await request(app)
			.put("/api/admin/reward-track/2026-11")
			.set("Cookie", player.cookie)
			.send({ theme: "x" })
			.expect(403)
		const admin = await login(true)
		await request(app)
			.put("/api/admin/reward-track/nope")
			.set("Cookie", admin.cookie)
			.send({ theme: "x" })
			.expect(400)
		await request(app)
			.put("/api/admin/reward-track/2026-11")
			.set("Cookie", admin.cookie)
			.send({ steps: { "2": { coins: -5 } } })
			.expect(400)
		await request(app)
			.get("/api/admin/reward-track/nope")
			.set("Cookie", admin.cookie)
			.expect(400)
	})

	it("authors this month, the player's track follows, and clearing restores it", async () => {
		const admin = await login(true)
		const month = monthKey()
		const put = await request(app)
			.put(`/api/admin/reward-track/${month}`)
			.set("Cookie", admin.cookie)
			.send({
				theme: "Admin's Month",
				steps: { "1": { coins: 777, sweat: 4 } },
			})
			.expect(200)
		expect(put.body.theme).toBe("Admin's Month")
		expect(put.body.steps[0].reward).toMatchObject({ coins: 777, sweat: 4 })
		const got = await request(app)
			.get(`/api/admin/reward-track/${month}`)
			.set("Cookie", admin.cookie)
			.expect(200)
		expect(got.body.override.theme).toBe("Admin's Month")

		await request(app).get("/api/gym").set("Cookie", admin.cookie).expect(200)
		await request(app)
			.get("/api/gym/layout")
			.set("Cookie", admin.cookie)
			.expect(200)
		const track = (
			await request(app)
				.get("/api/gym/reward-track")
				.set("Cookie", admin.cookie)
		).body as GymRewardTrackDto
		expect(track.theme).toBe("Admin's Month")
		expect(track.steps[0].reward.coins).toBe(777)

		const cleared = await request(app)
			.delete(`/api/admin/reward-track/${month}`)
			.set("Cookie", admin.cookie)
			.expect(200)
		expect(cleared.body.override).toBeNull()
		const after = (
			await request(app)
				.get("/api/gym/reward-track")
				.set("Cookie", admin.cookie)
		).body as GymRewardTrackDto
		expect(after.theme).toBe(themeOf(month))
		expect(after.steps[0].reward.coins).toBe(60)
	})
})
