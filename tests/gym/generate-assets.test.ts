import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
	generateSprite,
	loadManifest,
	type SpriteManifestEntry,
	validateDimensions,
} from "../../scripts/generate-assets.js"

const ENTRY_STATIC: SpriteManifestEntry = {
	key: "test_static",
	filename: "test_static.png",
	prompt: "a test sprite",
	recraftParams: {
		style: "digital_illustration",
		substyle: "pixel_art",
		model: "recraftv3",
		size: "1024x1024",
	},
	frameCount: 1,
	fps: 0,
	status: "pending",
	approvedHash: null,
}

const ENTRY_ANIM: SpriteManifestEntry = {
	...ENTRY_STATIC,
	key: "test_anim",
	filename: "test_anim.png",
	frameCount: 4,
	fps: 8,
}

let tmpDir: string
let manifestPath: string

beforeAll(async () => {
	tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gym-assets-test-"))
	manifestPath = path.join(tmpDir, "sprite-manifest.json")
	await fs.promises.writeFile(
		manifestPath,
		JSON.stringify({
			version: "1",
			styleReferenceKey: null,
			sprites: [ENTRY_STATIC, ENTRY_ANIM],
		}),
	)
})

afterAll(async () => {
	await fs.promises.rm(tmpDir, { recursive: true, force: true })
})

// ── Behavior 1 ────────────────────────────────────────────────────────────────

describe("loadManifest", () => {
	it("returns sprite entries with all required fields", async () => {
		const entries = await loadManifest(manifestPath)
		expect(entries).toHaveLength(2)
		expect(entries[0]).toMatchObject({
			key: "test_static",
			filename: "test_static.png",
			frameCount: 1,
			status: "pending",
			approvedHash: null,
		})
	})
})

// ── Behaviors 2–5 ─────────────────────────────────────────────────────────────

describe("validateDimensions", () => {
	it("passes for a correct 48×48 static sprite", async () => {
		const filepath = path.join(tmpDir, "correct_static.png")
		await sharp({
			create: {
				width: 48,
				height: 48,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.png()
			.toFile(filepath)
		const result = await validateDimensions(filepath, ENTRY_STATIC)
		expect(result).toEqual({ pass: true })
	})

	it("passes for a correct 192×48 animated spritesheet (frameCount=4)", async () => {
		const filepath = path.join(tmpDir, "correct_anim.png")
		await sharp({
			create: {
				width: 192,
				height: 48,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.png()
			.toFile(filepath)
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
		await sharp({
			create: {
				width: 100,
				height: 100,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.png()
			.toFile(filepath)
		const result = await validateDimensions(filepath, ENTRY_STATIC)
		expect(result.pass).toBe(false)
		expect(result.reason).toMatch(/expected 48×48/)
	})
})

// ── Behavior 6 ────────────────────────────────────────────────────────────────

describe("generateSprite", () => {
	it("writes Recraft response bytes to the correct output path", async () => {
		const fakePng = await sharp({
			create: {
				width: 48,
				height: 48,
				channels: 4,
				background: { r: 255, g: 0, b: 0, alpha: 255 },
			},
		})
			.png()
			.toBuffer()

		const fakeFetch = async (
			url: string,
			_opts?: RequestInit,
		): Promise<Response> => {
			if (url.includes("recraft")) {
				return new Response(
					JSON.stringify({ data: [{ b64_json: fakePng.toString("base64") }] }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				)
			}
			throw new Error(`unexpected fetch: ${url}`)
		}

		const prevKey = process.env.RECRAFT_API_KEY
		process.env.RECRAFT_API_KEY = "test-key"
		try {
			await generateSprite(
				ENTRY_STATIC,
				tmpDir,
				fakeFetch as typeof globalThis.fetch,
			)
		} finally {
			process.env.RECRAFT_API_KEY = prevKey
		}

		const outPath = path.join(tmpDir, ENTRY_STATIC.filename)
		expect(fs.existsSync(outPath)).toBe(true)
		const written = await fs.promises.readFile(outPath)
		expect(written.length).toBeGreaterThan(0)
	})
})
