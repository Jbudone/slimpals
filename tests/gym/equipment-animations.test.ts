import { describe, expect, it } from "vitest"
import { deriveEquipmentAnimConfigs } from "../../src/components/gym/equipmentAnimations.js"

type Entry = {
	key: string
	filename: string
	category: string
	frameWidth: number
	frameHeight: number
	frameCount: number
	fps: number
	description: string
}

function entry(overrides: Partial<Entry>): Entry {
	return {
		key: "test_key",
		filename: "test_key.png",
		category: "equipment",
		frameWidth: 96,
		frameHeight: 96,
		frameCount: 1,
		fps: 0,
		description: "",
		...overrides,
	}
}

describe("deriveEquipmentAnimConfigs", () => {
	it("returns one config per entry with frameCount > 1", () => {
		const entries = [
			entry({ key: "cardio_treadmill", frameCount: 4, fps: 8 }),
			entry({ key: "cardio_rowing", frameCount: 4, fps: 8 }),
		]
		const configs = deriveEquipmentAnimConfigs(entries)
		expect(configs).toHaveLength(2)
		expect(configs[0]).toEqual({
			key: "cardio_treadmill",
			animKey: "cardio_treadmill_anim",
			frameCount: 4,
			fps: 8,
		})
	})

	it("excludes entries with frameCount === 1", () => {
		const entries = [
			entry({ key: "weights_dumbbells", frameCount: 1, fps: 0 }),
			entry({
				key: "npc_trainer_marcus",
				category: "npc",
				frameCount: 1,
				fps: 0,
			}),
			entry({ key: "cardio_bikes", frameCount: 4, fps: 8 }),
		]
		const configs = deriveEquipmentAnimConfigs(entries)
		expect(configs).toHaveLength(1)
		expect(configs[0].key).toBe("cardio_bikes")
	})

	it("defaults to the real gym sprite manifest when called with no argument", () => {
		const configs = deriveEquipmentAnimConfigs()
		expect(configs.length).toBeGreaterThan(0)
		for (const config of configs) {
			expect(config.animKey).toBe(`${config.key}_anim`)
			expect(config.frameCount).toBeGreaterThan(1)
			expect(config.fps).toBeGreaterThan(0)
		}
	})
})
