import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	gymNpcDailyState,
	gymNpcs,
	invites,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { getOrCreateGym } from "../../server/services/gym/index.js"
import {
	computeGymSimState,
	type GymNpc,
} from "../../server/services/gym/simulation.js"
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
	generateVictoryMessage: async (userName) =>
		`Congrats ${userName}, you crushed it!`,
	generateWeeklyInspiration: async () => "Keep pushing this week!",
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

describe("NPC seeding", () => {
	it("seeds 8 NPCs to gym_npcs", async () => {
		const db = await getTestDb()
		const npcs = await db.select().from(gymNpcs)
		expect(npcs).toHaveLength(8)
	})

	it("each NPC has required fields", async () => {
		const db = await getTestDb()
		const npcs = await db.select().from(gymNpcs)

		for (const npc of npcs) {
			expect(npc.key).toBeTruthy()
			expect(npc.name).toBeTruthy()
			expect(["trainer", "receptionist", "regular", "specialist"]).toContain(
				npc.role,
			)
			expect(npc.personalityProfile).toBeTruthy()
			expect(npc.defaultSchedule).toBeTruthy()
			expect(npc.spriteKey).toBeTruthy()
		}
	})

	it("specialist NPCs have unlockedByUpgradeKey set", async () => {
		const db = await getTestDb()
		const npcs = await db.select().from(gymNpcs)
		const specialists = npcs.filter((n) => n.role === "specialist")

		expect(specialists.length).toBeGreaterThan(0)
		for (const s of specialists) {
			expect(s.unlockedByUpgradeKey).toBeTruthy()
		}
	})
})

describe("computeGymSimState — NPC presence", () => {
	it("shows NPC as present during their scheduled hours", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-sim-1",
			email: "simuser@test.com",
			name: "Sim User",
		})
		const gym = await getOrCreateGym("user-sim-1", db)

		const marcus: GymNpc = {
			key: "trainer_marcus",
			name: "Marcus",
			role: "trainer",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["weights_barbell"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_trainer_marcus",
			unlockedByUpgradeKey: null,
		}

		const noon = new Date("2026-06-17T12:00:00")
		const states = await computeGymSimState(
			gym.id,
			[marcus],
			["weights_barbell"],
			[],
			db,
			noon,
		)

		expect(states).toHaveLength(1)
		expect(states[0].isPresent).toBe(true)
		expect(states[0].npcKey).toBe("trainer_marcus")
	})

	it("shows NPC as not present outside their scheduled hours", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-sim-2",
			email: "simuser2@test.com",
			name: "Sim User 2",
		})
		const gym = await getOrCreateGym("user-sim-2", db)

		const derek: GymNpc = {
			key: "regular_derek",
			name: "Derek",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["weights_olympic"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 50,
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 8,
				daysOfWeek: [1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 100, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_regular_derek",
			unlockedByUpgradeKey: null,
		}

		const afternoon = new Date("2026-06-17T14:00:00")
		const states = await computeGymSimState(
			gym.id,
			[derek],
			["weights_olympic"],
			[],
			db,
			afternoon,
		)

		expect(states).toHaveLength(1)
		expect(states[0].isPresent).toBe(false)
	})

	it("shows NPC as not present on wrong day of week", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-sim-3",
			email: "simuser3@test.com",
			name: "Sim User 3",
		})
		const gym = await getOrCreateGym("user-sim-3", db)

		const coach: GymNpc = {
			key: "specialist_coach",
			name: "Coach Rivera",
			role: "specialist",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: [],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 70,
			},
			defaultSchedule: {
				arrivalHour: 9,
				departureHour: 12,
				daysOfWeek: [2, 4, 6],
				activitySequence: [
					{ type: "main", durationMin: 120, equipmentCategory: "cardio" },
				],
			},
			spriteKey: "npc_specialist_coach",
			unlockedByUpgradeKey: "staff_trainer",
		}

		// 2026-06-17 is a Wednesday (day 3) — coach is only on Tue/Thu/Sat
		const wednesday = new Date("2026-06-17T10:00:00")
		const states = await computeGymSimState(
			gym.id,
			[coach],
			["staff_trainer"],
			[],
			db,
			wednesday,
		)

		const coachState = states.find((s) => s.npcKey === "specialist_coach")
		expect(coachState?.isPresent).toBe(false)
	})
})

describe("computeGymSimState — equipment conflicts", () => {
	it("assigns different equipment to NPCs wanting the same piece", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-conflict",
			email: "conflict@test.com",
			name: "Conflict User",
		})
		const gym = await getOrCreateGym("user-conflict", db)

		const npc1: GymNpc = {
			key: "npc_a",
			name: "NPC A",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["weights_barbell"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_a",
			unlockedByUpgradeKey: null,
		}

		const npc2: GymNpc = {
			key: "npc_b",
			name: "NPC B",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["weights_barbell"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_b",
			unlockedByUpgradeKey: null,
		}

		const noon = new Date("2026-06-17T12:00:00")
		const states = await computeGymSimState(
			gym.id,
			[npc1, npc2],
			["weights_barbell", "weights_dumbbells", "weights_cable"],
			[],
			db,
			noon,
		)

		const presentStates = states.filter((s) => s.isPresent)
		expect(presentStates).toHaveLength(2)

		const equipKeys = presentStates
			.map((s) => s.targetEquipmentKey)
			.filter(Boolean)
		const uniqueKeys = new Set(equipKeys)
		expect(uniqueKeys.size).toBe(equipKeys.length)
	})
})

describe("computeGymSimState — mood computation", () => {
	it("computes mood from baseline + events", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-mood",
			email: "mood@test.com",
			name: "Mood User",
		})
		const gym = await getOrCreateGym("user-mood", db)

		const npc: GymNpc = {
			key: "mood_npc",
			name: "Mood NPC",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["weights_barbell"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "mood_npc",
			unlockedByUpgradeKey: null,
		}

		const noon = new Date("2026-06-17T12:00:00")
		const states = await computeGymSimState(
			gym.id,
			[npc],
			["weights_barbell"],
			[],
			db,
			noon,
		)

		expect(states[0].mood).toBeGreaterThanOrEqual(-100)
		expect(states[0].mood).toBeLessThanOrEqual(100)
	})
})

describe("computeGymSimState — upgrade gating", () => {
	it("hides NPC when their unlock upgrade is not claimed", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-gate",
			email: "gate@test.com",
			name: "Gate User",
		})
		const gym = await getOrCreateGym("user-gate", db)

		const gatedNpc: GymNpc = {
			key: "gated_npc",
			name: "Gated NPC",
			role: "specialist",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: [],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 65,
			},
			defaultSchedule: {
				arrivalHour: 9,
				departureHour: 17,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 120, equipmentCategory: "staff" },
				],
			},
			spriteKey: "gated_npc",
			unlockedByUpgradeKey: "staff_nutrition",
		}

		const noon = new Date("2026-06-17T12:00:00")

		const withoutUpgrade = await computeGymSimState(
			gym.id,
			[gatedNpc],
			[],
			[],
			db,
			noon,
		)
		expect(withoutUpgrade).toHaveLength(0)

		const withUpgrade = await computeGymSimState(
			gym.id,
			[gatedNpc],
			["staff_nutrition"],
			[],
			db,
			noon,
		)
		expect(withUpgrade).toHaveLength(1)
		expect(withUpgrade[0].isPresent).toBe(true)
	})
})

describe("computeGymSimState — daily state creation", () => {
	it("creates daily state once per day per NPC", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-daily",
			email: "daily@test.com",
			name: "Daily User",
		})
		const gym = await getOrCreateGym("user-daily", db)

		const npc: GymNpc = {
			key: "daily_npc",
			name: "Daily NPC",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: [],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "daily_npc",
			unlockedByUpgradeKey: null,
		}

		const noon = new Date("2026-06-17T12:00:00")

		await computeGymSimState(gym.id, [npc], ["weights_dumbbells"], [], db, noon)
		await computeGymSimState(gym.id, [npc], ["weights_dumbbells"], [], db, noon)

		const dailyStates = await db
			.select()
			.from(gymNpcDailyState)
			.where(eq(gymNpcDailyState.npcKey, "daily_npc"))

		expect(dailyStates).toHaveLength(1)
	})
})

describe("GET /api/gym/sim-state", () => {
	it("returns sim state with NPC list", async () => {
		const cookies = await registerAndLogin()

		await request(app).get("/api/gym").set("Cookie", cookies)

		const res = await request(app)
			.get("/api/gym/sim-state")
			.set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(res.body.simTime).toBeTruthy()
		expect(res.body.gymId).toBeGreaterThan(0)
		expect(Array.isArray(res.body.npcs)).toBe(true)

		for (const npc of res.body.npcs) {
			expect(npc).toHaveProperty("npcKey")
			expect(npc).toHaveProperty("isPresent")
			expect(npc).toHaveProperty("position")
			expect(npc).toHaveProperty("currentActivity")
			expect(npc).toHaveProperty("mood")
			expect(npc).toHaveProperty("currentAnimation")
			expect(npc).toHaveProperty("isInteractable")
		}
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/gym/sim-state")
		expect(res.status).toBe(401)
	})
})

describe("GET /api/gym/npcs", () => {
	it("returns visible NPCs with relationship data", async () => {
		const cookies = await registerAndLogin()

		await request(app).get("/api/gym").set("Cookie", cookies)

		const res = await request(app).get("/api/gym/npcs").set("Cookie", cookies)

		expect(res.status).toBe(200)
		expect(Array.isArray(res.body)).toBe(true)
		expect(res.body.length).toBeGreaterThan(0)

		for (const npc of res.body) {
			expect(npc).toHaveProperty("key")
			expect(npc).toHaveProperty("name")
			expect(npc).toHaveProperty("role")
			expect(npc).toHaveProperty("spriteKey")
			expect(npc).toHaveProperty("relationshipLevel")
			expect(npc).toHaveProperty("interactionCount")
		}
	})

	it("hides specialist NPCs when upgrade not unlocked", async () => {
		const cookies = await registerAndLogin()

		await request(app).get("/api/gym").set("Cookie", cookies)

		const res = await request(app).get("/api/gym/npcs").set("Cookie", cookies)

		const specialistKeys = ["specialist_coach", "specialist_nutritionist"]
		const visibleSpecialists = res.body.filter((n: { key: string }) =>
			specialistKeys.includes(n.key),
		)

		expect(visibleSpecialists).toHaveLength(0)
	})

	it("returns 401 without auth", async () => {
		const res = await request(app).get("/api/gym/npcs")
		expect(res.status).toBe(401)
	})
})
