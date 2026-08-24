import { describe, expect, it } from "vitest"
import {
	deriveNpcTextureKey,
	flattenNpcManifest,
	type NpcManifest,
} from "../../shared/npc-sprite-manifest.js"

describe("deriveNpcTextureKey", () => {
	it("joins npc, animation, and direction with a double underscore", () => {
		expect(deriveNpcTextureKey("trainer_marcus", "walk", "default")).toBe(
			"npc_trainer_marcus__walk__default",
		)
	})
})

describe("flattenNpcManifest", () => {
	const npcs: NpcManifest = {
		worker: {
			description: "construction worker",
			animations: {
				idle: {
					directions: {
						default: { type: "static", file: "sprites/worker.png" },
					},
				},
				cheer: {
					directions: {
						default: { type: "static", file: "sprites/worker-cheer.gif" },
					},
				},
			},
		},
		trainer_marcus: {
			description: "trainer",
			animations: {
				walk: {
					directions: {
						default: {
							type: "spritesheet",
							file: "sprites/npc_trainer_marcus_walk.png",
							frameWidth: 96,
							frameHeight: 96,
							frameCount: 4,
							fps: 8,
							offsetX: 10,
						},
					},
				},
				dance: {
					directions: {
						default: {
							type: "gif",
							file: "sprites/npc_trainer_marcus_dance.gif",
							frameWidth: 96,
							frameHeight: 96,
							frameCount: 6,
							fps: 12,
						},
					},
				},
			},
		},
	}

	it("produces one flat entry per (npc, animation, direction)", () => {
		const flat = flattenNpcManifest(npcs)
		expect(flat).toHaveLength(4)
	})

	it("derives static entries as a single frame with the file as-is", () => {
		const flat = flattenNpcManifest(npcs)
		const idle = flat.find((f) => f.key === "npc_worker__idle__default")
		expect(idle).toMatchObject({
			npcKey: "worker",
			animation: "idle",
			direction: "default",
			sourceType: "static",
			filename: "sprites/worker.png",
			frameWidth: 96,
			frameHeight: 96,
			frameCount: 1,
			fps: 0,
			offsetX: 0,
			offsetY: 0,
		})
	})

	it("preserves an explicit spritesheet offset and defaults the unset one to 0", () => {
		const flat = flattenNpcManifest(npcs)
		const walk = flat.find((f) => f.key === "npc_trainer_marcus__walk__default")
		expect(walk).toMatchObject({
			sourceType: "spritesheet",
			filename: "sprites/npc_trainer_marcus_walk.png",
			frameCount: 4,
			fps: 8,
			offsetX: 10,
			offsetY: 0,
		})
	})

	it("swaps a gif source's extension to .png for the loadable filename", () => {
		const flat = flattenNpcManifest(npcs)
		const dance = flat.find(
			(f) => f.key === "npc_trainer_marcus__dance__default",
		)
		expect(dance).toMatchObject({
			sourceType: "gif",
			filename: "sprites/npc_trainer_marcus_dance.png",
			frameCount: 6,
			fps: 12,
		})
	})

	it("returns an empty list for an empty manifest", () => {
		expect(flattenNpcManifest({})).toEqual([])
	})
})
