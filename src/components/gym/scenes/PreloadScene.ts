import Phaser from "phaser"
import manifest from "shared/gym-sprite-manifest.json"
import { applyPlaceholders, queueManifestLoads } from "../spriteLoader.js"

const CANVAS_SPRITES = manifest.sprites.filter((s) => s.category !== "portrait")

export class PreloadScene extends Phaser.Scene {
	private missingKeys: string[] = []

	constructor() {
		super({ key: "PreloadScene" })
	}

	preload() {
		this.missingKeys = []
		queueManifestLoads(this, CANVAS_SPRITES, (key) => {
			this.missingKeys.push(key)
		})
	}

	create() {
		if (this.missingKeys.length > 0) {
			this.reportMissingSprites()
		}
		this.registry.set("missingSprites", this.missingKeys)
		this.scene.start("GymScene")
	}

	private reportMissingSprites() {
		console.error(
			`[gym] ${this.missingKeys.length} sprite(s) missing — showing placeholders. Add these files and reload:`,
		)
		applyPlaceholders(this, this.missingKeys, CANVAS_SPRITES)
		const byKey = new Map(CANVAS_SPRITES.map((entry) => [entry.key, entry]))
		for (const key of this.missingKeys) {
			const entry = byKey.get(key)
			if (!entry) continue
			console.error(
				`  ${key} → public/assets/gym/${entry.filename} (${entry.frameWidth * entry.frameCount}×${entry.frameHeight})`,
			)
		}
		console.error("Run `npm run check-assets` for the full requirements list.")
	}
}
