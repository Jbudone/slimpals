import type Phaser from "phaser"
import {
	createPlaceholderTexture,
	type PlaceholderKind,
} from "./placeholderTexture.js"

type ManifestEntry = {
	key: string
	filename: string
	frameWidth: number
	frameHeight: number
	category?: string
	npcKey?: string
}

const EQUIPMENT_CATEGORIES = new Set(["equipment", "amenity", "decor", "staff"])

function classifyPlaceholder(entry: ManifestEntry): PlaceholderKind {
	if (entry.npcKey || entry.key.startsWith("npc_")) return "npc"
	if (entry.category && EQUIPMENT_CATEGORIES.has(entry.category))
		return "equipment"
	return "other"
}

const BASE = "/assets/gym"

export function queueManifestLoads(
	scene: Phaser.Scene,
	entries: ManifestEntry[],
): void {
	for (const entry of entries) {
		scene.load.spritesheet(entry.key, `${BASE}/${entry.filename}`, {
			frameWidth: entry.frameWidth,
			frameHeight: entry.frameHeight,
		})
	}
}

/**
 * Checked by texture existence after the loader completes, not the
 * loader's "loaderror" event — Vite's dev server returns 200 + index.html
 * (not a 404) for any unmatched asset path, so a missing sprite file never
 * fires a network-level load error. It just silently fails to produce a
 * texture, which existence-checking after load reliably catches either way.
 */
export function findMissingKeys(
	scene: Phaser.Scene,
	entries: ManifestEntry[],
): string[] {
	return entries
		.map((entry) => entry.key)
		.filter((key) => !scene.textures.exists(key))
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
		createPlaceholderTexture(
			scene,
			key,
			entry.frameWidth,
			entry.frameHeight,
			classifyPlaceholder(entry),
		)
	}
}
