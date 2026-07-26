import type Phaser from "phaser"
import { createPlaceholderTexture } from "./placeholderTexture.js"

type ManifestEntry = {
	key: string
	filename: string
	frameWidth: number
	frameHeight: number
}

const BASE = "/assets/gym"

export function queueManifestLoads(
	scene: Phaser.Scene,
	entries: ManifestEntry[],
	onLoadError: (key: string) => void,
): void {
	scene.load.on("loaderror", (file: Phaser.Loader.File) =>
		onLoadError(file.key),
	)
	for (const entry of entries) {
		scene.load.spritesheet(entry.key, `${BASE}/${entry.filename}`, {
			frameWidth: entry.frameWidth,
			frameHeight: entry.frameHeight,
		})
	}
}

export function applyPlaceholders(
	scene: Phaser.Scene,
	missingKeys: string[],
	entries: ManifestEntry[],
): void {
	const byKey = new Map(entries.map((entry) => [entry.key, entry]))
	for (const key of missingKeys) {
		const entry = byKey.get(key)
		if (!entry) continue
		createPlaceholderTexture(scene, key, entry.frameWidth, entry.frameHeight)
	}
}
