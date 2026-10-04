// Admin test tools for the newer gym systems: set staff levels, and wipe
// staff levels, hires, open walls or today's hustle bonuses.
import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymCosmetics,
	gymHires,
	gymOpenWalls,
	gymRewards,
	gymStaff,
	invites,
	userGyms,
	userGymUpgrades,
	users,
} from "../../server/db/schema.js"
import { dayKey } from "../../server/services/gym/rewards.js"
import { STAFF } from "../../shared/gym3d/staff.js"
import type { GymLayoutDto, GymStaffDto } from "../../shared/types.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

let inviteCounter = 0

async function registerAndLogin(email: string, name: string) {
	const db = await getTestDb()
	const code = `ADMIN-EXTRAS-${++inviteCounter}`
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

/** An admin, and a member whose gym has a seeded layout with a cardio room. */
async function adminAndMember() {
	const db = await getTestDb()
	const admin = await registerAndLogin("a@slimpals.test", "Admin Two")
	await db
		.update(users)
		.set({ isAdmin: true })
		.where(eq(users.id, admin.userId))
	const member = await registerAndLogin("b@slimpals.test", "Member Two")
	await request(app).get("/api/gym").set("Cookie", member.cookie).expect(200)
	const [gym] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, member.userId))
	await db
		.insert(userGymUpgrades)
		.values({ gymId: gym.id, upgradeKey: "cardio_treadmill" })
	const layout = (
		await request(app).get("/api/gym/layout").set("Cookie", member.cookie)
	).body as GymLayoutDto
	return { admin, member, gymId: gym.id, layout }
}

const post = (cookie: string, userId: string, path: string, body: object) =>
	request(app)
		.post(`/api/admin/users/${userId}/gym/${path}`)
		.set("Cookie", cookie)
		.send(body)

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

describe("admin staff levels", () => {
	it("sets one named staff member, or all of them", async () => {
		const { admin, member } = await adminAndMember()
		const one = await post(admin.cookie, member.userId, "staff-level", {
			npcKey: "trainer_marcus",
			level: 3,
		}).expect(200)
		const marcus = (one.body.staff as GymStaffDto[]).find(
			(c) => c.npcKey === "trainer_marcus",
		)
		expect(marcus?.level).toBe(3)

		const all = await post(admin.cookie, member.userId, "staff-level", {
			npcKey: "all",
			level: 5,
		}).expect(200)
		const named = (all.body.staff as GymStaffDto[]).filter((c) =>
			STAFF.some((s) => s.key === c.npcKey),
		)
		expect(named).toHaveLength(STAFF.length)
		for (const c of named) expect(c.level).toBe(5)
	})

	it("sets a hire's level and refuses bad input and non-admins", async () => {
		const { admin, member, gymId, layout } = await adminAndMember()
		const room = layout.rooms.find((r) => r.type === "cardio")
		if (!room) throw new Error("no cardio room")
		const db = await getTestDb()
		const [hire] = await db
			.insert(gymHires)
			.values({ gymId, roomId: room.id, role: "Cardio coach", name: "Nia" })
			.$returningId()

		await post(admin.cookie, member.userId, "staff-level", {
			npcKey: `hire:${hire.id}`,
			level: 4,
		}).expect(200)
		const [row] = await db
			.select()
			.from(gymHires)
			.where(eq(gymHires.id, hire.id))
		expect(row.level).toBe(4)

		const bad = (body: object) =>
			post(admin.cookie, member.userId, "staff-level", body)
		await bad({ npcKey: "trainer_marcus", level: 9 }).expect(400)
		await bad({ npcKey: "trainer_marcus", level: 0 }).expect(400)
		await bad({ npcKey: "nobody", level: 2 }).expect(404)
		await bad({ npcKey: "hire:999999", level: 2 }).expect(404)
		await post(member.cookie, member.userId, "staff-level", {
			npcKey: "all",
			level: 5,
		}).expect(403)
	})
})

describe("admin reset-extras", () => {
	it("clears staff levels, hires, open walls and only today's hustle", async () => {
		const { admin, member, gymId, layout } = await adminAndMember()
		const room = layout.rooms.find((r) => r.type === "cardio")
		if (!room) throw new Error("no cardio room")
		const db = await getTestDb()
		await db
			.insert(gymStaff)
			.values({ gymId, npcKey: "trainer_marcus", level: 2 })
		await db
			.insert(gymHires)
			.values({ gymId, roomId: room.id, role: "Cardio coach", name: "Nia" })
		await db.insert(gymOpenWalls).values({ gymId, px: 1, pz: 1, axis: "x" })
		await db.insert(gymRewards).values([
			{ gymId, source: `hustle:${dayKey()}:1` },
			{ gymId, source: "hustle:2000-01-01:1" },
		])

		const reset = (what: string) =>
			post(admin.cookie, member.userId, "reset-extras", { what })
		expect((await reset("staff").expect(200)).body.removed).toBe(1)
		expect((await reset("hires").expect(200)).body.removed).toBe(1)
		expect((await reset("walls").expect(200)).body.removed).toBe(1)
		expect((await reset("hustle").expect(200)).body.removed).toBe(1)
		const left = await db
			.select()
			.from(gymRewards)
			.where(eq(gymRewards.gymId, gymId))
		expect(left.map((r) => r.source)).toContain("hustle:2000-01-01:1")

		await reset("everything").expect(400)
	})
})

describe("admin reward track", () => {
	it("sets this month's track step without paying, and refuses bad input", async () => {
		const { admin, member, gymId } = await adminAndMember()
		const db = await getTestDb()
		const coins = async () =>
			(await db.select().from(userGyms).where(eq(userGyms.id, gymId)))[0].coins

		const before = await coins()
		const r = await post(admin.cookie, member.userId, "track-step", {
			step: 5,
		}).expect(200)
		expect(r.body.claimed).toBe(5)
		expect(await coins()).toBe(before)

		const reset = await post(admin.cookie, member.userId, "track-step", {
			step: 0,
		}).expect(200)
		expect(reset.body.claimed).toBe(0)
		const clamped = await post(admin.cookie, member.userId, "track-step", {
			step: 999,
		}).expect(200)
		expect(clamped.body.claimed).toBe(clamped.body.steps.length)
		await post(admin.cookie, member.userId, "track-step", {
			step: -1,
		}).expect(400)
		await post(member.cookie, member.userId, "track-step", { step: 1 }).expect(
			403,
		)
	})
})

describe("admin burger, milestones and cosmetics", () => {
	it("un-buys the Burger Baron and clears challenge milestone payouts", async () => {
		const { admin, member, gymId } = await adminAndMember()
		const db = await getTestDb()
		await db.insert(gymRewards).values([
			{ gymId, source: "burger:bought" },
			{ gymId, source: "challenge:3:m25" },
			{ gymId, source: "challenge:3:m50" },
			{ gymId, source: "hustle:2000-01-01:1" },
		])
		const reset = (what: string) =>
			post(admin.cookie, member.userId, "reset-extras", { what })
		expect((await reset("burger").expect(200)).body.removed).toBe(1)
		expect((await reset("milestones").expect(200)).body.removed).toBe(2)
		const left = await db
			.select()
			.from(gymRewards)
			.where(eq(gymRewards.gymId, gymId))
		const sources = left.map((r) => r.source)
		expect(sources).toContain("hustle:2000-01-01:1")
		expect(sources).not.toContain("burger:bought")
		expect(sources.some((x) => x.startsWith("challenge:"))).toBe(false)
	})

	it("grants a cosmetic once, refuses unknown keys, and removes them all", async () => {
		const { admin, member, gymId } = await adminAndMember()
		const db = await getTestDb()
		const grant = (key: string) =>
			post(admin.cookie, member.userId, "cosmetic", { key })
		const first = await grant("halloween_hat").expect(200)
		expect(first.body.granted).toBe("Witch hat for the coach")
		expect((await grant("halloween_hat").expect(200)).body.granted).toBeNull()
		await grant("not_a_thing").expect(400)
		await post(member.cookie, member.userId, "cosmetic", {
			key: "halloween_hat",
		}).expect(403)
		expect(await db.select().from(gymCosmetics)).toHaveLength(1)

		const cleared = await post(admin.cookie, member.userId, "reset-extras", {
			what: "cosmetics",
		}).expect(200)
		expect(cleared.body.removed).toBe(1)
		expect(
			await db.select().from(gymCosmetics).where(eq(gymCosmetics.gymId, gymId)),
		).toHaveLength(0)
	})
})
