import manifest from "shared/gym-sprite-manifest.json"

type SpriteManifestEntry = (typeof manifest.sprites)[number]

export type EquipmentAnimConfig = {
	key: string
	animKey: string
	frameCount: number
	fps: number
}

export function deriveEquipmentAnimConfigs(
	entries: SpriteManifestEntry[] = manifest.sprites,
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
