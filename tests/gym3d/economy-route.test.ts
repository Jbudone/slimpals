// Gym home economy over HTTP: Sweat / Greens for real tasks (paid once per
// activity), idle coin bubbles (accrual, cap, collect), the Slim Kitchen
// (menu unlocks, rush hour), the welcome-back summary, the wallet and the
// admin grants.
import { readFile } from "node:fs/promises"
import { eq, sql } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymPieces,
	invites,
	missions,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { ECONOMY, guessMissionKind } from "../../shared/gym3d/economy.js"
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

const TINY_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
)

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

const post = (cookie: string, path: string, body: object = {}) =>
	request(app).post(`/api/gym/layout${path}`).set("Cookie", cookie).send(body)

async function mission(
	cookie: string,
	body: { title: string; cadence?: string; difficulty?: string; kind?: string },
) {
	const res = await request(app)
		.post("/api/missions")
		.set("Cookie", cookie)
		.send({ cadence: "daily", difficulty: "easy", ...body })
		.expect(201)
	return res.body as { id: number; kind: string; sweat: number; greens: number }
}

const tick = (cookie: string, id: number, on = true) =>
	request(app)
		.post(`/api/missions/${id}/${on ? "complete" : "uncomplete"}`)
		.set("Cookie", cookie)
		.expect(200)

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

describe("Sweat and Greens for tasks", () => {
	it("an exercise mission pays Sweat once, however often it is toggled", async () => {
		const { cookie, gymId } = await setup()
		const m = await mission(cookie, {
			title: "30-minute workout",
			difficulty: "hard",
		})
		expect(m.kind).toBe("exercise")
		expect(m.sweat).toBe(3)
		const first = await tick(cookie, m.id)
		expect(first.body.rewards).toEqual({ xp: 20, sweat: 3, greens: 0 })
		expect(first.body.gym.sweat).toBe(3 + 3)
		for (let i = 0; i < 3; i++) {
			await tick(cookie, m.id, false)
			const again = await tick(cookie, m.id)
			expect(again.body.rewards.sweat).toBe(0)
		}
		const g = await gymRow(gymId)
		expect(g.sweat).toBe(6)
		// un-ticking takes back the XP (as before) but not the Sweat
		expect(g.greens).toBe(2)
	})

	it("diet missions pay Greens, weekly ones double, 'other' pays XP only", async () => {
		const { cookie, gymId } = await setup()
		const water = await mission(cookie, { title: "Drink 2 L of water" })
		expect(water.kind).toBe("diet")
		const r1 = await tick(cookie, water.id)
		expect(r1.body.rewards).toEqual({ xp: 5, sweat: 0, greens: 1 })
		const wk = await mission(cookie, {
			title: "Hit your calorie target 5 days",
			cadence: "weekly",
			difficulty: "medium",
		})
		expect(wk.greens).toBe(4)
		expect((await tick(cookie, wk.id)).body.rewards.greens).toBe(4)
		const read = await mission(cookie, { title: "Read 20 pages" })
		expect(read.kind).toBe("other")
		expect((await tick(cookie, read.id)).body.rewards).toEqual({
			xp: 5,
			sweat: 0,
			greens: 0,
		})
		const g = await gymRow(gymId)
		expect(g.greens).toBe(2 + 1 + 4)
		expect(g.sweat).toBe(3)
	})

	it("the kind can be chosen and changed; bad kinds are refused", async () => {
		const { cookie } = await setup()
		const m = await mission(cookie, { title: "Stretch", kind: "diet" })
		expect(m.kind).toBe("diet")
		const p = await request(app)
			.patch(`/api/missions/${m.id}`)
			.set("Cookie", cookie)
			.send({ kind: "exercise" })
			.expect(200)
		expect(p.body.kind).toBe("exercise")
		expect(p.body.sweat).toBe(1)
		await request(app)
			.post("/api/missions")
			.set("Cookie", cookie)
			.send({ title: "x", cadence: "daily", difficulty: "easy", kind: "fun" })
			.expect(400)
		const list = await request(app).get("/api/missions").set("Cookie", cookie)
		expect(list.body.daily[0].kind).toBe("exercise")
	})

	it("a weight log pays 1 Green once per day", async () => {
		const { cookie, gymId } = await setup()
		for (let i = 0; i < 2; i++) {
			const r = await request(app)
				.post("/api/weight")
				.set("Cookie", cookie)
				.send({ weightKg: 80 - i })
				.expect(201)
			expect(r.body.rewards.greens).toBe(i === 0 ? 1 : 0)
		}
		expect((await gymRow(gymId)).greens).toBe(3)
	})

	it("a meal photo pays 1 Green once per meal type per day", async () => {
		const { cookie, gymId } = await setup()
		const meal = (type: string) =>
			request(app)
				.post("/api/food/analyze")
				.set("Cookie", cookie)
				.field("mealType", type)
				.attach("photo", TINY_PNG, "meal.png")
				.expect(201)
		expect((await meal("lunch")).body.rewards.greens).toBe(1)
		expect((await meal("lunch")).body.rewards.greens).toBe(0)
		expect((await meal("dinner")).body.rewards.greens).toBe(1)
		expect((await gymRow(gymId)).greens).toBe(4)
	})

	it("the check-in pays XP only", async () => {
		const { cookie, gymId } = await setup()
		const r = await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})
			.expect(201)
		expect(r.body.rewards.xp).toBeGreaterThanOrEqual(15)
		expect(r.body.rewards.sweat).toBe(0)
		const g = await gymRow(gymId)
		expect([g.sweat, g.greens]).toEqual([3, 2])
	})
})

describe("idle coins", () => {
	it("machines, the desk and the kitchen fill bubbles over time, capped", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		const tread = layout.pieces.find((p) => p.upgradeKey === "cardio_treadmill")
		expect(tread).toBeTruthy()
		// fresh: nothing waiting yet
		expect(layout.income.every((s) => s.bank === 0)).toBe(true)
		expect(layout.income.map((s) => s.kind).sort()).toEqual([
			"desk",
			"kitchen",
			"machine",
		])
		// the lobby's fixed furniture earns nothing
		expect(layout.income.filter((s) => s.kind === "machine")).toHaveLength(1)

		await age(gymId, 3)
		let l = await getLayout(cookie)
		const src = (k: string) => l.income.find((s) => s.key === k)
		const m = ECONOMY.income.machine
		expect(src(`piece:${tread?.id}`)?.bank).toBe(m.rate[1] * 3)
		// one finished room (cardio): 3 + 1 members an hour, 2 coins each
		expect(src("desk")?.rate).toBe(8)
		expect(src("desk")?.bank).toBe(24)
		expect(src("kitchen")?.bank).toBe(24)

		await age(gymId, 48)
		l = await getLayout(cookie)
		expect(src(`piece:${tread?.id}`)?.bank).toBe(m.cap[1])
		expect(src("desk")?.bank).toBe(ECONOMY.income.desk.cap)
		expect(src("kitchen")?.bank).toBe(ECONOMY.income.kitchen.cap)
	})

	it("tapping a bubble collects just it; collect all takes the rest", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		const tread = layout.pieces.find((p) => p.upgradeKey === "cardio_treadmill")
		await age(gymId, 3)
		const one = (
			await post(cookie, "/income/collect", {
				keys: [`piece:${tread?.id}`],
			}).expect(200)
		).body as GymLayoutDto
		expect(one.collected).toBe(12)
		expect(one.coins).toBe(1500 + 12)
		expect(one.income.find((s) => s.kind === "machine")?.bank).toBe(0)
		expect(one.income.find((s) => s.kind === "desk")?.bank).toBe(24)
		// the same tap again finds nothing
		const again = (
			await post(cookie, "/income/collect", {
				keys: [`piece:${tread?.id}`],
			}).expect(200)
		).body as GymLayoutDto
		expect(again.collected).toBe(0)
		const all = (await post(cookie, "/income/collect").expect(200))
			.body as GymLayoutDto
		expect(all.collected).toBe(48)
		expect(all.coins).toBe(1500 + 60)
		expect(all.income.every((s) => s.bank === 0)).toBe(true)
		await post(cookie, "/income/collect", { keys: "all" }).expect(400)
	})

	it("concurrent collects never pay twice", async () => {
		const { cookie, gymId } = await setup(["cardio_treadmill"])
		await age(gymId, 3)
		const res = await Promise.all(
			[0, 1, 2].map(() => post(cookie, "/income/collect")),
		)
		const got = res.map((r) => (r.body as GymLayoutDto).collected ?? 0)
		expect(got.reduce((a, b) => a + b, 0)).toBe(12 + 24 + 24)
		expect((await gymRow(gymId)).coins).toBe(1500 + 60)
	})

	it("storing or upgrading a machine pays its bubble out first", async () => {
		const { cookie, gymId, layout } = await setup([
			"cardio_treadmill",
			"cardio_bikes",
		])
		const a = layout.pieces.find((p) => p.upgradeKey === "cardio_treadmill")
		const b = layout.pieces.find((p) => p.upgradeKey === "cardio_bikes")
		if (!a || !b) throw new Error("no cardio gear")
		await age(gymId, 3)
		const stored = (await post(cookie, `/pieces/${a.id}/store`).expect(200))
			.body as GymLayoutDto
		expect(stored.coins).toBe(1500 + 12)
		// a stored piece has no bubble
		expect(stored.income.some((s) => s.pieceId === a.id)).toBe(false)
		const up = (await post(cookie, `/pieces/${b.id}/upgrade`).expect(200))
			.body as GymLayoutDto
		expect(up.coins).toBe(1500 + 12 + 12 - 230)
		expect(up.income.some((s) => s.pieceId === b.id)).toBe(false)
	})
})

describe("Slim Kitchen", () => {
	it("Greens put items on the menu and raise its sales", async () => {
		const { cookie, gymId } = await setup()
		let l = await getLayout(cookie)
		expect(l.kitchen.menu).toEqual(["green"])
		expect(l.kitchen.rate).toBe(8)
		// the protein shake costs 2 Greens (the starter ones)
		l = (await post(cookie, "/kitchen/menu/protein").expect(200))
			.body as GymLayoutDto
		expect(l.greens).toBe(0)
		expect(l.kitchen.menu).toEqual(["green", "protein"])
		expect(l.kitchen.rate).toBe(14)
		const dup = await post(cookie, "/kitchen/menu/protein").expect(409)
		expect(dup.body.error).toMatch(/already/)
		const poor = await post(cookie, "/kitchen/menu/acai").expect(409)
		expect(poor.body.error).toMatch(/Not enough Greens \(4 needed/)
		await post(cookie, "/kitchen/menu/pizza").expect(400)
		// waiting coins were paid at the old rate when the menu changed
		await (await getTestDb())
			.update(userGyms)
			.set({ greens: 4 })
			.where(eq(userGyms.id, gymId))
		await age(gymId, 2)
		l = (await post(cookie, "/kitchen/menu/acai").expect(200))
			.body as GymLayoutDto
		expect(l.collected).toBe(28)
		expect(l.kitchen.bank).toBe(0)
		expect(l.kitchen.rate).toBe(23)
	})

	it("rush hour costs 1 Green and doubles sales for 2h", async () => {
		const { cookie, gymId } = await setup()
		let l = (await post(cookie, "/kitchen/rush").expect(200))
			.body as GymLayoutDto
		expect(l.greens).toBe(1)
		expect(l.kitchen.rushEndsAt).not.toBeNull()
		expect(l.income.find((s) => s.key === "kitchen")?.rate).toBe(16)
		const twice = await post(cookie, "/kitchen/rush").expect(409)
		expect(twice.body.error).toMatch(/already on/)
		// pretend the rush started 3h ago: 2h at 16/h + 1h at 8/h
		const db = await getTestDb()
		await db
			.update(userGyms)
			.set({
				kitchenCollectedAt: new Date(Date.now() - 3 * HOUR - 3000),
				kitchenRushEndsAt: new Date(Date.now() - HOUR),
			})
			.where(eq(userGyms.id, gymId))
		l = await getLayout(cookie)
		expect(l.kitchen.bank).toBe(40)
		expect(l.kitchen.rushEndsAt).toBeNull()
	})
})

describe("welcome back", () => {
	it("shows once after a long absence", async () => {
		const { cookie, gymId } = await setup(["cardio_treadmill"])
		// the first open only records itself
		expect((await getLayout(cookie, true)).welcomeBack).toBeNull()
		expect((await getLayout(cookie, true)).welcomeBack).toBeNull()
		const db = await getTestDb()
		await db
			.update(userGyms)
			.set({ lastOpenAt: new Date(Date.now() - 8 * HOUR) })
			.where(eq(userGyms.id, gymId))
		await age(gymId, 8)
		const wb = (await getLayout(cookie, true)).welcomeBack
		expect(wb?.hours).toBe(8)
		expect(wb?.coins).toBe(32 + 64 + 64)
		expect(wb?.members).toBe(32)
		expect(wb?.sales).toBe(21)
		expect((await getLayout(cookie, true)).welcomeBack).toBeNull()
		// a read without ?open=1 never shows it
		await db
			.update(userGyms)
			.set({ lastOpenAt: new Date(Date.now() - 8 * HOUR) })
			.where(eq(userGyms.id, gymId))
		expect((await getLayout(cookie)).welcomeBack).toBeNull()
	})
})

describe("wallet and admin", () => {
	it("the wallet has level, XP and all three currencies", async () => {
		const { cookie } = await registerAndLogin()
		const w = await request(app)
			.get("/api/gym/wallet")
			.set("Cookie", cookie)
			.expect(200)
		// the starter grant comes with the first read
		expect(w.body).toMatchObject({
			coins: 1500,
			sweat: 3,
			greens: 2,
			level: 0,
			xp: 0,
			pendingUpgrades: [],
		})
	})

	it("admins grant Sweat and Greens like coins", async () => {
		const admin = await registerAndLogin("boss@slimpals.test", "Boss")
		const db = await getTestDb()
		await db
			.update(users)
			.set({ isAdmin: true })
			.where(eq(users.id, admin.userId))
		const { cookie, userId } = await setup()
		await request(app)
			.post(`/api/admin/users/${userId}/gym/sweat`)
			.set("Cookie", cookie)
			.send({ amount: 5 })
			.expect(403)
		const s = await request(app)
			.post(`/api/admin/users/${userId}/gym/sweat`)
			.set("Cookie", admin.cookie)
			.send({ amount: 5 })
			.expect(200)
		expect(s.body.sweat).toBe(8)
		const g = await request(app)
			.post(`/api/admin/users/${userId}/gym/greens`)
			.set("Cookie", admin.cookie)
			.send({ amount: -10 })
			.expect(200)
		expect(g.body.greens).toBe(0)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/greens`)
			.set("Cookie", admin.cookie)
			.send({ amount: 0 })
			.expect(400)
		const view = await request(app)
			.get(`/api/admin/users/${userId}/gym/upgrades`)
			.set("Cookie", admin.cookie)
			.expect(200)
		expect(view.body.gym).toMatchObject({ sweat: 8, greens: 0 })
	})

	it("the admin 'time away' tool fills the bubbles and brings Welcome back", async () => {
		const admin = await registerAndLogin("boss@slimpals.test", "Boss")
		const db = await getTestDb()
		await db
			.update(users)
			.set({ isAdmin: true })
			.where(eq(users.id, admin.userId))
		const { cookie, userId } = await setup(["cardio_treadmill"])
		await getLayout(cookie, true)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/away`)
			.set("Cookie", cookie)
			.send({ hours: 6 })
			.expect(403)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/away`)
			.set("Cookie", admin.cookie)
			.send({ hours: -1 })
			.expect(400)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/away`)
			.set("Cookie", admin.cookie)
			.send({ hours: 6 })
			.expect(200)
		const l = await getLayout(cookie, true)
		expect(l.welcomeBack?.hours).toBe(6)
		const machine = l.income.find((s) => s.kind === "machine")
		// a treadmill at tier 1 earns 4/h: 6h is 24 (the clock may lag a second)
		expect(machine?.bank).toBeGreaterThanOrEqual(23)
		expect(machine?.bank).toBeLessThanOrEqual(24)
		expect(l.income.find((s) => s.key === "desk")?.bank).toBeGreaterThan(0)
	})
})

describe("migration 0021", () => {
	it("backfills mission kinds exactly like guessMissionKind", async () => {
		const db = await getTestDb()
		const titles = [
			"30-minute workout",
			"Run 5 times",
			"10-minute walk",
			"3 strength sessions",
			"Snap a meal",
			"Drink 2 L of water",
			"Log your weight",
			"Hit your calorie target 5 days",
			"Walk after breakfast",
			"Grow tomatoes",
			"Prune the roses",
			"Read 20 pages",
			"No soda",
			"Yoga class",
		]
		await db.insert(missions).values(
			titles.map((title) => ({
				userId: "admin-001",
				title,
				cadence: "daily" as const,
				difficulty: "easy" as const,
			})),
		)
		const file = await readFile(
			"./server/db/migrations/0021_gym_home.sql",
			"utf8",
		)
		const updates = file
			.split("--> statement-breakpoint")
			.map((x) => x.trim())
			.filter((x) => x.startsWith("UPDATE `missions`"))
		expect(updates).toHaveLength(2)
		for (const u of updates) await db.execute(sql.raw(u))
		const rows = await db.select().from(missions)
		for (const r of rows)
			expect([r.title, r.kind]).toEqual([r.title, guessMissionKind(r.title)])
	})
})
