import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { users } from "../../server/db/schema.js"
import { getOrCreateGym } from "../../server/services/gym/index.js"
import {
	computeGymSimState,
	type GymNpc,
	isHeroVisitingToday,
} from "../../server/services/gym/simulation.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("isHeroVisitingToday — pure visit-window logic (gh-68)", () => {
	const gymCreatedAt = new Date("2026-01-01T00:00:00")

	it("returns true for a regular NPC (both fields null)", () => {
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: null, heroVisitDurationDays: null },
				gymCreatedAt,
				new Date("2026-03-01T00:00:00"),
			),
		).toBe(true)
	})

	it("is present on day 0 of the cycle", () => {
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: 14, heroVisitDurationDays: 3 },
				gymCreatedAt,
				gymCreatedAt,
			),
		).toBe(true)
	})

	it("is present through the last day of the visit window", () => {
		const day2 = new Date("2026-01-03T00:00:00")
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: 14, heroVisitDurationDays: 3 },
				gymCreatedAt,
				day2,
			),
		).toBe(true)
	})

	it("is absent the day after the visit window ends", () => {
		const day3 = new Date("2026-01-04T00:00:00")
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: 14, heroVisitDurationDays: 3 },
				gymCreatedAt,
				day3,
			),
		).toBe(false)
	})

	it("is absent for most of the gap between visits", () => {
		const day13 = new Date("2026-01-14T00:00:00")
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: 14, heroVisitDurationDays: 3 },
				gymCreatedAt,
				day13,
			),
		).toBe(false)
	})

	it("is present again once the cycle wraps around", () => {
		const day14 = new Date("2026-01-15T00:00:00")
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: 14, heroVisitDurationDays: 3 },
				gymCreatedAt,
				day14,
			),
		).toBe(true)
	})

	it("is absent before the gym was created", () => {
		const before = new Date("2025-12-31T00:00:00")
		expect(
			isHeroVisitingToday(
				{ heroVisitCadenceDays: 14, heroVisitDurationDays: 3 },
				gymCreatedAt,
				before,
			),
		).toBe(false)
	})
})

describe("computeGymSimState — hero visit gating (gh-68)", () => {
	beforeAll(async () => {
		await resetSchema()
	})

	beforeEach(async () => {
		await truncateAll()
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-hero",
			email: "hero@test.com",
			name: "Hero User",
		})
	})

	afterAll(async () => {
		await closeTestDb()
	})

	function makeHeroNpc(overrides: Partial<GymNpc> = {}): GymNpc {
		return {
			key: "hero_test",
			name: "Hero Test",
			role: "hero",
			personalityProfile: {
				traits: [],
				goals: [],
				quirks: [],
				equipmentPreferences: [],
				avoidEquipment: [],
				friendlyWith: [],
				rivalWith: [],
				moodBaseline: 80,
			},
			defaultSchedule: {
				arrivalHour: 9,
				departureHour: 17,
				daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
				activitySequence: [
					{ type: "main", durationMin: 120, equipmentCategory: "weights" },
				],
			},
			spriteKey: "hero_test",
			unlockedByUpgradeKey: "hero_spotlight_stage",
			heroVisitCadenceDays: 14,
			heroVisitDurationDays: 3,
			...overrides,
		}
	}

	it("is absent outside its visit window even when unlocked", async () => {
		const db = await getTestDb()
		const gym = await getOrCreateGym("user-hero", db)
		const outsideWindow = new Date(gym.createdAt)
		outsideWindow.setDate(outsideWindow.getDate() + 5)
		outsideWindow.setHours(12, 0, 0, 0)

		const states = await computeGymSimState(
			gym.id,
			[makeHeroNpc()],
			["hero_spotlight_stage"],
			[],
			db,
			outsideWindow,
			undefined,
			gym.createdAt,
		)
		// Unlocked but outside the visit window: still shows up as an absent
		// roster entry (same as any NPC outside its daily hours), not present.
		expect(states).toHaveLength(1)
		expect(states[0].isPresent).toBe(false)
	})

	it("is present within its visit window when unlocked", async () => {
		const db = await getTestDb()
		const gym = await getOrCreateGym("user-hero", db)
		const withinWindow = new Date(gym.createdAt)
		withinWindow.setHours(12, 0, 0, 0)

		const states = await computeGymSimState(
			gym.id,
			[makeHeroNpc()],
			["hero_spotlight_stage"],
			[],
			db,
			withinWindow,
			undefined,
			gym.createdAt,
		)
		expect(states).toHaveLength(1)
		expect(states[0].isPresent).toBe(true)
		expect(states[0].isHeroVisit).toBe(true)
	})

	it("is absent when not unlocked, regardless of visit window", async () => {
		const db = await getTestDb()
		const gym = await getOrCreateGym("user-hero", db)
		const withinWindow = new Date(gym.createdAt)
		withinWindow.setHours(12, 0, 0, 0)

		const states = await computeGymSimState(
			gym.id,
			[makeHeroNpc()],
			[],
			[],
			db,
			withinWindow,
			undefined,
			gym.createdAt,
		)
		expect(states).toHaveLength(0)
	})
})
