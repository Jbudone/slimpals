import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { userGyms, users } from "../../server/db/schema.js"
import {
	computeGymSimState,
	type GymNpc,
	getCrowdMax,
	getMoodVariant,
	getMoveSpeedMultiplier,
	getProgressionStage,
	type NpcRelationship,
} from "../../server/services/gym/simulation.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

beforeAll(async () => {
	await resetSchema()
})

afterAll(async () => {
	await closeTestDb()
})

beforeEach(async () => {
	await truncateAll()
})

// ── Crowd density ────────────────────────────────────────────────────────────

describe("getCrowdMax", () => {
	it("returns 0 at 3am (closed)", () => {
		expect(getCrowdMax(3)).toBe(0)
	})

	it("returns 1 at 5am (early bird window)", () => {
		expect(getCrowdMax(5)).toBe(1)
	})

	it("returns 5 at 7am (morning rush)", () => {
		expect(getCrowdMax(7)).toBe(5)
	})

	it("returns 3 at 9am (quiet period)", () => {
		expect(getCrowdMax(9)).toBe(3)
	})

	it("returns 4 at 11am (lunch crowd)", () => {
		expect(getCrowdMax(11)).toBe(4)
	})

	it("returns 2 at 1pm (afternoon lull)", () => {
		expect(getCrowdMax(13)).toBe(2)
	})

	it("returns 6 at 4pm (evening rush peak)", () => {
		expect(getCrowdMax(16)).toBe(6)
	})

	it("returns 3 at 7pm (wind-down)", () => {
		expect(getCrowdMax(19)).toBe(3)
	})

	it("returns 0 at 9pm (closed)", () => {
		expect(getCrowdMax(21)).toBe(0)
	})

	it("CROWD_WINDOWS covers full 24h range", () => {
		for (let h = 0; h < 24; h++) {
			expect(typeof getCrowdMax(h)).toBe("number")
		}
	})
})

describe("getCrowdMax progression scaling (gh-63)", () => {
	it("defaults to the Established (day 90+) baseline when no progression is given", () => {
		expect(getCrowdMax(16)).toBe(6)
		expect(getCrowdMax(16, 90)).toBe(6)
		expect(getCrowdMax(16, 365)).toBe(6)
	})

	it("shows visibly fewer people at the same hour for an earlier checkpoint", () => {
		const grandOpening = getCrowdMax(16, 0)
		const firstWeek = getCrowdMax(16, 7)
		const oneMonthIn = getCrowdMax(16, 30)
		const established = getCrowdMax(16, 90)
		expect(grandOpening).toBeLessThan(firstWeek)
		expect(firstWeek).toBeLessThan(oneMonthIn)
		expect(oneMonthIn).toBeLessThan(established)
	})

	it("never closes an hour that's genuinely open, even at day 0", () => {
		for (let h = 0; h < 24; h++) {
			const base = getCrowdMax(h, 90)
			const grandOpening = getCrowdMax(h, 0)
			if (base > 0) {
				expect(grandOpening).toBeGreaterThanOrEqual(1)
			} else {
				expect(grandOpening).toBe(0)
			}
		}
	})

	it("stays quiet (0) at 3am regardless of progression", () => {
		expect(getCrowdMax(3, 0)).toBe(0)
		expect(getCrowdMax(3, 7)).toBe(0)
		expect(getCrowdMax(3, 30)).toBe(0)
		expect(getCrowdMax(3, 90)).toBe(0)
		expect(getCrowdMax(3, 500)).toBe(0)
	})

	it("treats negative or fractional daysActive as day 0", () => {
		expect(getCrowdMax(16, -5)).toBe(getCrowdMax(16, 0))
	})
})

// ── Mood variants ────────────────────────────────────────────────────────────

describe("getMoodVariant", () => {
	it("returns energized when mood > 70", () => {
		expect(getMoodVariant(80)).toBe("energized")
		expect(getMoodVariant(71)).toBe("energized")
	})

	it("returns tired when mood < 20", () => {
		expect(getMoodVariant(10)).toBe("tired")
		expect(getMoodVariant(0)).toBe("tired")
		expect(getMoodVariant(-50)).toBe("tired")
	})

	it("returns normal in the middle range", () => {
		expect(getMoodVariant(50)).toBe("normal")
		expect(getMoodVariant(20)).toBe("normal")
		expect(getMoodVariant(70)).toBe("normal")
	})
})

describe("getMoveSpeedMultiplier", () => {
	it("returns 1.2x when energized", () => {
		expect(getMoveSpeedMultiplier(80)).toBe(1.2)
	})

	it("returns 0.85x when tired (mood < 20)", () => {
		expect(getMoveSpeedMultiplier(10)).toBe(0.85)
	})

	it("returns 0.9x when slightly low mood (20–39)", () => {
		expect(getMoveSpeedMultiplier(30)).toBe(0.9)
	})

	it("returns 1.0x in normal range", () => {
		expect(getMoveSpeedMultiplier(50)).toBe(1.0)
	})
})

// ── Progression milestones ────────────────────────────────────────────────────

describe("getProgressionStage", () => {
	it("Derek unlocks heavy_weights after 30 days", () => {
		expect(getProgressionStage("regular_derek", 30)).toBe("heavy_weights")
		expect(getProgressionStage("regular_derek", 29)).toBeNull()
	})

	it("Elena unlocks stair_climber after 20 days", () => {
		expect(getProgressionStage("regular_elena", 20)).toBe("stair_climber")
		expect(getProgressionStage("regular_elena", 19)).toBeNull()
	})

	it("Tom unlocks group_trainer after 15 days", () => {
		expect(getProgressionStage("regular_tom", 15)).toBe("group_trainer")
		expect(getProgressionStage("regular_tom", 14)).toBeNull()
	})

	it("Marcus unlocks form_corrector from day 1", () => {
		expect(getProgressionStage("trainer_marcus", 1)).toBe("form_corrector")
		expect(getProgressionStage("trainer_marcus", 0)).toBeNull()
	})

	it("returns null for unknown NPC", () => {
		expect(getProgressionStage("random_npc", 100)).toBeNull()
	})
})

// ── Crowd cap via computeGymSimState ─────────────────────────────────────────

describe("computeGymSimState crowd cap", () => {
	const makeNpc = (
		key: string,
		role: "trainer" | "regular" | "specialist" | "receptionist",
		arrivalHour = 7,
	): GymNpc => ({
		key,
		name: key,
		role,
		personalityProfile: {
			traits: [],
			goals: [],
			quirks: [],
			equipmentPreferences: ["cardio_treadmill"],
			avoidEquipment: [],
			friendlyWith: [],
			rivalWith: [],
			moodBaseline: 50,
		},
		defaultSchedule: {
			arrivalHour,
			departureHour: 20,
			daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
			activitySequence: [
				{ type: "warmup", durationMin: 30, equipmentCategory: "cardio" },
			],
		},
		spriteKey: key,
		unlockedByUpgradeKey: null,
	})

	it("respects crowd cap — max 1 at 5am", async () => {
		const { eq } = await import("drizzle-orm")
		const db = await getTestDb()

		// Seed minimal gym
		await db.insert(users).values({ id: "u1", email: "u1@t.test", name: "U1" })
		await db.insert(userGyms).values({ userId: "u1", name: "Test Gym" })
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, "u1"))

		const npcs = [
			makeNpc("regular_a", "regular", 5),
			makeNpc("regular_b", "regular", 5),
			makeNpc("trainer_x", "trainer", 5),
		]
		const unlockedUpgrades = ["cardio_treadmill"]
		const relationships: NpcRelationship[] = []

		const at5am = new Date(2025, 0, 6, 5, 30)
		const states = await computeGymSimState(
			gym.id,
			npcs,
			unlockedUpgrades,
			relationships,
			db,
			at5am,
		)

		const present = states.filter((s) => s.isPresent)
		expect(present.length).toBeLessThanOrEqual(1)
	})

	it("prefers trainer over regular when enforcing crowd cap", async () => {
		const { eq } = await import("drizzle-orm")
		const db = await getTestDb()

		await db.insert(users).values({ id: "u2", email: "u2@t.test", name: "U2" })
		await db.insert(userGyms).values({ userId: "u2", name: "Test Gym 2" })
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, "u2"))

		const npcs = [
			makeNpc("regular_z", "regular", 5),
			makeNpc("trainer_t", "trainer", 5),
		]
		const at5am = new Date(2025, 0, 6, 5, 30)
		const states = await computeGymSimState(
			gym.id,
			npcs,
			["cardio_treadmill"],
			[],
			db,
			at5am,
		)

		const present = states.filter((s) => s.isPresent)
		expect(present.length).toBeLessThanOrEqual(1)
		if (present.length === 1) {
			expect(present[0].npcKey).toBe("trainer_t")
		}
	})

	it("shows visibly more people at the same hour for an established gym than a brand-new one (gh-63)", async () => {
		const { eq } = await import("drizzle-orm")
		const db = await getTestDb()

		await db.insert(users).values({ id: "u3", email: "u3@t.test", name: "U3" })
		await db.insert(userGyms).values({ userId: "u3", name: "Test Gym 3" })
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, "u3"))

		// 8 regulars all scheduled from 7am so the 4pm window (base cap 6) has
		// enough eligible NPCs to actually exercise the full progression range.
		const npcs = Array.from({ length: 8 }, (_, i) =>
			makeNpc(`regular_${i}`, "regular", 7),
		)
		const unlockedUpgrades = ["cardio_treadmill"]
		// Different calendar days so each call's gymNpcDailyState upsert is
		// independent — presence/crowd-cap logic doesn't depend on that cache,
		// but keeping the two scenarios on separate days avoids any coupling.
		const grandOpeningAt4pm = new Date(2025, 0, 6, 16, 0)
		const establishedAt4pm = new Date(2025, 0, 7, 16, 0)

		const grandOpeningStates = await computeGymSimState(
			gym.id,
			npcs,
			unlockedUpgrades,
			[{ npcKey: "regular_0", relationshipLevel: 10, gymDaysActive: 0 }],
			db,
			grandOpeningAt4pm,
		)
		const establishedStates = await computeGymSimState(
			gym.id,
			npcs,
			unlockedUpgrades,
			[{ npcKey: "regular_0", relationshipLevel: 10, gymDaysActive: 90 }],
			db,
			establishedAt4pm,
		)

		const grandOpeningPresent = grandOpeningStates.filter(
			(s) => s.isPresent,
		).length
		const establishedPresent = establishedStates.filter(
			(s) => s.isPresent,
		).length

		expect(grandOpeningPresent).toBe(2)
		expect(establishedPresent).toBe(6)
		expect(establishedPresent).toBeGreaterThan(grandOpeningPresent)
	})
})

// ── Chat events (friendly pairs within 3 tiles) ───────────────────────────────

describe("computeGymSimState chat events", () => {
	it("marks both NPCs as chatting when friendly pair is within 3 tiles", async () => {
		const { eq } = await import("drizzle-orm")
		const db = await getTestDb()

		await db.insert(users).values({ id: "u3", email: "u3@t.test", name: "U3" })
		await db.insert(userGyms).values({ userId: "u3", name: "Buddy Gym" })
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, "u3"))

		// Two NPCs that are friends, both prefer the same equipment category (so they'll end up near each other)
		const npcA: GymNpc = {
			key: "npc_alice",
			name: "Alice",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["cardio_treadmill"],
				avoidEquipment: [],
				friendlyWith: ["npc_bob"],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 7,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "warmup", durationMin: 60, equipmentCategory: "cardio" },
				],
			},
			spriteKey: "npc_alice",
			unlockedByUpgradeKey: null,
		}

		const npcB: GymNpc = {
			key: "npc_bob",
			name: "Bob",
			role: "regular",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["cardio_rowing"],
				avoidEquipment: [],
				friendlyWith: ["npc_alice"],
				rivalWith: [],
				moodBaseline: 60,
			},
			defaultSchedule: {
				arrivalHour: 7,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "warmup", durationMin: 60, equipmentCategory: "cardio" },
				],
			},
			spriteKey: "npc_bob",
			unlockedByUpgradeKey: null,
		}

		// Use 4pm (max crowd = 6) so both can fit
		const at4pm = new Date(2025, 0, 6, 16, 0)

		const states = await computeGymSimState(
			gym.id,
			[npcA, npcB],
			["cardio_treadmill", "cardio_rowing"],
			[],
			db,
			at4pm,
		)

		const alice = states.find((s) => s.npcKey === "npc_alice")
		const bob = states.find((s) => s.npcKey === "npc_bob")

		// Both should be present
		expect(alice?.isPresent).toBe(true)
		expect(bob?.isPresent).toBe(true)

		// treadmill is at {x:2,y:2}, rowing is at {x:4,y:2} → manhattan = 2 ≤ 3
		// So they should chat
		expect(alice?.chatEventWith).toBe("npc_bob")
		expect(bob?.chatEventWith).toBe("npc_alice")
		expect(alice?.currentActivity).toBe("chatting")
		expect(bob?.currentActivity).toBe("chatting")
	})
})

// ── Mood variant in sim state ─────────────────────────────────────────────────

describe("NpcSimState mood fields", () => {
	it("energized NPC has moodVariant=energized and multiplier=1.2", async () => {
		const { eq } = await import("drizzle-orm")
		const db = await getTestDb()

		await db.insert(users).values({ id: "u4", email: "u4@t.test", name: "U4" })
		await db.insert(userGyms).values({ userId: "u4", name: "Energy Gym" })
		const [gym] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, "u4"))

		// NPC with high moodBaseline who likes all their equipment
		const npc: GymNpc = {
			key: "npc_peppy",
			name: "Peppy",
			role: "trainer",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: ["staff_trainer"],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 90,
			},
			defaultSchedule: {
				arrivalHour: 7,
				departureHour: 20,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 60, equipmentCategory: "staff" },
				],
			},
			spriteKey: "npc_peppy",
			unlockedByUpgradeKey: null,
		}

		const at9am = new Date(2025, 0, 6, 9, 0)
		const states = await computeGymSimState(
			gym.id,
			[npc],
			["staff_trainer"],
			[],
			db,
			at9am,
		)

		const peppy = states.find((s) => s.npcKey === "npc_peppy")
		expect(peppy?.isPresent).toBe(true)
		expect(peppy?.moodVariant).toBe("energized")
		expect(peppy?.moveSpeedMultiplier).toBe(1.2)
	})
})
