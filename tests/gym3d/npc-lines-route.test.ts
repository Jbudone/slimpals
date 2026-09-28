import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymNpcDialogBatches,
	invites,
	userGymNpcRelationships,
	userGyms,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

// Any AI call fails the test: bubble lines never generate text.
let aiCalls = 0
const noAI = new Proxy({} as AIService, {
	get: () => async () => {
		aiCalls++
		throw new Error("no AI calls expected")
	},
})

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: noAI })

let inviteN = 0
async function registerAndLogin(email: string, name = "Member") {
	const db = await getTestDb()
	const code = `LINES-INVITE-${++inviteN}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({ name, email, password: "Password1!", inviteCode: code })
	const cookies = res.headers["set-cookie"] as string[]
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId: res.body.user.id as string,
	}
}

async function gymIdOf(cookie: string): Promise<number> {
	const r = await request(app).get("/api/gym").set("Cookie", cookie)
	return r.body.gym.id as number
}

type LinesBody = {
	npcs: { key: string; lines: string[]; friends: string[]; rivals: string[] }[]
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
	aiCalls = 0
})

afterAll(async () => {
	await closeTestDb()
})

describe("GET /api/gym/npc-lines", () => {
	it("returns 401 without auth", async () => {
		await request(app).get("/api/gym/npc-lines").expect(401)
	})

	it("lists unlocked NPCs with friends and rivals, and no locked ones", async () => {
		const { cookie } = await registerAndLogin("l1@slimpals.test")
		const res = await request(app)
			.get("/api/gym/npc-lines")
			.set("Cookie", cookie)
			.expect(200)
		const body = res.body as LinesBody
		const keys = body.npcs.map((n) => n.key)
		expect(keys).toContain("trainer_marcus")
		expect(keys).toContain("receptionist_lisa")
		// gated by upgrades this new gym does not have
		expect(keys).not.toContain("manager_alex")
		expect(keys).not.toContain("hero_bodybuilder_rex")
		const marcus = body.npcs.find((n) => n.key === "trainer_marcus")
		expect(marcus?.friends).toEqual(["regular_priya"])
		expect(marcus?.rivals).toEqual(["regular_tom"])
		expect(marcus?.lines).toEqual([])
		expect(aiCalls).toBe(0)
	})

	it("cuts lines from valid dialog batches and fired milestones only", async () => {
		const { cookie } = await registerAndLogin("l2@slimpals.test")
		const gymId = await gymIdOf(cookie)
		const db = await getTestDb()
		const dialog = (promptText: string, response: string) => ({
			promptText,
			response,
			portraitVariant: "happy",
			personalityTagAdded: null,
		})
		await db.insert(gymNpcDialogBatches).values([
			{
				gymId,
				npcKey: "receptionist_lisa",
				relationshipStage: 0,
				dialogs: [
					dialog(
						"Did you see the new juice menu?",
						"*waves* Welcome back! The mango one is amazing.",
					),
				],
				expiresAt: new Date(Date.now() + 3_600_000),
			},
			{
				gymId,
				npcKey: "regular_tom",
				relationshipStage: 0,
				dialogs: [dialog("This is an old line.", "Old news, friend.")],
				expiresAt: new Date(Date.now() - 3_600_000),
			},
		])
		await db.insert(userGymNpcRelationships).values({
			gymId,
			npcKey: "trainer_marcus",
			relationshipLevel: 60,
			milestoneDialogsFired: ["marcus_stage2"],
		})
		const res = await request(app)
			.get("/api/gym/npc-lines")
			.set("Cookie", cookie)
			.expect(200)
		const body = res.body as LinesBody
		const lisa = body.npcs.find((n) => n.key === "receptionist_lisa")
		expect(lisa?.lines).toEqual([
			"Did you see the new juice menu?",
			"Welcome back!",
			"The mango one is amazing.",
		])
		// expired batch: nothing
		expect(body.npcs.find((n) => n.key === "regular_tom")?.lines).toEqual([])
		const marcus = body.npcs.find((n) => n.key === "trainer_marcus")
		expect(marcus?.lines).toContain("You've earned this.")
		for (const n of body.npcs)
			for (const l of n.lines) expect(l).not.toMatch(/\*/)
		expect(aiCalls).toBe(0)
	})

	it("only reads the caller's own gym", async () => {
		const a = await registerAndLogin("l3@slimpals.test")
		const b = await registerAndLogin("l4@slimpals.test")
		const gymA = await gymIdOf(a.cookie)
		await gymIdOf(b.cookie)
		const db = await getTestDb()
		await db.insert(gymNpcDialogBatches).values({
			gymId: gymA,
			npcKey: "receptionist_lisa",
			relationshipStage: 0,
			dialogs: [
				{
					promptText: "A secret for gym A only.",
					response: "Shh.",
					portraitVariant: "happy",
					personalityTagAdded: null,
				},
			],
			expiresAt: new Date(Date.now() + 3_600_000),
		})
		const res = await request(app)
			.get("/api/gym/npc-lines")
			.set("Cookie", b.cookie)
			.expect(200)
		const lisa = (res.body as LinesBody).npcs.find(
			(n) => n.key === "receptionist_lisa",
		)
		expect(lisa?.lines).toEqual([])
	})
})

describe("POST /api/admin/users/:id/gym/today-event", () => {
	const EVENT = {
		type: "competition",
		title: "Plank-off",
		description: "Longest plank wins",
		npcKey: "trainer_marcus",
		activeHours: [0, 24],
		effects: { allNpcMoodBonus: 10, xpMultiplier: 2 },
	}

	it("is admin only", async () => {
		const { cookie, userId } = await registerAndLogin("e1@slimpals.test")
		await request(app)
			.post(`/api/admin/users/${userId}/gym/today-event`)
			.set("Cookie", cookie)
			.send({ event: EVENT })
			.expect(403)
	})

	it("validates, sets and clears the event (sim-state reports it)", async () => {
		const admin = await registerAndLogin("e2@slimpals.test", "Admin Two")
		const db = await getTestDb()
		await db
			.update(users)
			.set({ isAdmin: true })
			.where(eq(users.id, admin.userId))
		const member = await registerAndLogin("e3@slimpals.test")
		const gymId = await gymIdOf(member.cookie)
		const url = `/api/admin/users/${member.userId}/gym/today-event`

		await request(app)
			.post(url)
			.set("Cookie", admin.cookie)
			.send({ event: { ...EVENT, type: "rave" } })
			.expect(400)
		await request(app)
			.post(url)
			.set("Cookie", admin.cookie)
			.send({ event: { ...EVENT, activeHours: [20, 10] } })
			.expect(400)

		await request(app)
			.post(url)
			.set("Cookie", admin.cookie)
			.send({ event: EVENT })
			.expect(200)
		const [g] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))
		expect(g.todayEventData).toMatchObject({
			type: "competition",
			title: "Plank-off",
			npcKey: "trainer_marcus",
		})
		const sim = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", member.cookie)
			.expect(200)
		expect(sim.body.todayEvent.title).toBe("Plank-off")

		await request(app)
			.post(url)
			.set("Cookie", admin.cookie)
			.send({ event: null })
			.expect(200)
		const [g2] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))
		expect(g2.todayEventData).toBeNull()
		expect(aiCalls).toBe(0)
	})
})
