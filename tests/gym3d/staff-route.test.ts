import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymPieces,
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import type { GymLayoutDto, GymStaffDto } from "../../shared/types.js"
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

const HOUR = 3_600_000
let inviteCounter = 0

async function registerAndLogin(email = "user@slimpals.test", name = "Tester") {
	const db = await getTestDb()
	const code = `ECON-INVITE-${++inviteCounter}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: code,
	})
	const cookies = res.headers["set-cookie"] as string[]
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId: res.body.user.id as string,
	}
}

async function getLayout(cookie: string, open = false): Promise<GymLayoutDto> {
	const res = await request(app)
		.get(`/api/gym/layout${open ? "?open=1" : ""}`)
		.set("Cookie", cookie)
		.expect(200)
	return res.body as GymLayoutDto
}

/** A user whose gym has `keys` claimed and a seeded layout. */
async function setup(keys: string[] = [], email?: string) {
	const { cookie, userId } = await registerAndLogin(email)
	await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
	const db = await getTestDb()
	const [gym] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, userId))
	if (keys.length)
		await db
			.insert(userGymUpgrades)
			.values(keys.map((upgradeKey) => ({ gymId: gym.id, upgradeKey })))
	const layout = await getLayout(cookie)
	return { cookie, userId, gymId: gym.id, layout }
}

/** Moves every income clock of the gym `hours` into the past. */
async function age(gymId: number, hours: number) {
	const db = await getTestDb()
	// a few seconds more: timestamps are whole seconds and "now" is floored
	const t = new Date(Date.now() - hours * HOUR - 3000)
	await db
		.update(userGyms)
		.set({ deskCollectedAt: t, kitchenCollectedAt: t })
		.where(eq(userGyms.id, gymId))
	await db
		.update(gymPieces)
		.set({ collectedAt: t })
		.where(eq(gymPieces.gymId, gymId))
}

async function gymRow(gymId: number) {
	const [g] = await (await getTestDb())
		.select()
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	return g
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

const train = (cookie: string, npcKey: string) =>
	request(app).post(`/api/gym/staff/${npcKey}/train`).set("Cookie", cookie)

const staff = async (cookie: string) =>
	(await request(app).get("/api/gym/staff").set("Cookie", cookie).expect(200))
		.body.staff as GymStaffDto[]

const setCoins = async (gymId: number, coins: number) => {
	const db = await getTestDb()
	await db.update(userGyms).set({ coins }).where(eq(userGyms.id, gymId))
}

describe("Staff growth", () => {
	it("lists every staff card, only the joined ones available", async () => {
		const { cookie } = await setup(["weights_dumbbells"])
		const cards = await staff(cookie)
		expect(cards.map((c) => c.npcKey)).toContain("trainer_marcus")
		const marcus = cards.find((c) => c.npcKey === "trainer_marcus")
		expect(marcus).toMatchObject({
			level: 1,
			available: true,
			bonus: 0,
			trainCost: 250,
		})
		const coach = cards.find((c) => c.npcKey === "specialist_coach")
		expect(coach?.available).toBe(false)
	})

	it("trains a level for coins and raises the bonus", async () => {
		const { cookie, gymId } = await setup(["weights_dumbbells"])
		await setCoins(gymId, 1000)
		const res = await train(cookie, "trainer_marcus")
		expect(res.status).toBe(200)
		const marcus = (res.body.staff as GymStaffDto[]).find(
			(c) => c.npcKey === "trainer_marcus",
		)
		expect(marcus?.level).toBe(2)
		expect(marcus?.bonus).toBeCloseTo(0.03)
		expect(marcus?.trainCost).toBe(500)
		expect(res.body.coins).toBe(750)
		expect((await gymRow(gymId)).coins).toBe(750)
	})

	it("refuses without the coins, for the unjoined, at the top and for strangers", async () => {
		const { cookie, gymId } = await setup(["weights_dumbbells"])
		await setCoins(gymId, 100)
		await train(cookie, "trainer_marcus").expect(409)
		await train(cookie, "specialist_coach").expect(409) // not joined
		await train(cookie, "regular_derek").expect(404)
		await setCoins(gymId, 100_000)
		for (let i = 0; i < 4; i++)
			await train(cookie, "trainer_marcus").expect(200)
		await train(cookie, "trainer_marcus").expect(409) // fully trained
		const marcus = (await staff(cookie)).find(
			(c) => c.npcKey === "trainer_marcus",
		)
		expect(marcus?.level).toBe(5)
		expect(marcus?.trainCost).toBeNull()
	})

	it("racing trains spend and level once each", async () => {
		const { cookie, gymId } = await setup(["weights_dumbbells"])
		await setCoins(gymId, 100_000)
		const results = await Promise.all(
			Array.from({ length: 4 }, () => train(cookie, "trainer_marcus")),
		)
		for (const r of results) expect([200, 409]).toContain(r.status)
		const ok = results.filter((r) => r.status === 200).length
		const marcus = (await staff(cookie)).find(
			(c) => c.npcKey === "trainer_marcus",
		)
		expect(marcus?.level).toBe(1 + ok)
	})

	it("raises the rate of machines in the staff member's room only", async () => {
		const { cookie, gymId, layout } = await setup([
			"weights_dumbbells",
			"cardio_treadmill",
		])
		const rateOf = (l: GymLayoutDto, itemKey: string) => {
			const piece = l.pieces.find((p) => p.itemKey === itemKey)
			return l.income.find((s) => s.pieceId === piece?.id)?.rate
		}
		const before = {
			weights: rateOf(layout, "weights_dumbbells"),
			cardio: rateOf(layout, "cardio_treadmill"),
		}
		await setCoins(gymId, 5000)
		await train(cookie, "trainer_marcus").expect(200)
		await train(cookie, "trainer_marcus").expect(200)
		const after = await getLayout(cookie)
		const w = rateOf(after, "weights_dumbbells") ?? 0
		expect(w).toBeGreaterThan(before.weights ?? 0)
		expect(w).toBeCloseTo((before.weights ?? 0) * 1.06, 0)
		expect(rateOf(after, "cardio_treadmill")).toBe(before.cardio)
	})

	it("training pays the waiting coin bubbles first", async () => {
		const { cookie, gymId } = await setup(["weights_dumbbells"])
		await age(gymId, 3)
		await setCoins(gymId, 300)
		const res = await train(cookie, "trainer_marcus").expect(200)
		expect(res.body.collected).toBeGreaterThan(0)
		expect(res.body.coins).toBe(300 + res.body.collected - 250)
		// the bubbles start again from now at the new rate
		const after = await getLayout(cookie)
		for (const s of after.income) expect(s.bank).toBeLessThanOrEqual(1)
	})
})
