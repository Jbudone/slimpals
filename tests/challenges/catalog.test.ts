// Curated challenge cards (#124): the catalog, putting one in a month, the
// AI-down fallback, and the decor a finished one gives.
import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	challenges,
	gymCosmetics,
	invites,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { generateChallengeForMonth } from "../../server/services/challenges/index.js"
import {
	CHALLENGE_CATALOG,
	catalogChallenge,
	catalogForMonth,
} from "../../shared/challenges/catalog.js"
import { cosmeticOf } from "../../shared/gym3d/cosmetics.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const failingAI = {
	generateMonthlyChallenge: async () => {
		throw new Error("model is down")
	},
} as unknown as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: failingAI })

describe("challenge catalog", () => {
	it("cards are whole: three goals, a real decor reward, a tagline and a coach intro", () => {
		expect(CHALLENGE_CATALOG.length).toBeGreaterThanOrEqual(3)
		expect(new Set(CHALLENGE_CATALOG.map((c) => c.key)).size).toBe(
			CHALLENGE_CATALOG.length,
		)
		for (const c of CHALLENGE_CATALOG) {
			expect(c.tagline.length).toBeGreaterThan(5)
			expect(c.coachIntro.length).toBeGreaterThan(5)
			const reward = cosmeticOf(c.rewardCosmetic)
			expect(reward?.kind).toBe("decor")
			expect(reward?.builder).toBeTruthy()
			expect(c.goals.map((g) => g.id)).toEqual(["goal_1", "goal_2", "goal_3"])
			for (const g of c.goals) {
				expect(g.target).toBeGreaterThan(0)
				expect(g.dailyAmount).toBeGreaterThan(0)
				// a month of daily taps can reach the target, about 20 days' worth
				expect(g.target / g.dailyAmount).toBeLessThanOrEqual(31)
				expect(g.target / g.dailyAmount).toBeGreaterThanOrEqual(15)
				expect(g.dailyPrompt.startsWith("Did you")).toBe(true)
			}
		}
		expect(catalogChallenge("burpee_blitz")?.title).toBe("Burpee Blitz")
		expect(catalogChallenge("nope")).toBeNull()
	})

	it("neighbouring months get different cards", () => {
		for (let m = 1; m < 12; m++)
			expect(catalogForMonth(m, 2026).key).not.toBe(
				catalogForMonth(m + 1, 2026).key,
			)
	})
})

describe("curated challenges in the app", () => {
	let n = 0
	async function login(admin = false) {
		const db = await getTestDb()
		const code = `CAT-INVITE-${++n}`
		await db.insert(invites).values({
			code,
			createdByUserId: "admin-001",
			expiresAt: new Date(Date.now() + 86_400_000),
		})
		const res = await request(app)
			.post("/api/auth/sign-up/email")
			.send({
				name: "Tester",
				email: `cat${n}@slimpals.test`,
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

	it("falls back to a curated card when the AI is down", async () => {
		const db = await getTestDb()
		const r = await generateChallengeForMonth(failingAI, 3, 2031, db)
		expect(r.status).toBe("created")
		if (r.status !== "created") return
		const card = catalogForMonth(3, 2031)
		expect(r.challenge.title).toBe(card.title)
		expect(r.challenge.rewardCosmetic).toBe(card.rewardCosmetic)
		expect(r.challenge.aiGenerated).toBe(false)
	})

	it("an admin puts a card in this month, once, and refuses unknown or non-admin", async () => {
		const admin = await login(true)
		const post = (cookie: string, body: object) =>
			request(app)
				.post("/api/admin/challenges/catalog")
				.set("Cookie", cookie)
				.send(body)
		await post(admin.cookie, { key: "nope" }).expect(400)
		const member = await login()
		await post(member.cookie, { key: "burpee_blitz" }).expect(403)
		const ok = await post(admin.cookie, { key: "burpee_blitz" }).expect(201)
		expect(ok.body.title).toBe("Burpee Blitz")
		await post(admin.cookie, { key: "green_machine" }).expect(409)
	})

	it("shows the card, and finishing it gives the trophy and its own decor", async () => {
		const admin = await login(true)
		await request(app)
			.post("/api/admin/challenges/catalog")
			.set("Cookie", admin.cookie)
			.send({ key: "sunrise_stride" })
			.expect(201)
		const { cookie } = await login()
		const cur = (
			await request(app).get("/api/challenges/current").set("Cookie", cookie)
		).body
		expect(cur.tagline).toBe("Beat the sun out the door.")
		expect(cur.reward).toEqual({
			key: "sunrise_mural",
			name: "Sunrise mural",
		})
		expect(cur.coachIntro).toContain("sun")
		await request(app)
			.post(`/api/challenges/${cur.id}/join`)
			.set("Cookie", cookie)
			.send({ tier: "bronze" })
			.expect(201)
		const done = await request(app)
			.patch(`/api/challenges/${cur.id}/progress`)
			.set("Cookie", cookie)
			.send({
				dailyProgress: { goal_1: 100, goal_2: 1000, goal_3: 1000 },
			})
			.expect(200)
		expect(done.body.completed).toBe(true)
		expect(done.body.cosmeticAwarded).toBe("Challenge trophy")
		expect(done.body.rewardAwarded).toBe("Sunrise mural")
		const db = await getTestDb()
		const keys = (await db.select().from(gymCosmetics)).map(
			(c) => c.cosmeticKey,
		)
		expect(keys.sort()).toEqual(["challenge_trophy", "sunrise_mural"])
		expect((await db.select().from(challenges)).length).toBe(1)
	})
})
