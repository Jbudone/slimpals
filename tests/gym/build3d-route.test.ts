import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymJobs,
	gymPlots,
	gymRooms,
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
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
	const code = `BUILD3D-INVITE-${++inviteCounter}`
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

/** A user whose gym has `keys` claimed and whose layout has been read once
 * (seeded, starter coins granted). */
async function setup(keys: string[], email?: string) {
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

async function getLayout(cookie: string): Promise<GymLayoutDto> {
	const res = await request(app)
		.get("/api/gym/layout")
		.set("Cookie", cookie)
		.expect(200)
	return res.body as GymLayoutDto
}

const post = (cookie: string, path: string, body: object = {}) =>
	request(app).post(`/api/gym/layout${path}`).set("Cookie", cookie).send(body)

async function setCoins(gymId: number, coins: number) {
	const db = await getTestDb()
	await db.update(userGyms).set({ coins }).where(eq(userGyms.id, gymId))
}

async function setSweat(gymId: number, sweat: number) {
	const db = await getTestDb()
	await db.update(userGyms).set({ sweat }).where(eq(userGyms.id, gymId))
}

/** Pretends every active job's time is up. */
async function expireJobs(gymId: number) {
	const db = await getTestDb()
	await db
		.update(gymJobs)
		.set({ endsAt: new Date(Date.now() - 60_000) })
		.where(eq(gymJobs.gymId, gymId))
}

/** Buys a lot, finishes it (time passes) and sets its room type. */
async function buildRoom(
	cookie: string,
	gymId: number,
	lotId: string,
	type: string,
): Promise<GymLayoutDto> {
	await setCoins(gymId, 100_000)
	const bought = await post(cookie, `/lots/${lotId}/buy`).expect(200)
	const room = (bought.body as GymLayoutDto).rooms.find(
		(r) => r.type === "empty",
	)
	if (!room) throw new Error("no new room")
	await expireJobs(gymId)
	await getLayout(cookie)
	const res = await post(cookie, `/rooms/${room.id}/type`, { type }).expect(200)
	return res.body as GymLayoutDto
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

describe("coins", () => {
	it("the first layout read grants the starter coins once", async () => {
		const { cookie, layout } = await setup([])
		expect(layout.coins).toBe(1500)
		expect((await getLayout(cookie)).coins).toBe(1500)
	})

	it("gyms seeded before coins existed get the starter coins too", async () => {
		const { cookie, gymId } = await setup([])
		const db = await getTestDb()
		await db
			.update(userGyms)
			.set({ coins: 0, starterCoinsAt: null })
			.where(eq(userGyms.id, gymId))
		expect((await getLayout(cookie)).coins).toBe(1500)
		expect((await getLayout(cookie)).coins).toBe(1500)
	})

	it("gym XP no longer grants coins (coins are idle income now)", async () => {
		const { cookie } = await setup([])
		await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})
			.expect(201)
		const l = await getLayout(cookie)
		expect(l.coins).toBe(1500)
		// starter Sweat and Greens come with the starter coins
		expect(l.sweat).toBe(3)
		expect(l.greens).toBe(2)
	})
})

describe("buying plots", () => {
	it("needs auth", async () => {
		await request(app).post("/api/gym/layout/lots/normal:0,2/buy").expect(401)
	})

	it("lists For Sale lots next to the building with rising prices", async () => {
		const { cookie, layout } = await setup([])
		expect(layout.lots.map((l) => l.id).sort()).toEqual([
			"big:2,1",
			"normal:0,2",
			"normal:1,1",
		])
		expect(layout.lots.find((l) => l.id === "normal:0,2")?.price).toBe(1200)

		const res = await post(cookie, "/lots/normal:0,2/buy").expect(200)
		const after = res.body as GymLayoutDto
		expect(after.coins).toBe(300)
		const room = after.rooms.find((r) => r.type === "empty")
		expect(room?.building).toBe(true)
		expect(room?.cells).toEqual([{ px: 0, pz: 2 }])
		expect(after.plots.find((p) => p.px === 0 && p.pz === 2)?.state).toBe(
			"building",
		)
		const job = after.jobs.find((j) => j.kind === "plot")
		expect(job?.status).toBe("active")
		expect(job?.roomId).toBe(room?.id)
		const ms = Date.parse(job?.endsAt ?? "") - Date.parse(job?.startedAt ?? "")
		expect(ms).toBe(4 * 3_600_000)
		// the next plot costs more; the bought one is no longer for sale
		expect(after.lots.find((l) => l.id === "normal:1,1")?.price).toBe(1900)
		expect(after.lots.some((l) => l.id === "normal:0,2")).toBe(false)
		// its neighbour went up for sale
		expect(after.lots.some((l) => l.id === "L:0,0")).toBe(true)
	})

	it("rejects lots that are not for sale and changes nothing", async () => {
		const { cookie } = await setup([])
		const far = await post(cookie, "/lots/normal:4,0/buy").expect(409)
		expect(far.body.error).toMatch(/not for sale/)
		await post(cookie, "/lots/nonsense/buy").expect(409)
		expect((await getLayout(cookie)).coins).toBe(1500)
	})

	it("rejects a plot the player cannot afford", async () => {
		const { cookie, gymId } = await setup([])
		await setCoins(gymId, 1199)
		const res = await post(cookie, "/lots/normal:0,2/buy").expect(409)
		expect(res.body.error).toMatch(/Not enough coins/)
		const l = await getLayout(cookie)
		expect(l.coins).toBe(1199)
		expect(l.rooms).toHaveLength(1)
		expect(l.jobs).toHaveLength(0)
	})

	it("concurrent buys never overspend or double-buy", async () => {
		const { cookie, gymId } = await setup([])
		// enough for exactly one plot
		const results = await Promise.all([
			post(cookie, "/lots/normal:0,2/buy"),
			post(cookie, "/lots/normal:1,1/buy"),
			post(cookie, "/lots/normal:0,2/buy"),
		])
		expect(results.filter((r) => r.status === 200)).toHaveLength(1)
		for (const r of results) expect([200, 409]).toContain(r.status)
		const l = await getLayout(cookie)
		expect(l.coins).toBe(300)
		expect(l.rooms.filter((r) => r.type === "empty")).toHaveLength(1)

		// plenty of coins, same lot twice at once: one wins
		await setCoins(gymId, 100_000)
		const twice = await Promise.all([
			post(cookie, "/lots/L:0,0/buy"),
			post(cookie, "/lots/L:0,0/buy"),
		])
		const ok = twice.filter((r) => r.status === 200)
		// L:0,0 is only for sale if (0,2) was the plot bought above
		const db = await getTestDb()
		const plots = await db
			.select()
			.from(gymPlots)
			.where(eq(gymPlots.gymId, gymId))
		const keys = plots.map((p) => `${p.px},${p.pz}`)
		expect(new Set(keys).size).toBe(keys.length)
		expect(ok.length).toBeLessThanOrEqual(1)
		const [gym] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))
		expect(gym.plotsBought).toBe(1 + ok.length)
	})
})

describe("construction jobs", () => {
	it("complete lazily on the next read, then the type is chosen once", async () => {
		const { cookie, gymId } = await setup([])
		const bought = (await post(cookie, "/lots/normal:0,2/buy").expect(200))
			.body as GymLayoutDto
		const room = bought.rooms.find((r) => r.type === "empty")
		if (!room) throw new Error("no room")

		const early = await post(cookie, `/rooms/${room.id}/type`, {
			type: "cardio",
		}).expect(409)
		expect(early.body.error).toMatch(/construction/)

		await expireJobs(gymId)
		const l = await getLayout(cookie)
		expect(l.plots.find((p) => p.px === 0 && p.pz === 2)?.state).toBe("owned")
		expect(l.rooms.find((r) => r.id === room.id)?.building).toBe(false)
		const job = l.jobs.find((j) => j.roomId === room.id)
		expect(job?.status).toBe("done")
		expect(job?.finishedAt).not.toBeNull()

		await post(cookie, `/rooms/${room.id}/type`, { type: "sauna" }).expect(400)
		const typed = (
			await post(cookie, `/rooms/${room.id}/type`, { type: "boxing" }).expect(
				200,
			)
		).body as GymLayoutDto
		expect(typed.rooms.find((r) => r.id === room.id)?.type).toBe("boxing")
		await post(cookie, `/rooms/${room.id}/type`, { type: "cardio" }).expect(409)
	})

	it("finish now costs Sweat: one per hour left, rounded up", async () => {
		const { cookie, gymId } = await setup([])
		const b = (await post(cookie, "/lots/normal:0,2/buy").expect(200))
			.body as GymLayoutDto
		const job = b.jobs[0]
		await setSweat(gymId, 10)
		// 4h left: 4 Sweat; a stale price the player saw is refused
		const low = await post(cookie, `/jobs/${job.id}/finish`, {
			maxCost: 3,
		}).expect(409)
		expect(low.body.error).toMatch(/costs 4 Sweat/)
		const done = (
			await post(cookie, `/jobs/${job.id}/finish`, { maxCost: 4 }).expect(200)
		).body as GymLayoutDto
		expect(done.sweat).toBe(6)
		// coins are not touched by speed-ups
		expect(done.coins).toBe(300)
		expect(done.jobs[0].status).toBe("done")
		expect(done.plots.every((p) => p.state === "owned")).toBe(true)
		// finishing again is a no-op
		const again = (await post(cookie, `/jobs/${job.id}/finish`).expect(200))
			.body as GymLayoutDto
		expect(again.sweat).toBe(6)
	})

	it("1 Sweat takes an hour off; the last hour finishes the job", async () => {
		const { cookie, gymId } = await setup([])
		const b = (await post(cookie, "/lots/normal:0,2/buy").expect(200))
			.body as GymLayoutDto
		const job0 = b.jobs[0]
		await setSweat(gymId, 5)
		const one = (await post(cookie, `/jobs/${job0.id}/sweat`).expect(200))
			.body as GymLayoutDto
		expect(one.sweat).toBe(4)
		const j1 = one.jobs.find((j) => j.id === job0.id)
		expect(Date.parse(job0.endsAt) - Date.parse(j1?.endsAt ?? "")).toBe(
			3_600_000,
		)
		// 40 minutes left: one more Sweat ends it
		const db = await getTestDb()
		await db
			.update(gymJobs)
			.set({ endsAt: new Date(Date.now() + 40 * 60_000) })
			.where(eq(gymJobs.gymId, gymId))
		const two = (await post(cookie, `/jobs/${job0.id}/sweat`).expect(200))
			.body as GymLayoutDto
		expect(two.sweat).toBe(3)
		expect(two.jobs.find((j) => j.id === job0.id)?.status).toBe("done")
		expect(two.plots.every((p) => p.state === "owned")).toBe(true)
	})

	it("speed-ups are refused without the Sweat", async () => {
		const { cookie, gymId } = await setup([])
		const b = (await post(cookie, "/lots/normal:0,2/buy").expect(200))
			.body as GymLayoutDto
		await setSweat(gymId, 0)
		const r = await post(cookie, `/jobs/${b.jobs[0].id}/sweat`).expect(409)
		expect(r.body.error).toMatch(/Not enough Sweat/)
		await setSweat(gymId, 3)
		const f = await post(cookie, `/jobs/${b.jobs[0].id}/finish`).expect(409)
		expect(f.body.error).toMatch(/Not enough Sweat \(4 needed/)
		const l = await getLayout(cookie)
		expect(l.jobs[0].status).toBe("active")
		expect(l.sweat).toBe(3)
	})

	it("check-ins and missions no longer cut job time by themselves", async () => {
		const { cookie } = await setup([])
		const b = (await post(cookie, "/lots/normal:0,2/buy").expect(200))
			.body as GymLayoutDto
		const before = b.jobs[0].endsAt
		await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})
			.expect(201)
		const m = await request(app)
			.post("/api/missions")
			.set("Cookie", cookie)
			.send({ title: "Walk", cadence: "daily", difficulty: "easy" })
			.expect(201)
		await request(app)
			.post(`/api/missions/${m.body.id}/complete`)
			.set("Cookie", cookie)
			.expect(200)
		expect((await getLayout(cookie)).jobs[0].endsAt).toBe(before)
	})
})

describe("pieces", () => {
	it("moves between spots, swaps, stores, rotates, validating everything", async () => {
		const { cookie, layout } = await setup([
			"cardio_treadmill",
			"cardio_rowing",
		])
		const cardio = layout.rooms.find((r) => r.type === "cardio")
		if (!cardio) throw new Error("no cardio")
		const tread = layout.pieces.find((p) => p.upgradeKey === "cardio_treadmill")
		const row = layout.pieces.find((p) => p.upgradeKey === "cardio_rowing")
		if (!tread || !row) throw new Error("no pieces")
		expect([tread.spotIndex, row.spotIndex]).toEqual([0, 1])

		// empty spot 2
		let l = (
			await post(cookie, `/pieces/${tread.id}/move`, {
				roomId: cardio.id,
				spotIndex: 2,
			}).expect(200)
		).body as GymLayoutDto
		let t = l.pieces.find((p) => p.id === tread.id)
		expect(t?.spotIndex).toBe(2)
		expect([t?.x, t?.z]).toEqual([9 + 1.5, 6 + 4.5])

		// onto the rower: they swap
		l = (
			await post(cookie, `/pieces/${tread.id}/move`, {
				roomId: cardio.id,
				spotIndex: 1,
			}).expect(200)
		).body as GymLayoutDto
		expect(l.pieces.find((p) => p.id === tread.id)?.spotIndex).toBe(1)
		expect(l.pieces.find((p) => p.id === row.id)?.spotIndex).toBe(2)

		// bonus spot 4 opens at Lv 2
		const locked = await post(cookie, `/pieces/${tread.id}/move`, {
			roomId: cardio.id,
			spotIndex: 4,
		}).expect(409)
		expect(locked.body.error).toMatch(/Lv 2/)
		await post(cookie, `/pieces/${tread.id}/move`, {
			roomId: cardio.id,
			spotIndex: 99,
		}).expect(400)
		await post(cookie, `/pieces/${tread.id}/move`, {
			roomId: 999999,
			spotIndex: 0,
		}).expect(404)

		// rotate, store, rotate a stored piece
		l = (await post(cookie, `/pieces/${tread.id}/rotate`).expect(200))
			.body as GymLayoutDto
		expect(l.pieces.find((p) => p.id === tread.id)?.rot).toBe(1)
		l = (await post(cookie, `/pieces/${tread.id}/store`).expect(200))
			.body as GymLayoutDto
		t = l.pieces.find((p) => p.id === tread.id)
		expect(t?.status).toBe("stored")
		expect(t?.roomId).toBeNull()
		await post(cookie, `/pieces/${tread.id}/rotate`).expect(409)

		// back from storage onto a spot
		l = (
			await post(cookie, `/pieces/${tread.id}/move`, {
				roomId: cardio.id,
				spotIndex: 0,
			}).expect(200)
		).body as GymLayoutDto
		expect(l.pieces.find((p) => p.id === tread.id)?.status).toBe("placed")

		// lobby fixtures stay put
		const desk = l.pieces.find((p) => p.upgradeKey === "staff_reception")
		await post(cookie, `/pieces/${desk?.id}/move`, {
			roomId: cardio.id,
			spotIndex: 3,
		}).expect(409)
		await post(cookie, `/pieces/${desk?.id}/store`).expect(409)
	})

	it("gear only goes in rooms of its type and on spots of its size", async () => {
		const { cookie, gymId, layout } = await setup(["cardio_treadmill"])
		// the ring arrives after seeding: stored
		const db = await getTestDb()
		await db
			.insert(userGymUpgrades)
			.values({ gymId, upgradeKey: "boxing_ring" })
		const withRing = await getLayout(cookie)
		const ring = withRing.pieces.find((p) => p.upgradeKey === "boxing_ring")
		expect(ring?.status).toBe("stored")

		const cardio = layout.rooms.find((r) => r.type === "cardio")
		const wrong = await post(cookie, `/pieces/${ring?.id}/move`, {
			roomId: cardio?.id,
			spotIndex: 0,
		}).expect(409)
		expect(wrong.body.error).toMatch(/Boxing room/)

		const l = await buildRoom(cookie, gymId, "normal:0,2", "boxing")
		const boxing = l.rooms.find((r) => r.type === "boxing")
		const small = await post(cookie, `/pieces/${ring?.id}/move`, {
			roomId: boxing?.id,
			spotIndex: 1,
		}).expect(409)
		expect(small.body.error).toMatch(/wrong size/)
		const ok = (
			await post(cookie, `/pieces/${ring?.id}/move`, {
				roomId: boxing?.id,
				spotIndex: 0,
			}).expect(200)
		).body as GymLayoutDto
		const placed = ok.pieces.find((p) => p.id === ring?.id)
		expect(placed?.roomId).toBe(boxing?.id)
		expect(placed?.spotIndex).toBe(0)
		expect(ok.rooms.find((r) => r.id === boxing?.id)?.points).toBe(1)
	})

	it("another user's pieces and rooms are not found", async () => {
		const a = await setup(["cardio_treadmill"], "a@slimpals.test")
		const b = await setup([], "b@slimpals.test")
		const tread = a.layout.pieces.find(
			(p) => p.upgradeKey === "cardio_treadmill",
		)
		const cardio = a.layout.rooms.find((r) => r.type === "cardio")
		await post(b.cookie, `/pieces/${tread?.id}/rotate`).expect(404)
		await post(b.cookie, `/pieces/${tread?.id}/upgrade`).expect(404)
		await post(b.cookie, `/rooms/${cardio?.id}/paint`, {
			wall: "#9fd3cf",
		}).expect(404)
	})

	it("upgrades for coins as a timed job; the tier and room points rise", async () => {
		const { cookie, gymId, layout } = await setup([
			"cardio_treadmill",
			"cardio_bikes",
		])
		const tread = layout.pieces.find((p) => p.upgradeKey === "cardio_treadmill")
		const cardio = layout.rooms.find((r) => r.type === "cardio")
		expect(cardio?.points).toBe(2)
		expect(cardio?.level).toBe(1)

		await setCoins(gymId, 100)
		const poor = await post(cookie, `/pieces/${tread?.id}/upgrade`).expect(409)
		expect(poor.body.error).toMatch(/Not enough coins \(180/)

		await setCoins(gymId, 1000)
		let l = (await post(cookie, `/pieces/${tread?.id}/upgrade`).expect(200))
			.body as GymLayoutDto
		expect(l.coins).toBe(820)
		expect(l.pieces.find((p) => p.id === tread?.id)?.status).toBe("upgrading")
		const job = l.jobs.find((j) => j.kind === "upgrade")
		expect(job?.targetTier).toBe(2)
		expect(
			Date.parse(job?.endsAt ?? "") - Date.parse(job?.startedAt ?? ""),
		).toBe(3 * 3_600_000)
		// busy while upgrading
		await post(cookie, `/pieces/${tread?.id}/upgrade`).expect(409)
		await post(cookie, `/pieces/${tread?.id}/store`).expect(409)
		await post(cookie, `/pieces/${tread?.id}/move`, {
			roomId: cardio?.id,
			spotIndex: 3,
		}).expect(409)

		await expireJobs(gymId)
		l = await getLayout(cookie)
		const t = l.pieces.find((p) => p.id === tread?.id)
		expect(t?.tier).toBe(2)
		expect(t?.status).toBe("placed")
		const room = l.rooms.find((r) => r.id === cardio?.id)
		// 2 + 1 = 3 points: Lv 2
		expect(room?.points).toBe(3)
		expect(room?.level).toBe(2)

		// storing a piece never lowers the level
		l = (await post(cookie, `/pieces/${tread?.id}/store`).expect(200))
			.body as GymLayoutDto
		expect(l.rooms.find((r) => r.id === cardio?.id)?.level).toBe(2)
		const stored = l.pieces.find((p) => p.id === tread?.id)
		expect(stored?.tier).toBe(2)
		await post(cookie, `/pieces/${tread?.id}/upgrade`).expect(409)
	})

	it("a room whose points passed its level is raised on the next read", async () => {
		const { layout } = await setup([
			"cardio_treadmill",
			"cardio_bikes",
			"cardio_rowing",
		])
		const cardio = layout.rooms.find((r) => r.type === "cardio")
		expect(cardio?.points).toBe(3)
		// seeded at Lv 1 from its spots, but 3 points is Lv 2
		expect(cardio?.level).toBe(2)
		const db = await getTestDb()
		const [row] = await db
			.select({ level: gymRooms.level })
			.from(gymRooms)
			.where(eq(gymRooms.id, cardio?.id ?? 0))
		expect(row.level).toBe(2)
	})
})

describe("paint", () => {
	it("sets wall and floor from the palettes, free", async () => {
		const { cookie, layout } = await setup(["cardio_treadmill"])
		const lobby = layout.rooms.find((r) => r.type === "lobby")
		const l = (
			await post(cookie, `/rooms/${lobby?.id}/paint`, {
				wall: "#5a6a8a",
				floorStyle: "wood",
				floorColor: "#cfe3c4",
			}).expect(200)
		).body as GymLayoutDto
		expect(l.rooms.find((r) => r.id === lobby?.id)?.paint).toEqual({
			wall: "#5a6a8a",
			floorStyle: "wood",
			floorColor: "#cfe3c4",
		})
		expect(l.coins).toBe(1500)
		await post(cookie, `/rooms/${lobby?.id}/paint`, {
			wall: "red; drop table",
		}).expect(400)
		await post(cookie, `/rooms/${lobby?.id}/paint`, {
			floorStyle: "lava",
		}).expect(400)
		await post(cookie, `/rooms/${lobby?.id}/paint`, {}).expect(400)
	})
})

describe("admin coins", () => {
	it("admins see and grant coins; others cannot", async () => {
		const admin = await registerAndLogin("boss@slimpals.test", "Boss")
		const db = await getTestDb()
		await db
			.update(users)
			.set({ isAdmin: true })
			.where(eq(users.id, admin.userId))
		const { cookie, userId } = await setup([])

		await request(app)
			.post(`/api/admin/users/${userId}/gym/coins`)
			.set("Cookie", cookie)
			.send({ amount: 500 })
			.expect(403)
		const r = await request(app)
			.post(`/api/admin/users/${userId}/gym/coins`)
			.set("Cookie", admin.cookie)
			.send({ amount: 500 })
			.expect(200)
		expect(r.body.coins).toBe(2000)
		const neg = await request(app)
			.post(`/api/admin/users/${userId}/gym/coins`)
			.set("Cookie", admin.cookie)
			.send({ amount: -5000 })
			.expect(200)
		expect(neg.body.coins).toBe(0)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/coins`)
			.set("Cookie", admin.cookie)
			.send({ amount: "lots" })
			.expect(400)
		const view = await request(app)
			.get(`/api/admin/users/${userId}/gym/upgrades`)
			.set("Cookie", admin.cookie)
			.expect(200)
		expect(view.body.gym.coins).toBe(0)
	})

	it("admin layout reset also clears jobs and plot prices", async () => {
		const admin = await registerAndLogin("boss@slimpals.test", "Boss")
		const db = await getTestDb()
		await db
			.update(users)
			.set({ isAdmin: true })
			.where(eq(users.id, admin.userId))
		const { cookie, userId, gymId } = await setup([])
		await post(cookie, "/lots/normal:0,2/buy").expect(200)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/layout/reset`)
			.set("Cookie", admin.cookie)
			.expect(200)
		expect(
			await db.select().from(gymJobs).where(eq(gymJobs.gymId, gymId)),
		).toHaveLength(0)
		const l = await getLayout(cookie)
		expect(l.rooms).toHaveLength(1)
		expect(l.coins).toBe(300)
		expect(l.lots.find((x) => x.id === "normal:0,2")?.price).toBe(1200)
	})
})
