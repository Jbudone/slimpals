import manifest from "shared/gym-sprite-manifest.json"
import {
	flattenNpcManifest,
	type NpcManifest,
} from "shared/npc-sprite-manifest.js"

type SpriteManifestEntry = (typeof manifest.sprites)[number]

export type EquipmentAnimConfig = {
	key: string
	animKey: string
	frameCount: number
	fps: number
}

function deriveAnimConfigs(
	entries: { key: string; frameCount: number; fps: number }[],
): EquipmentAnimConfig[] {
	return entries
		.filter((entry) => entry.frameCount > 1)
		.map((entry) => ({
			key: entry.key,
			animKey: `${entry.key}_anim`,
			frameCount: entry.frameCount,
			fps: entry.fps,
		}))
}

export function deriveEquipmentAnimConfigs(
	entries: SpriteManifestEntry[] = manifest.sprites,
): EquipmentAnimConfig[] {
	return deriveAnimConfigs(entries)
}

/** Same derivation as equipment, but for npc walk/pose spritesheets. */
export function deriveNpcAnimConfigs(
	npcs: NpcManifest = manifest.npcs as NpcManifest,
): EquipmentAnimConfig[] {
	return deriveAnimConfigs(flattenNpcManifest(npcs))
}
