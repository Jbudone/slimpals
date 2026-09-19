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
import { GYM_NPC_ROLES } from "../../shared/types.js"
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
	generateNpcDialogs: async () => [],
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
	it("seeds 12 NPCs to gym_npcs", async () => {
		const db = await getTestDb()
		const npcs = await db.select().from(gymNpcs)
		expect(npcs).toHaveLength(12)
	})

	it("each NPC has required fields", async () => {
		const db = await getTestDb()
		const npcs = await db.select().from(gymNpcs)

		for (const npc of npcs) {
			expect(npc.key).toBeTruthy()
			expect(npc.name).toBeTruthy()
			expect(GYM_NPC_ROLES).toContain(npc.role)
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

	it("shows the gh-116 staff-growth-track NPCs as present during their real scheduled hours", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-sim-staff-growth",
			email: "simuserstaffgrowth@test.com",
			name: "Sim User Staff Growth",
		})
		const gym = await getOrCreateGym("user-sim-staff-growth", db)

		// Mirrors the real gh-116 seed data (server/db/seed.ts) rather than
		// synthetic schedules, so this exercises the actual proof-set NPCs'
		// real arrival/departure/daysOfWeek — both are Mon-Fri only, so a
		// live canvas check on a real-world weekend would show neither as
		// present even though they're correctly unlocked; verify presence
		// deterministically instead, same pattern as the test above.
		const trainerJordan: GymNpc = {
			key: "trainer_jordan",
			name: "Jordan",
			role: "trainer",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["weights_dumbbells"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 65,
			},
			defaultSchedule: {
				arrivalHour: 10,
				departureHour: 18,
				daysOfWeek: [1, 2, 3, 4, 5],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_trainer_jordan",
			unlockedByUpgradeKey: "staff_assistant_trainer",
		}
		const managerAlex: GymNpc = {
			key: "manager_alex",
			name: "Alex",
			role: "manager",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["staff_reception"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 8,
				departureHour: 17,
				daysOfWeek: [1, 2, 3, 4, 5],
				activitySequence: [
					{ type: "main", durationMin: 480, equipmentCategory: "staff" },
				],
			},
			spriteKey: "npc_manager_alex",
			unlockedByUpgradeKey: "staff_manager_office",
		}

		// 2026-06-17 is a Wednesday, within both NPCs' Mon-Fri schedule.
		const wednesdayNoon = new Date("2026-06-17T12:00:00")
		const states = await computeGymSimState(
			gym.id,
			[trainerJordan, managerAlex],
			[
				"weights_dumbbells",
				"staff_reception",
				"staff_assistant_trainer",
				"staff_manager_office",
			],
			[],
			db,
			wednesdayNoon,
		)

		expect(states).toHaveLength(2)
		const jordanState = states.find((s) => s.npcKey === "trainer_jordan")
		const alexState = states.find((s) => s.npcKey === "manager_alex")
		expect(jordanState?.isPresent).toBe(true)
		expect(alexState?.isPresent).toBe(true)
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

describe("computeGymSimState — equipment routing constraint", () => {
	it("hard-constrains equipment choice to allowedEquipmentKeys, ignoring preference", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-allowed-keys",
			email: "allowedkeys@test.com",
			name: "Allowed Keys User",
		})
		const gym = await getOrCreateGym("user-allowed-keys", db)

		const npc: GymNpc = {
			key: "npc_constrained",
			name: "Constrained NPC",
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
				allowedEquipmentKeys: ["weights_dumbbells"],
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_constrained",
			unlockedByUpgradeKey: null,
		}

		// 30min after the 6am arrival, inside the 60min "main" activity step —
		// noon would be past the single step's window and always resolve to no
		// equipment regardless of the routing constraint, which isn't what
		// this test is verifying.
		const activeTime = new Date("2026-06-17T06:30:00")
		const states = await computeGymSimState(
			gym.id,
			[npc],
			["weights_barbell", "weights_dumbbells", "weights_cable"],
			[],
			db,
			activeTime,
		)

		expect(states).toHaveLength(1)
		expect(states[0].isPresent).toBe(true)
		expect(states[0].targetEquipmentKey).toBe("weights_dumbbells")
	})

	it("goes idle rather than falling back outside allowedEquipmentKeys", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-allowed-keys-idle",
			email: "allowedkeysidle@test.com",
			name: "Allowed Keys Idle User",
		})
		const gym = await getOrCreateGym("user-allowed-keys-idle", db)

		const npc: GymNpc = {
			key: "npc_constrained_idle",
			name: "Constrained Idle NPC",
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
				// weights_smith is unlocked below but not in the allow-list, and
				// the allow-list's own item isn't unlocked — the picker must not
				// fall back to weights_barbell even though it's free and unlocked.
				allowedEquipmentKeys: ["weights_smith"],
			},
			defaultSchedule: {
				arrivalHour: 6,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "weights" },
				],
			},
			spriteKey: "npc_constrained_idle",
			unlockedByUpgradeKey: null,
		}

		const activeTime = new Date("2026-06-17T06:30:00")
		const states = await computeGymSimState(
			gym.id,
			[npc],
			["weights_barbell", "weights_dumbbells"],
			[],
			db,
			activeTime,
		)

		expect(states).toHaveLength(1)
		expect(states[0].isPresent).toBe(true)
		expect(states[0].targetEquipmentKey).toBeNull()
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
