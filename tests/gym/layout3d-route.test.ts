import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymPieces,
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
	const code = `LAYOUT3D-INVITE-${++inviteCounter}`
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

/** Creates the user's gym and marks `keys` as claimed upgrades. */
async function gymWith(userId: string, cookie: string, keys: string[]) {
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
	return gym.id
}

async function getLayout(cookie: string): Promise<GymLayoutDto> {
	const res = await request(app)
		.get("/api/gym/layout")
		.set("Cookie", cookie)
		.expect(200)
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

describe("GET /api/gym/layout", () => {
	it("returns 401 without auth", async () => {
		await request(app).get("/api/gym/layout").expect(401)
	})

	it("seeds the layout on the first read and adds nothing on the second", async () => {
		const { cookie, userId } = await registerAndLogin()
		const gymId = await gymWith(userId, cookie, [
			"cardio_treadmill",
			"weights_dumbbells",
			"decor_posters",
			"staff_manager_office",
		])

		const first = await getLayout(cookie)
		expect(first.gymId).toBe(gymId)
		expect(first.rooms.map((r) => r.type)).toEqual([
			"lobby",
			"cardio",
			"weights",
		])
		const lobby = first.rooms[0]
		expect(lobby.cells).toEqual([{ px: 1, pz: 2 }])
		expect(lobby.paint.floorStyle).toBe("checker")
		expect(first.plots).toHaveLength(3)
		const keys = first.pieces.map((p) => p.upgradeKey).sort()
		expect(keys).toEqual([
			"amenity_lockers",
			"cardio_treadmill",
			"decor_posters",
			"staff_manager_office",
			"staff_reception",
			"weights_dumbbells",
		])
		const treadmill = first.pieces.find(
			(p) => p.upgradeKey === "cardio_treadmill",
		)
		expect(treadmill?.name).toBe("Basic Treadmill")
		expect(treadmill?.spotIndex).toBe(0)
		expect(
			first.pieces.find((p) => p.upgradeKey === "decor_posters")?.kind,
		).toBe("decor")
		// slice 3: the manager's office is built into the lobby
		const office = first.pieces.find(
			(p) => p.upgradeKey === "staff_manager_office",
		)
		expect(office?.roomId).toBe(lobby.id)
		expect(office?.name).toBe("Manager's Office")
		expect(first.unplaced).toEqual([])

		const db = await getTestDb()
		const [gym] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))
		expect(gym.layoutSeededAt).not.toBeNull()

		const second = await getLayout(cookie)
		expect({ ...second, serverNow: "" }).toEqual({ ...first, serverNow: "" })
		// the one-time starter coins arrive with the first read, once
		expect(second.coins).toBe(1500)
		const rows = await db
			.select()
			.from(gymPieces)
			.where(eq(gymPieces.gymId, gymId))
		expect(rows).toHaveLength(6)
	})

	it("does not double-seed when first reads race each other", async () => {
		const { cookie, userId } = await registerAndLogin()
		const gymId = await gymWith(userId, cookie, [
			"cardio_treadmill",
			"cardio_rowing",
			"amenity_juice",
		])
		const results = await Promise.all(
			Array.from({ length: 6 }, () =>
				request(app).get("/api/gym/layout").set("Cookie", cookie),
			),
		)
		for (const r of results) expect(r.status).toBe(200)

		const db = await getTestDb()
		const rooms = await db
			.select()
			.from(gymRooms)
			.where(eq(gymRooms.gymId, gymId))
		expect(rooms.map((r) => r.type).sort()).toEqual([
			"cardio",
			"juice",
			"lobby",
		])
		const plots = await db
			.select()
			.from(gymPlots)
			.where(eq(gymPlots.gymId, gymId))
		expect(plots).toHaveLength(3)
		const pieces = await db
			.select()
			.from(gymPieces)
			.where(eq(gymPieces.gymId, gymId))
		expect(pieces).toHaveLength(5)
		const last = results[results.length - 1].body as GymLayoutDto
		expect(last.pieces).toHaveLength(5)
	})

	it("places an upgrade claimed after seeding on the next read", async () => {
		const { cookie, userId } = await registerAndLogin()
		const gymId = await gymWith(userId, cookie, ["cardio_treadmill"])
		const before = await getLayout(cookie)
		expect(before.pieces.some((p) => p.upgradeKey === "cardio_rowing")).toBe(
			false,
		)

		const db = await getTestDb()
		await db
			.update(userGyms)
			.set({ pendingUpgradeKeys: ["cardio_rowing", "boxing_ring"] })
			.where(eq(userGyms.id, gymId))
		await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookie)
			.send({ key: "cardio_rowing" })
			.expect(200)
		await request(app)
			.post("/api/gym/claim-upgrade")
			.set("Cookie", cookie)
			.send({ key: "boxing_ring" })
			.expect(200)

		const after = await getLayout(cookie)
		const rowing = after.pieces.find((p) => p.upgradeKey === "cardio_rowing")
		expect(rowing?.spotIndex).toBe(1)
		const cardio = after.rooms.find((r) => r.type === "cardio")
		expect(rowing?.roomId).toBe(cardio?.id)
		// earlier pieces keep their ids and places
		for (const p of before.pieces)
			expect(after.pieces.find((q) => q.id === p.id)).toEqual(p)
		// no boxing room yet: after seeding the player builds rooms, so the
		// ring waits in storage until they place it
		expect(after.rooms.find((r) => r.type === "boxing")).toBeUndefined()
		const ring = after.pieces.find((p) => p.upgradeKey === "boxing_ring")
		expect(ring?.status).toBe("stored")
		expect(ring?.roomId).toBeNull()
		expect(ring?.spotIndex).toBeNull()
		expect(ring?.roomType).toBe("boxing")
		expect(ring?.size).toBe(3)
	})

	it("admin reset clears the layout and the next read seeds it again", async () => {
		const { cookie: adminCookie, userId: adminId } = await registerAndLogin(
			"a@slimpals.test",
			"Admin Two",
		)
		const db = await getTestDb()
		await db.update(users).set({ isAdmin: true }).where(eq(users.id, adminId))
		const { cookie, userId } = await registerAndLogin()
		const gymId = await gymWith(userId, cookie, ["cardio_treadmill"])
		await getLayout(cookie)

		await request(app)
			.post(`/api/admin/users/${userId}/gym/layout/reset`)
			.set("Cookie", cookie)
			.expect(403)
		await request(app)
			.post(`/api/admin/users/${userId}/gym/layout/reset`)
			.set("Cookie", adminCookie)
			.expect(200)
		expect(
			await db.select().from(gymPieces).where(eq(gymPieces.gymId, gymId)),
		).toHaveLength(0)
		const [gym] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))
		expect(gym.layoutSeededAt).toBeNull()

		const again = await getLayout(cookie)
		expect(again.pieces.map((p) => p.upgradeKey).sort()).toEqual([
			"amenity_lockers",
			"cardio_treadmill",
			"staff_reception",
		])
	})
})
