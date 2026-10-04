import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	HIRE,
	hireCost,
	JUICE_TIPS,
	STAFFED_RATE,
} from "../../shared/gym3d/hires.js"
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

async function _gymRow(gymId: number) {
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

const hire = (cookie: string, roomId: number) =>
	request(app)
		.post(`/api/gym/layout/rooms/${roomId}/hire`)
		.set("Cookie", cookie)

const setCoins = async (gymId: number, coins: number) => {
	await (await getTestDb())
		.update(userGyms)
		.set({ coins })
		.where(eq(userGyms.id, gymId))
}

const roomOf = (l: GymLayoutDto, type: string) => {
	const r = l.rooms.find((q) => q.type === type)
	if (!r) throw new Error(`no ${type} room`)
	return r
}

describe("Hiring staff", () => {
	it("hires for coins that rise each time, two to a room", async () => {
		const { cookie, gymId, layout } = await setup([
			"cardio_treadmill",
			"weights_dumbbells",
		])
		const cardio = roomOf(layout, "cardio")
		const weights = roomOf(layout, "weights")
		await setCoins(gymId, 5000)

		const first = await hire(cookie, cardio.id).expect(200)
		expect(first.body.hires).toHaveLength(1)
		expect(first.body.hires[0]).toMatchObject({
			roomId: cardio.id,
			role: "Cardio coach",
			level: 1,
			post: 0,
		})
		expect(first.body.coins).toBe(5000 - hireCost(0))
		expect(first.body.nextHireCost).toBe(hireCost(1))

		// the price counts hires in the whole gym
		const second = await hire(cookie, weights.id).expect(200)
		expect(second.body.coins).toBe(5000 - hireCost(0) - hireCost(1))
		await hire(cookie, cardio.id).expect(200)
		expect(HIRE.perRoom).toBe(2)
		await hire(cookie, cardio.id).expect(409) // full
	})

	it("refuses the lobby, other people's rooms and an empty purse", async () => {
		const mine = await setup(["cardio_treadmill"], "mine@slimpals.test")
		const theirs = await setup(["weights_dumbbells"], "theirs@slimpals.test")
		await setCoins(mine.gymId, 5000)
		const lobby = mine.layout.rooms.find((r) => r.type === "lobby")
		if (!lobby) throw new Error("no lobby")
		await hire(mine.cookie, lobby.id).expect(409)
		await hire(mine.cookie, roomOf(theirs.layout, "weights").id).expect(404)
		await hire(mine.cookie, 999_999).expect(404)

		await setCoins(mine.gymId, hireCost(0) - 1)
		await hire(mine.cookie, roomOf(mine.layout, "cardio").id).expect(409)
	})

	it("trains like the named staff and raises the room's machine rates", async () => {
		const { cookie, gymId, layout } = await setup(["weights_dumbbells"])
		const weights = roomOf(layout, "weights")
		const machine = layout.pieces.find(
			(p) =>
				p.kind === "equipment" &&
				p.roomId === weights.id &&
				p.spotIndex != null,
		)
		const rateOf = (l: GymLayoutDto) =>
			l.income.find((s) => s.pieceId === machine?.id)?.rate ?? 0
		const base = rateOf(layout)
		await setCoins(gymId, 5000)

		const hired = await hire(cookie, weights.id).expect(200)
		expect(rateOf(hired.body)).toBeCloseTo(base * (1 + HIRE.bonus), 1)

		const key = `hire:${hired.body.hires[0].id}`
		const res = await request(app)
			.post(`/api/gym/staff/${key}/train`)
			.set("Cookie", cookie)
			.expect(200)
		const card = (res.body.staff as GymStaffDto[]).find((c) => c.npcKey === key)
		expect(card).toMatchObject({ level: 2, area: "weights" })
		expect(card?.bonus).toBeGreaterThan(HIRE.bonus)
		const after = await getLayout(cookie)
		expect(rateOf(after)).toBeGreaterThan(rateOf(hired.body))
	})
})

describe("Juice tips", () => {
	it("a barista in the juice room lifts the Slim Kitchen's rate, other hires do not", async () => {
		const { cookie, gymId, layout } = await setup([
			"amenity_juice",
			"cardio_treadmill",
		])
		await setCoins(gymId, 5000)
		const base = layout.kitchen.rate
		expect(base).toBeGreaterThan(0)

		// a hire elsewhere leaves the kitchen alone
		const cardio = await hire(cookie, roomOf(layout, "cardio").id).expect(200)
		expect(cardio.body.kitchen.rate).toBeCloseTo(base, 5)

		const juice = await hire(cookie, roomOf(layout, "juice").id).expect(200)
		expect(juice.body.kitchen.rate).toBeCloseTo(base * (1 + JUICE_TIPS), 0)
		expect(juice.body.kitchen.rate).toBeGreaterThan(base)
	})
})

describe("Staffed room rates", () => {
	it("a hire in a boxing or court room adds that room's own flavour rate", async () => {
		const { cookie, gymId, layout } = await setup([
			"punching_bags_heavy_bag_row",
			"court_hoop",
			"weights_dumbbells",
		])
		await setCoins(gymId, 9000)
		let l = layout
		for (const [type, extra] of [
			["boxing", STAFFED_RATE.boxing],
			["court", STAFFED_RATE.court],
			["weights", 0],
		] as const) {
			const room = roomOf(l, type)
			const machine = l.pieces.find(
				(p) =>
					p.kind === "equipment" && p.roomId === room.id && p.spotIndex != null,
			)
			const rateOf = (x: GymLayoutDto) =>
				x.income.find((s) => s.pieceId === machine?.id)?.rate ?? 0
			const base = rateOf(l)
			expect(base).toBeGreaterThan(0)
			l = (await hire(cookie, room.id).expect(200)).body
			expect(rateOf(l)).toBeCloseTo(base * (1 + HIRE.bonus + extra), 0)
			if (extra > 0) expect(rateOf(l)).toBeGreaterThan(base * (1 + HIRE.bonus))
		}
	})
})
