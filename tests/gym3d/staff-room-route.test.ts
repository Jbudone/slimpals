import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymHires,
	gymRewards,
	gymRooms,
	invites,
	users,
} from "../../server/db/schema.js"
import {
	getStaffRoomDto,
	markEpisodeSeen,
} from "../../server/services/gym/staffRoom.js"
import { ROOM_MIN_HIRES } from "../../shared/gym3d/staffRoom.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
})
afterAll(async () => {
	await closeTestDb()
})

let n = 0
async function member() {
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "adm@x.test", name: "A" })
		.onDuplicateKeyUpdate({ set: { name: "A" } })
	const code = `ROOM-${++n}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({
			name: "Room",
			email: `room${n}@slimpals.test`,
			password: "Password1!",
			inviteCode: code,
		})
	const cookie = (res.headers["set-cookie"] as string[]).join("; ")
	await request(app).get("/api/gym").set("Cookie", cookie).expect(200)
	const layout = await request(app)
		.get("/api/gym/layout")
		.set("Cookie", cookie)
		.expect(200)
	const roomId = layout.body.rooms[0].id as number
	const [room] = await db.select().from(gymRooms).where(eq(gymRooms.id, roomId))
	return { db, cookie, gymId: room.gymId, roomId }
}

describe("the staff room", () => {
	it("plays nothing until the gym has enough coaches, then one episode a slot, seen once", async () => {
		const { db, cookie, gymId, roomId } = await member()
		const none = await request(app)
			.get("/api/gym/staff-room")
			.set("Cookie", cookie)
			.expect(200)
		expect(none.body.pending).toBeNull()
		expect(none.body.needHires).toBe(ROOM_MIN_HIRES)

		for (let i = 0; i < ROOM_MIN_HIRES; i++)
			await db
				.insert(gymHires)
				.values({ gymId, roomId, role: "Cardio coach", name: `Coach ${i}` })
		const dto = await getStaffRoomDto(db, gymId)
		expect(dto.pending?.lines.length).toBeGreaterThan(2)
		const id = dto.pending?.id ?? ""

		const live = await request(app)
			.get("/api/gym/staff-room")
			.set("Cookie", cookie)
			.expect(200)
		expect(live.body.pending.id).toBe(id)

		// only the waiting one can be marked
		await request(app)
			.post("/api/gym/staff-room/nope.2020-01-01.0/seen")
			.set("Cookie", cookie)
			.expect(409)
		const done = await request(app)
			.post(`/api/gym/staff-room/${encodeURIComponent(id)}/seen`)
			.set("Cookie", cookie)
			.expect(200)
		expect(done.body.pending).toBeNull()
		// once: a repeat is refused, and nothing is paid
		await request(app)
			.post(`/api/gym/staff-room/${encodeURIComponent(id)}/seen`)
			.set("Cookie", cookie)
			.expect(409)
		await expect(markEpisodeSeen(db, gymId, id)).rejects.toThrow()
		const claims = await db
			.select()
			.from(gymRewards)
			.where(eq(gymRewards.gymId, gymId))
		const mine = claims.filter((c) => c.source.startsWith("room:"))
		expect(mine).toHaveLength(1)
		expect(mine[0].sweat + mine[0].greens).toBe(0)
	})
})
