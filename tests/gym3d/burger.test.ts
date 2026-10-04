import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymPlots,
	gymRooms,
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import { GYM_UPGRADES } from "../../server/db/seed.js"
import type { AIService } from "../../server/services/ai/index.js"
import { BURGER, burgerState } from "../../shared/gym3d/burger.js"
import {
	BURGER_LOT_TEMPLATES,
	currentLots,
	lotsForSale,
	NEIGHBOURHOOD_COLS,
	neighbourhoodCols,
} from "../../shared/gym3d/lots.js"
import type { GymLayoutDto } from "../../shared/types.js"
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

const buy = (cookie: string) =>
	request(app).post("/api/gym/layout/burger/buy").set("Cookie", cookie)

describe("Burger Baron rules", () => {
	it("goes on sale at the star threshold and only then", () => {
		expect(burgerState(BURGER.stars - 1, false)).toBe("closed")
		expect(burgerState(BURGER.stars, false)).toBe("forSale")
		expect(burgerState(5, true)).toBe("bought")
		expect(burgerState(1, true)).toBe("bought")
	})
})

describe("the Baron's lots", () => {
	it("only exist once he is bought, past the east end, and sell next to a built plot", () => {
		const east = [{ px: 6, pz: 1 }]
		const ids = (lots: { id: string }[]) => lots.map((l) => l.id)
		expect(neighbourhoodCols(false)).toBe(NEIGHBOURHOOD_COLS)
		expect(neighbourhoodCols(true)).toBeGreaterThan(NEIGHBOURHOOD_COLS)
		for (const t of BURGER_LOT_TEMPLATES)
			for (const c of t.cells)
				expect(c.px).toBeGreaterThanOrEqual(NEIGHBOURHOOD_COLS)
		// not before
		expect(ids(currentLots(east)).some((i) => i.endsWith(":7,1"))).toBe(false)
		expect(ids(lotsForSale(east)).some((i) => i.endsWith(":7,1"))).toBe(false)
		// after: for sale when touching a built cell, not otherwise
		expect(ids(lotsForSale(east, true))).toContain("big:7,1")
		expect(ids(lotsForSale([{ px: 0, pz: 2 }], true))).not.toContain("big:7,1")
	})
})

describe("Burger Baron route", () => {
	it("is closed for a small gym and cannot be bought", async () => {
		const { cookie, layout } = await setup(["cardio_treadmill"])
		expect(layout.burger.state).toBe("closed")
		await buy(cookie).expect(409)
	})

	it("goes on sale for a four star gym, costs coins once, then is bought", async () => {
		const { cookie, gymId, layout } = await setup(
			GYM_UPGRADES.map((u) => u.key),
		)
		expect(layout.rating.stars).toBeGreaterThanOrEqual(BURGER.stars)
		expect(layout.burger.state).toBe("forSale")
		const db = await getTestDb()
		await db.update(userGyms).set({ coins: 5000 }).where(eq(userGyms.id, gymId))

		const bought = (await buy(cookie).expect(200)).body as GymLayoutDto
		expect(bought.burger.state).toBe("bought")
		expect(bought.coins).toBe(5000 - BURGER.cost)
		await buy(cookie).expect(409)
		expect((await getLayout(cookie)).coins).toBe(5000 - BURGER.cost)
	})

	it("opens the Baron's lots for sale once bought, and not before", async () => {
		const { cookie, gymId, layout } = await setup(
			GYM_UPGRADES.map((u) => u.key),
		)
		const db = await getTestDb()
		// make sure the east end is built so the new lots touch it
		if (!layout.plots.some((p) => p.px === 6 && p.pz === 1)) {
			const [room] = await db
				.insert(gymRooms)
				.values({ gymId, type: "empty", shape: "normal", level: 1 })
				.$returningId()
			await db.insert(gymPlots).values({
				gymId,
				px: 6,
				pz: 1,
				state: "owned",
				lotShape: "normal",
				roomId: room.id,
			})
		}
		await db
			.update(userGyms)
			.set({ coins: 20000 })
			.where(eq(userGyms.id, gymId))
		const lotIds = async () => (await getLayout(cookie)).lots.map((l) => l.id)
		expect(await lotIds()).not.toContain("big:7,1")
		// not for sale before the Baron is his
		await request(app)
			.post("/api/gym/layout/lots/big:7,1/buy")
			.set("Cookie", cookie)
			.expect(409)
		await buy(cookie).expect(200)
		expect(await lotIds()).toContain("big:7,1")
		await request(app)
			.post("/api/gym/layout/lots/big:7,1/buy")
			.set("Cookie", cookie)
			.expect(200)
		expect(await lotIds()).not.toContain("big:7,1")
	})

	it("refuses when there are not enough coins", async () => {
		const { cookie, gymId } = await setup(GYM_UPGRADES.map((u) => u.key))
		const db = await getTestDb()
		await db
			.update(userGyms)
			.set({ coins: BURGER.cost - 1 })
			.where(eq(userGyms.id, gymId))
		await buy(cookie).expect(409)
		expect((await getLayout(cookie)).burger.state).toBe("forSale")
	})
})
