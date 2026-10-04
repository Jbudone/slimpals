import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymCosmetics,
	gymPlots,
	gymRewards,
	invites,
	userGyms,
	users,
} from "../../server/db/schema.js"
import { CAMPAIGN_FINALE, daysBetween } from "../../shared/gym3d/campaign.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

let inviteN = 0
async function setup() {
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "adm@x.test", name: "A" })
		.onDuplicateKeyUpdate({ set: { name: "A" } })
	const code = `CAMP-${++inviteN}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({
			name: "Camper",
			email: `camper${inviteN}@slimpals.test`,
			password: "Password1!",
			inviteCode: code,
		})
	const cookie = (res.headers["set-cookie"] as string[]).join("; ")
	const userId = res.body.user.id as string
	await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
	const [gym] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, userId))
	return { db, cookie, userId, gym }
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

describe("campaigns", () => {
	it("counts whole days", () => {
		const a = new Date("2026-10-01T10:00:00Z")
		expect(daysBetween(a, new Date("2026-10-04T09:00:00Z"))).toBe(2)
		expect(daysBetween(a, new Date("2026-09-01T00:00:00Z"))).toBe(0)
	})

	it("starts in campaign 1 and cannot be finished before the story is", async () => {
		const { cookie } = await setup()
		const res = await request(app)
			.get("/api/gym/campaign")
			.set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body).toEqual({ campaign: 1, canFinish: false, hall: [] })
		const lay = await request(app).get("/api/gym/layout").set("Cookie", cookie)
		expect(lay.body.campaign).toBe(1)
		await request(app)
			.post("/api/gym/campaign/next")
			.set("Cookie", cookie)
			.expect(409)
		await request(app).get("/api/gym/campaign").expect(401)
	})

	it("archives the gym, starts a fresh one and carries the cosmetics over", async () => {
		const { db, cookie, userId, gym } = await setup()
		await db
			.update(userGyms)
			.set({ level: 17, xp: 14500, coins: 777 })
			.where(eq(userGyms.id, gym.id))
		await db.insert(gymCosmetics).values({
			gymId: gym.id,
			cosmeticKey: "challenge_trophy",
			source: "test",
		})
		await db
			.insert(gymPlots)
			.values({ gymId: gym.id, px: 1, pz: 2, state: "owned" })
		await db.insert(gymRewards).values({
			gymId: gym.id,
			source: `story:${CAMPAIGN_FINALE}`,
			sweat: 0,
			greens: 0,
		})
		expect(
			(await request(app).get("/api/gym/campaign").set("Cookie", cookie)).body
				.canFinish,
		).toBe(true)

		const next = await request(app)
			.post("/api/gym/campaign/next")
			.set("Cookie", cookie)
		expect(next.status).toBe(200)
		expect(next.body.campaign).toBe(2)
		expect(next.body.canFinish).toBe(false)
		expect(next.body.hall).toHaveLength(1)
		expect(next.body.hall[0]).toMatchObject({
			campaign: 1,
			summary: { level: 17, xp: 14500, plots: 1 },
		})

		// the old gym is archived, whole; the new one is fresh and the active one
		const gyms = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, userId))
		expect(gyms).toHaveLength(2)
		const old = gyms.find((g) => g.campaign === 1)
		const fresh = gyms.find((g) => g.campaign === 2)
		expect(old?.archivedAt).not.toBeNull()
		expect(old?.coins).toBe(777)
		expect(fresh?.archivedAt).toBeNull()
		expect(fresh).toMatchObject({ level: 0, xp: 0, name: gym.name })
		expect(
			await db
				.select()
				.from(gymPlots)
				.where(eq(gymPlots.gymId, fresh?.id ?? 0)),
		).toHaveLength(0)
		// the trophy came along
		const cos = await request(app)
			.get("/api/gym/cosmetics")
			.set("Cookie", cookie)
		expect(cos.body.map((c: { key: string }) => c.key)).toContain(
			"challenge_trophy",
		)
		// the story of the new campaign is not finished: no second jump
		await request(app)
			.post("/api/gym/campaign/next")
			.set("Cookie", cookie)
			.expect(409)
		// the layout says which campaign it is, which decides the street's look
		const lay = await request(app).get("/api/gym/layout").set("Cookie", cookie)
		expect(lay.body.campaign).toBe(2)
		// the authored story belongs to campaign one: the new gym has none yet
		const story = await request(app).get("/api/gym/story").set("Cookie", cookie)
		expect(story.body).toMatchObject({
			pending: null,
			log: [],
			nextLevel: null,
		})
		// everything that reads "the gym" now reads the new one
		const wallet = await request(app)
			.get("/api/gym/wallet")
			.set("Cookie", cookie)
		expect(wallet.status).toBe(200)
		expect(wallet.body.level).toBe(0)
	})
})

describe("admin: finish the story", () => {
	it("marks the story finished for an admin, so the next campaign can begin", async () => {
		const { db, cookie, userId } = await setup()
		// a non-admin cannot
		await request(app)
			.post(`/api/admin/users/${userId}/gym/finish-story`)
			.set("Cookie", cookie)
			.expect(403)
		await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId))
		await request(app)
			.post(`/api/admin/users/${userId}/gym/finish-story`)
			.set("Cookie", cookie)
			.expect(200)
		expect(
			(await request(app).get("/api/gym/campaign").set("Cookie", cookie)).body
				.canFinish,
		).toBe(true)
		await request(app)
			.post("/api/gym/campaign/next")
			.set("Cookie", cookie)
			.expect(200)
		// an unknown user has no gym
		await request(app)
			.post("/api/admin/users/nobody/gym/finish-story")
			.set("Cookie", cookie)
			.expect(404)
	})
})
