import Phaser from "phaser"
import manifest from "shared/gym-sprite-manifest.json"
import { createPlaceholderTexture } from "../placeholderTexture.js"

const BASE = "/assets/gym"

// Portraits are DOM <img> assets used by NpcDialog.svelte, not Phaser textures.
const CANVAS_SPRITES = manifest.sprites.filter((s) => s.category !== "portrait")

export class PreloadScene extends Phaser.Scene {
	private missingKeys: string[] = []

	constructor() {
		super({ key: "PreloadScene" })
	}

	preload() {
		this.missingKeys = []
		this.load.on("loaderror", (file: Phaser.Loader.File) => {
			this.missingKeys.push(file.key)
		})

		for (const entry of CANVAS_SPRITES) {
			this.load.spritesheet(entry.key, `${BASE}/${entry.filename}`, {
				frameWidth: entry.frameWidth,
				frameHeight: entry.frameHeight,
			})
		}
	}

	create() {
		if (this.missingKeys.length > 0) {
			this.reportMissingSprites()
		}
		this.registry.set("missingSprites", this.missingKeys)
		this.scene.start("GymScene")
	}

	private reportMissingSprites() {
		const byKey = new Map(CANVAS_SPRITES.map((entry) => [entry.key, entry]))
		console.error(
			`[gym] ${this.missingKeys.length} sprite(s) missing — showing placeholders. Add these files and reload:`,
		)
		for (const key of this.missingKeys) {
			const entry = byKey.get(key)
			if (!entry) continue
			createPlaceholderTexture(this, key, entry.frameWidth, entry.frameHeight)
			console.error(
				`  ${key} → public/assets/gym/${entry.filename} (${entry.frameWidth * entry.frameCount}×${entry.frameHeight})`,
			)
		}
		console.error("Run `npm run check-assets` for the full requirements list.")
	}
}
