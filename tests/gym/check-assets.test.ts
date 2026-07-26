import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
	checkAssets,
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
