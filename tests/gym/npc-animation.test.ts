import { describe, expect, it } from "vitest"
import {
	resolveAnimationAvailability,
	resolvePoseKey,
	resolveWalkKey,
} from "../../src/components/gym/npcAnimation.js"

describe("resolveWalkKey", () => {
	it("builds the walk-cycle key from the npc key", () => {
		expect(resolveWalkKey("trainer_marcus")).toBe("npc_trainer_marcus_walk")
	})
})

describe("resolvePoseKey", () => {
	it("builds the exercise-pose key from the npc key and equipment key", () => {
		expect(resolvePoseKey("trainer_marcus", "cardio_treadmill")).toBe(
			"npc_trainer_marcus_cardio_treadmill",
		)
	})
})

describe("resolveAnimationAvailability", () => {
	it("returns 'art' when the candidate key is in the available set", () => {
		const available = new Set(["npc_trainer_marcus_walk"])
		expect(
			resolveAnimationAvailability("npc_trainer_marcus_walk", available),
		).toBe("art")
	})

	it("returns 'fallback' when the candidate key is missing or unloaded", () => {
		const available = new Set<string>()
		expect(
			resolveAnimationAvailability("npc_trainer_marcus_walk", available),
		).toBe("fallback")
	})

	it("returns 'fallback' when only an unrelated key is available", () => {
		const available = new Set(["npc_regular_derek_walk"])
		expect(
			resolveAnimationAvailability("npc_trainer_marcus_walk", available),
		).toBe("fallback")
	})
})
