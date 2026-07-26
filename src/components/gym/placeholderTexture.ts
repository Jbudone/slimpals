import type Phaser from "phaser"

const CELL = 8
const BG_A = "#ff00ff"
const BG_B = "#1a1a1a"

export function createPlaceholderTexture(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
): void {
	const canvasTexture = scene.textures.createCanvas(key, width, height)
	if (!canvasTexture) return
	const ctx = canvasTexture.context

	for (let y = 0; y < height; y += CELL) {
		for (let x = 0; x < width; x += CELL) {
			const even = (x / CELL + y / CELL) % 2 === 0
			ctx.fillStyle = even ? BG_A : BG_B
			ctx.fillRect(x, y, CELL, CELL)
		}
	}

	ctx.fillStyle = "#ffffff"
	ctx.font = "bold 8px monospace"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	const label = key.length > 14 ? `${key.slice(0, 12)}…` : key
	ctx.fillText(label, width / 2, height / 2, width - 4)

	canvasTexture.refresh()
}
