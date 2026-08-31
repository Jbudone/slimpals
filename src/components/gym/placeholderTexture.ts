import type Phaser from "phaser"

export type PlaceholderKind = "npc" | "equipment" | "other"

function hashString(s: string): number {
	let h = 0
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) | 0
	}
	return Math.abs(h)
}

function hueFor(seed: string): number {
	return hashString(seed) % 360
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath()
	ctx.moveTo(x + r, y)
	ctx.arcTo(x + w, y, x + w, y + h, r)
	ctx.arcTo(x + w, y + h, x, y + h, r)
	ctx.arcTo(x, y + h, x, y, r)
	ctx.arcTo(x, y, x + w, y, r)
	ctx.closePath()
}

function shortLabel(key: string, max: number): string {
	return key.length > max ? `${key.slice(0, max - 1)}…` : key
}

/** Rough pixel-art person: circle head w/ smiley face, torso, arms, legs. */
function drawNpcFigure(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	seed: string,
): void {
	const hue = hueFor(seed)
	const shirt = `hsl(${hue}, 55%, 45%)`
	const skin = "#e8b892"
	const ink = "#2e2e38"
	const cx = width / 2
	const groundY = height - height * 0.06

	ctx.fillStyle = "rgba(0,0,0,0.18)"
	ctx.beginPath()
	ctx.ellipse(cx, groundY, width * 0.22, height * 0.045, 0, 0, Math.PI * 2)
	ctx.fill()

	ctx.fillStyle = ink
	ctx.fillRect(cx - width * 0.12, groundY - height * 0.28, width * 0.09, height * 0.24)
	ctx.fillRect(cx + width * 0.03, groundY - height * 0.28, width * 0.09, height * 0.24)

	const torsoTop = groundY - height * 0.58
	const torsoH = height * 0.32
	ctx.fillStyle = shirt
	ctx.fillRect(cx - width * 0.16, torsoTop, width * 0.32, torsoH)

	ctx.fillStyle = skin
	ctx.fillRect(cx - width * 0.24, torsoTop + height * 0.02, width * 0.08, torsoH * 0.8)
	ctx.fillRect(cx + width * 0.16, torsoTop + height * 0.02, width * 0.08, torsoH * 0.8)

	const headR = width * 0.16
	const headCy = torsoTop - headR * 0.9
	ctx.fillStyle = skin
	ctx.beginPath()
	ctx.arc(cx, headCy, headR, 0, Math.PI * 2)
	ctx.fill()

	ctx.fillStyle = ink
	const eyeOffset = headR * 0.35
	ctx.beginPath()
	ctx.arc(cx - eyeOffset, headCy - headR * 0.05, headR * 0.1, 0, Math.PI * 2)
	ctx.fill()
	ctx.beginPath()
	ctx.arc(cx + eyeOffset, headCy - headR * 0.05, headR * 0.1, 0, Math.PI * 2)
	ctx.fill()

	ctx.strokeStyle = ink
	ctx.lineWidth = Math.max(1, headR * 0.12)
	ctx.beginPath()
	ctx.arc(cx, headCy + headR * 0.1, headR * 0.45, 0.15 * Math.PI, 0.85 * Math.PI)
	ctx.stroke()
}

/** Rough outline + generic gym-equipment icon (dumbbell), tinted by key. */
function drawEquipmentIcon(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	seed: string,
	label: string,
): void {
	const hue = hueFor(seed)
	const stroke = `hsl(${hue}, 40%, 35%)`
	const fill = `hsl(${hue}, 45%, 90%)`
	const pad = Math.min(width, height) * 0.1

	ctx.fillStyle = fill
	ctx.strokeStyle = stroke
	ctx.lineWidth = 2
	roundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, 6)
	ctx.fill()
	ctx.stroke()

	const cy = height * 0.44
	const barLeft = width * 0.3
	const barRight = width * 0.7
	ctx.strokeStyle = stroke
	ctx.lineWidth = Math.max(2, width * 0.04)
	ctx.beginPath()
	ctx.moveTo(barLeft, cy)
	ctx.lineTo(barRight, cy)
	ctx.stroke()
	ctx.fillStyle = stroke
	for (const x of [barLeft, barRight]) {
		ctx.beginPath()
		ctx.arc(x, cy, height * 0.13, 0, Math.PI * 2)
		ctx.fill()
	}

	ctx.fillStyle = stroke
	ctx.font = `${Math.max(6, Math.floor(width * 0.09))}px monospace`
	ctx.textAlign = "center"
	ctx.textBaseline = "bottom"
	ctx.fillText(shortLabel(label, 16), width / 2, height - pad - 1, width - pad * 2)
}

/** Flat neutral fill for structure/UI placeholders — background elements
 * shouldn't scream "missing asset" the way a magenta checkerboard does. */
function drawFlatFill(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	label: string,
): void {
	ctx.fillStyle = "#d8cdbd"
	ctx.fillRect(0, 0, width, height)
	ctx.fillStyle = "#6b5f4f"
	ctx.font = "8px monospace"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillText(shortLabel(label, 14), width / 2, height / 2, width - 4)
}

export function createPlaceholderTexture(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
	kind: PlaceholderKind = "other",
): void {
	const canvasTexture = scene.textures.createCanvas(key, width, height)
	if (!canvasTexture) return
	const ctx = canvasTexture.context
	ctx.clearRect(0, 0, width, height)

	if (kind === "npc") {
		drawNpcFigure(ctx, width, height, key)
	} else if (kind === "equipment") {
		drawEquipmentIcon(ctx, width, height, key, key)
	} else {
		drawFlatFill(ctx, width, height, key)
	}

	canvasTexture.refresh()
}
