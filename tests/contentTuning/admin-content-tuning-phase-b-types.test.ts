import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
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
	generateVictoryMessage: async () => "Victory!",
	generateWeeklyInspiration: async () => "Inspiration!",
	generateMonthlyChallenge: async () => ({
		title: "Challenge",
		description: "desc",
		theme: "wellness",
		goals: [],
	}),
	generateWeeklySprint: async () => ({ title: "Sprint", tasks: [] }),
	generateNpcDialogs: async (prompt) => [
		{
			promptText: `derived from prompt of length ${prompt.length}`,
			response: "Hey there!",
			portraitVariant: "happy",
			personalityTagAdded: null,
		},
	],
	generateGymEvent: async (prompt) => ({
		type: "class",
		title: `Event for prompt of length ${prompt.length}`,
		description: "A fun class",
		npcKey: "trainer_marcus",
		activeHours: [7, 9],
		effects: { allNpcMoodBonus: 10 },
	}),
} as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
}

async function createInvite(code: string) {
	const db = await getTestDb()
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

let inviteCounter = 0

async function registerAndLogin(email: string, name: string) {
	const inviteCode = `CT-PHASEB-INVITE-${++inviteCounter}`
	await createInvite(inviteCode)
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	const userId = res.body.user.id as string
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId,
	}
}

async function makeAdmin(userId: string) {
	const db = await getTestDb()
	await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId))
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

afterAll(async () => {
	await closeTestDb()
})

describe("GET /api/admin/content-tuning/types (Phase B rollout)", () => {
	it("includes NPC dialog and gym events", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-phaseb-types@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.get("/api/admin/content-tuning/types")
			.set("Cookie", cookie)

		expect(res.status).toBe(200)
		const keys = res.body.map((t: { key: string }) => t.key)
		expect(keys).toEqual(expect.arrayContaining(["npc_dialog", "gym_events"]))
	})
})

describe("POST /api/admin/content-tuning/npc_dialog/default/generate", () => {
	it("builds a prompt from the preset NPC profile and returns formatted dialog", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-npcdialog-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/npc_dialog/default/generate")
			.set("Cookie", cookie)
			.send({
				contextParams: { npcProfile: "chill_regular", relationshipStage: "2" },
			})
		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("Q: derived from prompt of length")
		expect(res.body.sample).toContain("A: Hey there!")
	})
})

describe("POST /api/admin/content-tuning/gym_events/default/generate", () => {
	it("builds a prompt from the preset level tier and returns a formatted event", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-gymevents-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/gym_events/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { levelTier: "late_game" } })
		expect(res.status).toBe(200)
		expect(res.body.sample).toContain("[class] Event for prompt of length")
		expect(res.body.sample).toContain("Host: trainer_marcus")
	})
})
