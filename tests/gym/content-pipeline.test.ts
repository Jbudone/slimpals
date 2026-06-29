import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	userGymNpcRelationships,
	userGyms,
	users,
} from "../../server/db/schema.js"
import type { AIService, GymEventData } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const MOCK_EVENT: GymEventData = {
	type: "competition",
	title: "Morning Power Hour",
	description: "Marcus is running a group training session at 7am.",
	npcKey: "trainer_marcus",
	activeHours: [7, 9],
	effects: { allNpcMoodBonus: 20, xpMultiplier: 1.5 },
}

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
	generateNpcDialogs: async () => [
		{
			promptText: "How's training?",
			response: "Great, thanks!",
			portraitVariant: "happy",
			personalityTagAdded: null,
		},
	],
	generateGymEvent: async () => MOCK_EVENT,
	generateNpcPortrait: async () => null,
	generateMonthlyChallenge: async () => ({
		title: "Test",
		description: "Test challenge",
		theme: "fitness",
		goals: [],
	}),
	generateWeeklySprint: async () => ({ title: "Test Sprint", tasks: [] }),
}

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
		isAdmin: true,
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
		password: "TestPass1!",
		inviteCode,
	})
	expect(res.status, `signup failed: ${JSON.stringify(res.body)}`).toBe(200)
	const cookies = (res.headers["set-cookie"] as string[]) ?? []
	return cookies.join("; ")
}

beforeAll(async () => {
	await resetSchema()
})

afterAll(async () => {
	await closeTestDb()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

describe("POST /api/gym/generate-content (admin)", () => {
	it("gym event is null until content is generated", async () => {
		const cookie = await registerAndLogin()
		const db = await getTestDb()

		const gymRes = await request(app).get("/api/gym").set("Cookie", cookie)
		expect(gymRes.status).toBe(200)
		const gymId = gymRes.body.gym.id

		expect(gymId).toBeGreaterThan(0)

		// todayEventData is null before any content generation
		const [gym] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))
		expect(gym.todayEventData).toBeNull()
	})
})

describe("POST /api/gym/cron/generate-content", () => {
	it("rejects requests without correct CRON_SECRET", async () => {
		const res = await request(app)
			.post("/api/gym/cron/generate-content")
			.set("x-cron-secret", "wrong-secret")
		expect(res.status).toBe(401)
	})

	it("returns 200 with correct CRON_SECRET even if no gyms exist", async () => {
		const secret = process.env.CRON_SECRET ?? "test-secret"
		process.env.CRON_SECRET = secret
		const res = await request(app)
			.post("/api/gym/cron/generate-content")
			.set("x-cron-secret", secret)
		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			processed: expect.any(Number),
			skipped: expect.any(Number),
		})
	})

	it("processes gyms created within last 7 days", async () => {
		const cookie = await registerAndLogin()
		// Trigger gym creation
		await request(app).get("/api/gym").set("Cookie", cookie)

		const secret = process.env.CRON_SECRET ?? "test-secret"
		process.env.CRON_SECRET = secret
		const res = await request(app)
			.post("/api/gym/cron/generate-content")
			.set("x-cron-secret", secret)
		expect(res.status).toBe(200)
		// processed >= 1 since the user created a gym
		expect(res.body.processed).toBeGreaterThanOrEqual(1)
	})
})

describe("POST /api/gym/memory-event", () => {
	it("requires authentication", async () => {
		const res = await request(app)
			.post("/api/gym/memory-event")
			.send({ eventType: "badge_earned", metadata: {} })
		expect(res.status).toBe(401)
	})

	it("appends memory event to NPCs with relationship level >= 25", async () => {
		const cookie = await registerAndLogin()
		const db = await getTestDb()

		// Create gym
		await request(app).get("/api/gym").set("Cookie", cookie)
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, "user@slimpals.test"))
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, user.id))

		// Manually set a relationship level >= 25 for trainer_marcus
		const [rel] = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.gymId, gym.id))

		if (rel) {
			await db
				.update(userGymNpcRelationships)
				.set({ relationshipLevel: 30 })
				.where(eq(userGymNpcRelationships.id, rel.id))

			const res = await request(app)
				.post("/api/gym/memory-event")
				.set("Cookie", cookie)
				.send({
					eventType: "badge_earned",
					metadata: { badge: "first_checkin" },
				})
			expect(res.status).toBe(200)

			// The NPC with level >= 25 should now have a memory event
			const [updated] = await db
				.select()
				.from(userGymNpcRelationships)
				.where(eq(userGymNpcRelationships.id, rel.id))
			const events = updated.gymMemoryEvents as Array<{
				event: string
				referenced: boolean
			}>
			expect(events.length).toBeGreaterThan(0)
			expect(events[0].event).toContain("badge_earned")
			expect(events[0].referenced).toBe(false)
		}
	})

	it("does not append to NPCs with level < 25", async () => {
		const cookie = await registerAndLogin()
		const db = await getTestDb()

		await request(app).get("/api/gym").set("Cookie", cookie)
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, "user@slimpals.test"))
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, user.id))

		// All fresh relationships start at 0 (< 25)
		const res = await request(app)
			.post("/api/gym/memory-event")
			.set("Cookie", cookie)
			.send({ eventType: "badge_earned", metadata: {} })
		expect(res.status).toBe(200)

		// No NPCs should have memory events since all are at level 0
		const rels = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.gymId, gym.id))
		for (const r of rels) {
			const events = r.gymMemoryEvents as unknown[]
			expect(events.length).toBe(0)
		}
	})
})

describe("GET /api/gym (todayEvent in response)", () => {
	it("returns todayEvent field (null when none set)", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app).get("/api/gym").set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body).toHaveProperty("todayEvent")
		expect(res.body.todayEvent).toBeNull()
	})

	it("returns todayEvent when set in DB", async () => {
		const cookie = await registerAndLogin()
		const db = await getTestDb()

		await request(app).get("/api/gym").set("Cookie", cookie)
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, "user@slimpals.test"))
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, user.id))

		await db
			.update(userGyms)
			.set({ todayEventData: MOCK_EVENT })
			.where(eq(userGyms.id, gym.id))

		const res = await request(app).get("/api/gym").set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body.todayEvent).toMatchObject({
			type: "competition",
			title: "Morning Power Hour",
			npcKey: "trainer_marcus",
		})
	})
})

describe("GET /api/gym/sim-state (todayEvent position override)", () => {
	it("returns todayEvent in sim-state response", async () => {
		const cookie = await registerAndLogin()
		const db = await getTestDb()

		await request(app).get("/api/gym").set("Cookie", cookie)
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, "user@slimpals.test"))
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, user.id))

		await db
			.update(userGyms)
			.set({ todayEventData: MOCK_EVENT })
			.where(eq(userGyms.id, gym.id))

		const res = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", cookie)
		expect(res.status).toBe(200)
		expect(res.body).toHaveProperty("todayEvent")
	})
})
