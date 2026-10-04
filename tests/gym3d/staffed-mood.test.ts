// A recovery room with a hire lifts everyone's mood (#130 flavour): the live
// bonus on top of the stored daily mood.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { gymHires, gymRooms, users } from "../../server/db/schema.js"
import { getOrCreateGym } from "../../server/services/gym/index.js"
import {
	computeGymSimState,
	type GymNpc,
} from "../../server/services/gym/simulation.js"
import { RECOVERY_MOOD, staffedMoodBonus } from "../../shared/gym3d/hires.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
})
afterAll(async () => {
	await closeTestDb()
})

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
		moodBaseline: 40,
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

describe("staffed room mood", () => {
	it("only a recovery room with a hire counts", () => {
		expect(staffedMoodBonus([])).toBe(0)
		expect(staffedMoodBonus(["weights", "juice"])).toBe(0)
		expect(staffedMoodBonus(["weights", "recovery"])).toBe(RECOVERY_MOOD)
	})

	it("raises the sim mood once the recovery room is staffed", async () => {
		const db = await getTestDb()
		await db.insert(users).values({
			id: "user-staffed",
			email: "staffed@test.com",
			name: "Staffed",
		})
		const gym = await getOrCreateGym("user-staffed", db)
		const noon = new Date("2026-06-17T12:00:00")
		const read = async () =>
			(
				await computeGymSimState(
					gym.id,
					[marcus],
					["weights_barbell"],
					[],
					db,
					noon,
				)
			)[0].mood
		const before = await read()
		const [room] = await db
			.insert(gymRooms)
			.values({ gymId: gym.id, type: "recovery" })
			.$returningId()
		// the room alone does nothing; a hire in it does
		expect(await read()).toBe(before)
		await db.insert(gymHires).values({
			gymId: gym.id,
			roomId: room.id,
			role: "therapist",
			name: "Sam",
		})
		expect(await read()).toBe(before + RECOVERY_MOOD)
	})
})
