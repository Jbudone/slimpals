import { and, eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymNpcDialogBatches,
	invites,
	userGymNpcRelationships,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	computeRelationshipGain,
	deriveRelationshipFromDays,
	getRelationshipStage,
	getStageLabel,
} from "../../server/services/gym/dialog.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const MOCK_DIALOGS = [
	{
		promptText: "How's your training going?",
		response: "Can't complain! Hit a new PR yesterday.",
		portraitVariant: "happy",
		personalityTagAdded: "interested_in_PRs",
	},
	{
		promptText: "Any tips for a beginner?",
		response: "Start light and focus on form. Trust me.",
		portraitVariant: "neutral",
		personalityTagAdded: "seeking_advice",
	},
	{
		promptText: "What's your favorite exercise?",
		response: "Deadlifts, no contest. Best compound movement there is.",
		portraitVariant: "determined",
		personalityTagAdded: "likes_deadlifts",
	},
]

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) =>
		`Congrats ${userName}, you crushed it!`,
	generateWeeklyInspiration: async () => "Keep pushing this week!",
	generateNpcDialogs: async () => MOCK_DIALOGS,
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
	await db.insert(invites).values({
		code: "VALID-INVITE",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email = "user@slimpals.test",
	name = "Test User",
	inviteCode = "VALID-INVITE",
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
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

describe("getRelationshipStage", () => {
	it("returns stage 0 for 0-24", () => {
		expect(getRelationshipStage(0)).toBe(0)
		expect(getRelationshipStage(24)).toBe(0)
	})

	it("returns stage 1 for 25-49", () => {
		expect(getRelationshipStage(25)).toBe(1)
		expect(getRelationshipStage(49)).toBe(1)
	})

	it("returns stage 2 for 50-74", () => {
		expect(getRelationshipStage(50)).toBe(2)
		expect(getRelationshipStage(74)).toBe(2)
	})

	it("returns stage 3 for 75-100", () => {
		expect(getRelationshipStage(75)).toBe(3)
		expect(getRelationshipStage(100)).toBe(3)
	})
})

describe("getStageLabel", () => {
	it("returns correct labels", () => {
		expect(getStageLabel(0)).toBe("Stranger")
		expect(getStageLabel(1)).toBe("Acquaintance")
		expect(getStageLabel(2)).toBe("Gym Buddy")
		expect(getStageLabel(3)).toBe("Friend")
	})
})

describe("computeRelationshipGain", () => {
	it("returns a number within expected range", () => {
		for (let i = 0; i < 20; i++) {
			const gain = computeRelationshipGain(0)
			expect(gain).toBeGreaterThanOrEqual(5)
			expect(gain).toBeLessThanOrEqual(8)
		}
	})
})

describe("deriveRelationshipFromDays", () => {
	it("is 0 at day 0", () => {
		expect(deriveRelationshipFromDays(0).relationshipLevel).toBe(0)
	})

	it("reaches 100 by day 90 (the 'Established' checkpoint)", () => {
		expect(deriveRelationshipFromDays(90).relationshipLevel).toBe(100)
	})

	it("is deterministic — same daysElapsed always produces the same output", () => {
		expect(deriveRelationshipFromDays(30)).toEqual(
			deriveRelationshipFromDays(30),
		)
	})

	it("is monotonic — relationshipLevel never decreases as daysElapsed increases", () => {
		let previous = -1
		for (let day = 0; day <= 120; day += 5) {
			const { relationshipLevel } = deriveRelationshipFromDays(day)
			expect(relationshipLevel).toBeGreaterThanOrEqual(previous)
			previous = relationshipLevel
		}
	})

	it("clamps at 100 beyond the ramp window rather than exceeding it", () => {
		expect(deriveRelationshipFromDays(365).relationshipLevel).toBe(100)
	})

	it("sets gymDaysActive to daysElapsed directly", () => {
		expect(deriveRelationshipFromDays(42).gymDaysActive).toBe(42)
	})

	it("clamps negative daysElapsed to 0 instead of producing invalid output", () => {
		expect(deriveRelationshipFromDays(-5)).toEqual({
			relationshipLevel: 0,
			gymDaysActive: 0,
		})
	})
})

describe("GET /api/gym/npc/:key", () => {
	it("returns NPC details with prompts", async () => {
		const cookies = await registerAndLogin()
		await request(app).get("/api/gym").set("Cookie", cookies)

		const res = await request(app)
			.get("/api/gym/npc/trainer_marcus")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.npc.key).toBe("trainer_marcus")
		expect(res.body.npc.name).toBe("Marcus")
		expect(res.body.relationship).toHaveProperty("level")
		expect(res.body.relationship).toHaveProperty("stage")
		expect(res.body.relationship).toHaveProperty("stageLabel")
		expect(Array.isArray(res.body.prompts)).toBe(true)
		expect(res.body.prompts.length).toBeGreaterThan(0)
	})

	it("returns 404 for unknown NPC", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.get("/api/gym/npc/unknown_npc")
			.set("Cookie", cookies)

		expect(res.status).toBe(404)
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/gym/npc/trainer_marcus")
		expect(res.status).toBe(401)
	})
})

describe("POST /api/gym/npc/interact", () => {
	it("returns dialog response and updates relationship", async () => {
		const cookies = await registerAndLogin()
		await request(app).get("/api/gym").set("Cookie", cookies)

		await request(app).get("/api/gym/npc/trainer_marcus").set("Cookie", cookies)

		const res = await request(app)
			.post("/api/gym/npc/interact")
			.set("Cookie", cookies)
			.send({ npcKey: "trainer_marcus", promptIndex: 0 })

		expect(res.status).toBe(200)
		expect(res.body.dialog).toHaveProperty("promptText")
		expect(res.body.dialog).toHaveProperty("response")
		expect(res.body.dialog).toHaveProperty("portraitVariant")
		expect(res.body.relationship.level).toBeGreaterThan(0)
		expect(res.body.relationship.gain).toBeGreaterThan(0)
	})

	it("accumulates personality notes", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()
		await request(app).get("/api/gym").set("Cookie", cookies)

		await request(app).get("/api/gym/npc/trainer_marcus").set("Cookie", cookies)

		await request(app)
			.post("/api/gym/npc/interact")
			.set("Cookie", cookies)
			.send({ npcKey: "trainer_marcus", promptIndex: 0 })

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		const [rel] = await db
			.select()
			.from(userGymNpcRelationships)
			.where(
				and(
					eq(userGymNpcRelationships.gymId, gymId),
					eq(userGymNpcRelationships.npcKey, "trainer_marcus"),
				),
			)

		const notes = rel.personalityNotes as string[]
		expect(notes).toContain("interested_in_PRs")
	})

	it("detects stage advancement", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()
		await request(app).get("/api/gym").set("Cookie", cookies)

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await request(app).get("/api/gym/npc/trainer_marcus").set("Cookie", cookies)

		await db
			.update(userGymNpcRelationships)
			.set({ relationshipLevel: 23 })
			.where(
				and(
					eq(userGymNpcRelationships.gymId, gymId),
					eq(userGymNpcRelationships.npcKey, "trainer_marcus"),
				),
			)

		const res = await request(app)
			.post("/api/gym/npc/interact")
			.set("Cookie", cookies)
			.send({ npcKey: "trainer_marcus", promptIndex: 0 })

		expect(res.status).toBe(200)
		if (res.body.relationship.level >= 25) {
			expect(res.body.stageAdvanced).toBe(true)
			expect(res.body.newStage).toBe(1)
		}
	})

	it("rejects missing npcKey", async () => {
		const cookies = await registerAndLogin()
		const res = await request(app)
			.post("/api/gym/npc/interact")
			.set("Cookie", cookies)
			.send({ promptIndex: 0 })

		expect(res.status).toBe(400)
	})

	it("rejects invalid promptIndex", async () => {
		const cookies = await registerAndLogin()
		await request(app).get("/api/gym").set("Cookie", cookies)
		await request(app).get("/api/gym/npc/trainer_marcus").set("Cookie", cookies)

		const res = await request(app)
			.post("/api/gym/npc/interact")
			.set("Cookie", cookies)
			.send({ npcKey: "trainer_marcus", promptIndex: 999 })

		expect(res.status).toBe(400)
	})

	it("returns 401 without auth", async () => {
		const res = await request(app)
			.post("/api/gym/npc/interact")
			.send({ npcKey: "trainer_marcus", promptIndex: 0 })

		expect(res.status).toBe(401)
	})
})

describe("dialog batch expiry", () => {
	it("uses cached batch when not expired", async () => {
		const cookies = await registerAndLogin()
		await request(app).get("/api/gym").set("Cookie", cookies)

		const res1 = await request(app)
			.get("/api/gym/npc/trainer_marcus")
			.set("Cookie", cookies)

		const res2 = await request(app)
			.get("/api/gym/npc/trainer_marcus")
			.set("Cookie", cookies)

		expect(res1.body.prompts).toEqual(res2.body.prompts)

		const db = await getTestDb()
		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		const batches = await db
			.select()
			.from(gymNpcDialogBatches)
			.where(
				and(
					eq(gymNpcDialogBatches.gymId, gymId),
					eq(gymNpcDialogBatches.npcKey, "trainer_marcus"),
				),
			)

		expect(batches).toHaveLength(1)
	})

	it("generates new batch when expired", async () => {
		const cookies = await registerAndLogin()
		const db = await getTestDb()
		await request(app).get("/api/gym").set("Cookie", cookies)

		await request(app).get("/api/gym/npc/trainer_marcus").set("Cookie", cookies)

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookies)
		const gymId = gymRes.body.gym.id

		await db
			.update(gymNpcDialogBatches)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(
				and(
					eq(gymNpcDialogBatches.gymId, gymId),
					eq(gymNpcDialogBatches.npcKey, "trainer_marcus"),
				),
			)

		await request(app).get("/api/gym/npc/trainer_marcus").set("Cookie", cookies)

		const batches = await db
			.select()
			.from(gymNpcDialogBatches)
			.where(
				and(
					eq(gymNpcDialogBatches.gymId, gymId),
					eq(gymNpcDialogBatches.npcKey, "trainer_marcus"),
				),
			)

		expect(batches.length).toBeGreaterThanOrEqual(2)
	})
})
