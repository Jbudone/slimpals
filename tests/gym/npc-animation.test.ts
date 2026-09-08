import { describe, expect, it } from "vitest"
import type { NpcManifest } from "../../shared/npc-sprite-manifest.js"
import {
	listNpcAnimationOptions,
	resolveAnimationAvailability,
	resolveAnimationKey,
} from "../../src/components/gym/npcAnimation.js"

const NPCS: NpcManifest = {
	trainer_marcus: {
		description: "test",
		animations: {
			idle: {
				directions: {
					default: { type: "static", file: "sprites/npc_trainer_marcus.png" },
				},
			},
			walk: {
				directions: {
					default: {
						type: "spritesheet",
						file: "sprites/npc_trainer_marcus_walk.png",
						frameWidth: 96,
						frameHeight: 96,
						frameCount: 4,
						fps: 8,
					},
				},
			},
			cardio_treadmill: {
				directions: {
					default: {
						type: "static",
						file: "sprites/npc_trainer_marcus_cardio_treadmill.png",
					},
				},
			},
		},
	},
}

describe("resolveAnimationKey", () => {
	it("builds the derived texture key when the manifest declares the animation", () => {
		expect(resolveAnimationKey("trainer_marcus", "walk", NPCS)).toBe(
			"npc_trainer_marcus__walk__default",
		)
	})

	it("builds the key for a per-equipment exercise pose the same way", () => {
		expect(
			resolveAnimationKey("trainer_marcus", "cardio_treadmill", NPCS),
		).toBe("npc_trainer_marcus__cardio_treadmill__default")
	})

	it("returns null when the npc isn't in the manifest", () => {
		expect(resolveAnimationKey("nobody", "walk", NPCS)).toBeNull()
	})

	it("returns null when the animation isn't declared for that npc", () => {
		expect(resolveAnimationKey("trainer_marcus", "cheer", NPCS)).toBeNull()
	})
})

describe("resolveAnimationAvailability", () => {
	it("returns 'art' when the derived key is in the available set", () => {
		const available = new Set(["npc_trainer_marcus__walk__default"])
		expect(
			resolveAnimationAvailability("trainer_marcus", "walk", available, NPCS),
		).toBe("art")
	})

	it("returns 'fallback' when the animation exists but its art isn't loaded", () => {
		const available = new Set<string>()
		expect(
			resolveAnimationAvailability("trainer_marcus", "walk", available, NPCS),
		).toBe("fallback")
	})

	it("returns 'fallback' when the animation isn't declared at all", () => {
		const available = new Set(["npc_trainer_marcus__walk__default"])
		expect(
			resolveAnimationAvailability(
				"trainer_marcus",
				"cardio_bikes",
				available,
				NPCS,
			),
		).toBe("fallback")
	})

	it("returns 'fallback' when only an unrelated npc's key is available", () => {
		const available = new Set(["npc_regular_derek__walk__default"])
		expect(
			resolveAnimationAvailability("trainer_marcus", "walk", available, NPCS),
		).toBe("fallback")
	})
})

describe("listNpcAnimationOptions", () => {
	it("flattens every (npc, animation) pair with derived texture keys", () => {
		expect(listNpcAnimationOptions(NPCS)).toEqual([
			{
				npcKey: "trainer_marcus",
				animation: "cardio_treadmill",
				textureKey: "npc_trainer_marcus__cardio_treadmill__default",
			},
			{
				npcKey: "trainer_marcus",
				animation: "idle",
				textureKey: "npc_trainer_marcus__idle__default",
			},
			{
				npcKey: "trainer_marcus",
				animation: "walk",
				textureKey: "npc_trainer_marcus__walk__default",
			},
		])
	})

	it("sorts by npcKey then animation for a stable order", () => {
		const multi: NpcManifest = {
			regular_zed: NPCS.trainer_marcus,
			trainer_marcus: NPCS.trainer_marcus,
		}
		const options = listNpcAnimationOptions(multi)
		expect(options[0].npcKey).toBe("regular_zed")
		expect(options.at(-1)?.npcKey).toBe("trainer_marcus")
	})

	it("returns an empty array for an empty manifest", () => {
		expect(listNpcAnimationOptions({})).toEqual([])
	})
})
