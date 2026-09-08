import Phaser from "phaser"
import manifest from "shared/gym-sprite-manifest.json"
import {
	flattenNpcManifest,
	type NpcManifest,
} from "shared/npc-sprite-manifest.js"
import {
	deriveEquipmentAnimConfigs,
	deriveNpcAnimConfigs,
} from "../equipmentAnimations.js"
import { computeGalleryLayout } from "../galleryLayout.js"
import {
	applyPlaceholders,
	findMissingKeys,
	queueManifestLoads,
} from "../spriteLoader.js"

const ALL_SPRITES = [
	...manifest.sprites,
	...flattenNpcManifest(manifest.npcs as NpcManifest),
]
const COLUMNS = 8
const CELL_SIZE = 112
const DISPLAY_SIZE = 88

export class GalleryScene extends Phaser.Scene {
	private missingKeys: string[] = []
	private layout: ReturnType<typeof computeGalleryLayout> = []
	private highlight: Phaser.GameObjects.Graphics | null = null

	constructor() {
		super({ key: "GalleryScene" })
	}

	preload() {
		queueManifestLoads(this, ALL_SPRITES)
	}

	create() {
		this.missingKeys = findMissingKeys(this, ALL_SPRITES)
		if (this.missingKeys.length > 0) {
			applyPlaceholders(this, this.missingKeys, ALL_SPRITES)
		}

		const animConfigs = [
			...deriveEquipmentAnimConfigs(),
			...deriveNpcAnimConfigs(),
		]
		for (const config of animConfigs) {
			if (this.anims.exists(config.animKey)) continue
			const texture = this.textures.get(config.key)
			if (!texture.has(String(config.frameCount - 1))) continue
			this.anims.create({
				key: config.animKey,
				frames: this.anims.generateFrameNumbers(config.key, {
					start: 0,
					end: config.frameCount - 1,
				}),
				frameRate: config.fps,
				repeat: -1,
			})
		}
		const animKeyByEntryKey = new Map(
			animConfigs
				.filter((config) => this.anims.exists(config.animKey))
				.map((config) => [config.key, config.animKey]),
		)

		const layout = computeGalleryLayout(ALL_SPRITES, COLUMNS)
		this.layout = layout
		for (const cell of layout) {
			const px = cell.col * CELL_SIZE + CELL_SIZE / 2
			const py = cell.row * CELL_SIZE + CELL_SIZE / 2

			const sprite = this.add
				.sprite(px, py, cell.key)
				.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE)

			const animKey = animKeyByEntryKey.get(cell.key)
			if (animKey) sprite.play(animKey)

			this.add
				.text(px, py + DISPLAY_SIZE / 2 + 2, cell.key, {
					fontSize: "8px",
					fontFamily: "monospace",
					color: "#e2e8f0",
					align: "center",
					wordWrap: { width: CELL_SIZE - 4 },
				})
				.setOrigin(0.5, 0)
		}

		this.cameras.main.setBounds(
			0,
			0,
			COLUMNS * CELL_SIZE,
			Math.ceil(ALL_SPRITES.length / COLUMNS) * CELL_SIZE,
		)
	}

	/** Pans/zooms to a specific sprite's cell and outlines it, for admin
	 * tooling that jumps straight to one (npc, animation) pose (gh-103). */
	focusOn(key: string): boolean {
		const cell = this.layout.find((c) => c.key === key)
		if (!cell) return false

		const px = cell.col * CELL_SIZE + CELL_SIZE / 2
		const py = cell.row * CELL_SIZE + CELL_SIZE / 2

		this.cameras.main.pan(px, py, 300, "Sine.easeInOut")
		this.cameras.main.zoomTo(2.5, 300)

		if (!this.highlight) {
			this.highlight = this.add.graphics().setDepth(9_000)
		}
		this.highlight.clear()
		this.highlight.lineStyle(3, 0xfbbf24, 1)
		this.highlight.strokeRect(
			cell.col * CELL_SIZE + 2,
			cell.row * CELL_SIZE + 2,
			CELL_SIZE - 4,
			CELL_SIZE - 4,
		)
		return true
	}

	resetView(): void {
		this.highlight?.clear()
		this.cameras.main.pan(
			(COLUMNS * CELL_SIZE) / 2,
			(Math.ceil(ALL_SPRITES.length / COLUMNS) * CELL_SIZE) / 2,
			300,
			"Sine.easeInOut",
		)
		this.cameras.main.zoomTo(1, 300)
	}
}
