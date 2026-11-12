import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

let n = 0
async function login(email: string, admin: boolean) {
	const db = await getTestDb()
	const code = `STUDIO-${++n}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({ name: "T", email, password: "Password1!", inviteCode: code })
	const id = res.body.user.id as string
	if (admin)
		await db.update(users).set({ isAdmin: true }).where(eq(users.id, id))
	const c = res.headers["set-cookie"] as string[]
	return Array.isArray(c) ? c.join("; ") : c
}

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "admin@slimpals.test", name: "Admin" })
})
afterAll(async () => {
	await closeTestDb()
})

describe("studio API", () => {
	it("is for admins only", async () => {
		const cookie = await login("p@slimpals.test", false)
		expect(
			(await request(app).get("/api/admin/studio/pieces").set("Cookie", cookie))
				.status,
		).toBe(403)
	})
	it("keeps pieces, versions and restores", async () => {
		const cookie = await login("boss@slimpals.test", true)
		const make = await request(app)
			.post("/api/admin/studio/pieces")
			.set("Cookie", cookie)
			.send({ title: "Mouth tape", kind: "bro-hype" })
		expect(make.status).toBe(201)
		const id = make.body.id
		const a = await request(app)
			.patch(`/api/admin/studio/pieces/${id}`)
			.set("Cookie", cookie)
			.send({ script: "brody | Tape it." })
		expect(a.body.version).toBe(1)
		const same = await request(app)
			.patch(`/api/admin/studio/pieces/${id}`)
			.set("Cookie", cookie)
			.send({ script: "brody | Tape it.", status: "in_progress" })
		expect(same.body.version).toBe(1)
		const b = await request(app)
			.patch(`/api/admin/studio/pieces/${id}`)
			.set("Cookie", cookie)
			.send({ script: "brody | Tape it.\nkev | No." })
		expect(b.body.version).toBe(2)
		const back = await request(app)
			.patch(`/api/admin/studio/pieces/${id}`)
			.set("Cookie", cookie)
			.send({ restore: 1 })
		expect(back.body.version).toBe(3)
		const got = await request(app)
			.get(`/api/admin/studio/pieces/${id}`)
			.set("Cookie", cookie)
		expect(got.body.piece.lines).toEqual([{ who: "brody", text: "Tape it." }])
		expect(got.body.piece.status).toBe("in_progress")
		expect(got.body.versions).toHaveLength(3)
		const list = await request(app)
			.get("/api/admin/studio/pieces")
			.set("Cookie", cookie)
		expect(list.body.pieces[0].lineCount).toBe(1)
	})
})
