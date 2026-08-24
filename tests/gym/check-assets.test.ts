import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
	checkAssets,
	convertAnimatedSource,
	findAnimatedSource,
	loadManifest,
	normalizeAsset,
	type SpriteManifestEntry,
	validateDimensions,
} from "../../scripts/check-assets.js"

const ENTRY_STATIC: SpriteManifestEntry = {
	key: "test_static",
	filename: "test_static.png",
	category: "decor",
	frameWidth: 96,
	frameHeight: 96,
	frameCount: 1,
	fps: 0,
	description: "a test sprite",
}

const ENTRY_ANIM: SpriteManifestEntry = {
	...ENTRY_STATIC,
	key: "test_anim",
	filename: "test_anim.png",
	category: "equipment",
	frameCount: 4,
	fps: 8,
}

let tmpDir: string
let manifestPath: string

beforeAll(async () => {
	tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gym-assets-test-"))
	manifestPath = path.join(tmpDir, "gym-sprite-manifest.json")
	await fs.promises.writeFile(
		manifestPath,
		JSON.stringify({
			version: "2",
			styleReferenceKey: null,
			sprites: [ENTRY_STATIC, ENTRY_ANIM],
		}),
	)
})

afterAll(async () => {
	await fs.promises.rm(tmpDir, { recursive: true, force: true })
})

async function writePng(filepath: string, width: number, height: number) {
	await sharp({
		create: {
			width,
			height,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.png()
		.toFile(filepath)
}

/** Writes a real animated GIF with one solid-color frame per entry in `colors`. */
async function writeAnimatedGif(
	filepath: string,
	colors: { r: number; g: number; b: number }[],
	frameSize = 32,
) {
	const rawFrames = await Promise.all(
		colors.map((bg) =>
			sharp({
				create: {
					width: frameSize,
					height: frameSize,
					channels: 4,
					background: { ...bg, alpha: 1 },
				},
			})
				.raw()
				.toBuffer(),
		),
	)
	const stacked = Buffer.concat(rawFrames)
	const gifBuf = await sharp(stacked, {
		raw: {
			width: frameSize,
			height: frameSize * colors.length,
			channels: 4,
			pageHeight: frameSize,
		},
	})
		.gif({ loop: 0, delay: colors.map(() => 100) })
		.toBuffer()
	await fs.promises.writeFile(filepath, gifBuf)
}

async function dominantColorOfFrame(
	pngSheetPath: string,
	frameIndex: number,
	frameWidth: number,
	frameHeight: number,
) {
	// sharp's .stats() doesn't apply a preceding .extract() until the crop is
	// materialized via .toBuffer() first — call stats on that, not the chain.
	const cropped = await sharp(pngSheetPath)
		.extract({
			left: frameIndex * frameWidth,
			top: 0,
			width: frameWidth,
			height: frameHeight,
		})
		.png()
		.toBuffer()
	const stats = await sharp(cropped).stats()
	return stats.dominant
}

// ── Behavior 1 ────────────────────────────────────────────────────────────────

describe("loadManifest", () => {
	it("returns sprite entries with all required fields", async () => {
		const entries = await loadManifest(manifestPath)
		expect(entries).toHaveLength(2)
		expect(entries[0]).toMatchObject({
			key: "test_static",
			filename: "test_static.png",
			category: "decor",
			frameWidth: 96,
			frameHeight: 96,
			frameCount: 1,
		})
	})
})

// ── Behaviors 2–5 ─────────────────────────────────────────────────────────────

describe("validateDimensions", () => {
	it("passes for a correct 96×96 static sprite", async () => {
		const filepath = path.join(tmpDir, "correct_static.png")
		await writePng(filepath, 96, 96)
		const result = await validateDimensions(filepath, ENTRY_STATIC)
		expect(result).toEqual({ pass: true })
	})

	it("passes for a correct 384×96 animated spritesheet (frameCount=4)", async () => {
		const filepath = path.join(tmpDir, "correct_anim.png")
		await writePng(filepath, 384, 96)
		const result = await validateDimensions(filepath, ENTRY_ANIM)
		expect(result).toEqual({ pass: true })
	})

	it("fails when the file does not exist", async () => {
		const result = await validateDimensions(
			path.join(tmpDir, "missing.png"),
			ENTRY_STATIC,
		)
		expect(result.pass).toBe(false)
		expect(result.reason).toMatch(/not found/)
	})

	it("fails when the PNG has wrong dimensions", async () => {
		const filepath = path.join(tmpDir, "wrong_size.png")
		await writePng(filepath, 100, 100)
		const result = await validateDimensions(filepath, ENTRY_STATIC)
		expect(result.pass).toBe(false)
		expect(result.reason).toMatch(/expected 96×96/)
	})
})

// ── Behaviors 7–9 ─────────────────────────────────────────────────────────────

describe("normalizeAsset", () => {
	it("resizes a wrong-sized-but-present file to the exact expected dimensions", async () => {
		const filepath = path.join(tmpDir, "wrong_size_fixable.png")
		await writePng(filepath, 48, 48)

		const result = await normalizeAsset(filepath, ENTRY_STATIC)

		expect(result).toEqual({ resized: true, from: { width: 48, height: 48 } })
		const meta = await sharp(filepath).metadata()
		expect(meta.width).toBe(96)
		expect(meta.height).toBe(96)
	})

	it("leaves an already-correct-sized file untouched", async () => {
		const filepath = path.join(tmpDir, "already_correct.png")
		await writePng(filepath, 96, 96)
		const before = await fs.promises.readFile(filepath)

		const result = await normalizeAsset(filepath, ENTRY_STATIC)

		expect(result).toEqual({ resized: false })
		const after = await fs.promises.readFile(filepath)
		expect(after.equals(before)).toBe(true)
	})

	it("does nothing when the file does not exist", async () => {
		const filepath = path.join(tmpDir, "does_not_exist.png")

		const result = await normalizeAsset(filepath, ENTRY_STATIC)

		expect(result).toEqual({ resized: false })
		expect(fs.existsSync(filepath)).toBe(false)
	})
})

// ── Behavior 6 ────────────────────────────────────────────────────────────────

// ── Behavior 10 ───────────────────────────────────────────────────────────────

describe("findAnimatedSource / convertAnimatedSource", () => {
	it("finds a sibling .gif next to the expected .png and converts it to a spritesheet", async () => {
		const targetPath = path.join(tmpDir, "gif_sibling_walk.png")
		const gifPath = path.join(tmpDir, "gif_sibling_walk.gif")
		await writeAnimatedGif(gifPath, [
			{ r: 255, g: 0, b: 0 },
			{ r: 0, g: 255, b: 0 },
			{ r: 0, g: 0, b: 255 },
			{ r: 255, g: 255, b: 0 },
		])

		const source = await findAnimatedSource(targetPath)
		expect(source).toBe(gifPath)

		const { sourceFrames, sampledIndices } = await convertAnimatedSource(
			gifPath,
			targetPath,
			ENTRY_ANIM,
		)
		expect(sourceFrames).toBe(4)
		expect(sampledIndices).toEqual([0, 1, 2, 3])

		const meta = await sharp(targetPath).metadata()
		expect(meta.width).toBe(384)
		expect(meta.height).toBe(96)

		const frame0 = await dominantColorOfFrame(targetPath, 0, 96, 96)
		expect(frame0).toMatchObject({ r: expect.any(Number) })
		expect(frame0.r).toBeGreaterThan(200)
		expect(frame0.g).toBeLessThan(50)
		const frame2 = await dominantColorOfFrame(targetPath, 2, 96, 96)
		expect(frame2.b).toBeGreaterThan(200)
	})

	it("detects an animated file saved directly under the expected .png filename", async () => {
		const targetPath = path.join(tmpDir, "saved_as_png_walk.png")
		await writeAnimatedGif(targetPath, [
			{ r: 255, g: 0, b: 0 },
			{ r: 0, g: 255, b: 0 },
		])

		const source = await findAnimatedSource(targetPath)
		expect(source).toBe(targetPath)
	})

	it("returns null when there is no animated source", async () => {
		const targetPath = path.join(tmpDir, "no_animated_source.png")
		await writePng(targetPath, 96, 96)

		const source = await findAnimatedSource(targetPath)
		expect(source).toBeNull()
	})

	it("resamples when the source has a different frame count than the manifest expects", async () => {
		const targetPath = path.join(tmpDir, "resample_walk.png")
		const gifPath = path.join(tmpDir, "resample_walk.gif")
		// 8 source frames, manifest wants 4 — should evenly sample down.
		await writeAnimatedGif(
			gifPath,
			Array.from({ length: 8 }, (_, i) => ({ r: i * 30, g: 0, b: 0 })),
		)

		const { sourceFrames, sampledIndices } = await convertAnimatedSource(
			gifPath,
			targetPath,
			ENTRY_ANIM,
		)
		expect(sourceFrames).toBe(8)
		expect(sampledIndices).toHaveLength(4)
		expect(sampledIndices[0]).toBe(0)
		expect(sampledIndices[3]).toBe(7)

		const meta = await sharp(targetPath).metadata()
		expect(meta.width).toBe(384)
		expect(meta.height).toBe(96)
	})
})

describe("checkAssets", () => {
	it("reports one result per manifest entry, grouped by category", async () => {
		const dir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "gym-assets-check-"),
		)
		try {
			await writePng(path.join(dir, ENTRY_STATIC.filename), 96, 96)
			// ENTRY_ANIM's file is intentionally left missing.

			const results = await checkAssets([ENTRY_STATIC, ENTRY_ANIM], dir)

			expect(results).toHaveLength(2)
			expect(results.find((r) => r.key === "test_static")).toMatchObject({
				category: "decor",
				pass: true,
			})
			expect(results.find((r) => r.key === "test_anim")).toMatchObject({
				category: "equipment",
				pass: false,
			})
		} finally {
			await fs.promises.rm(dir, { recursive: true, force: true })
		}
	})
})
