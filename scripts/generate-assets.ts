import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import sharp from "sharp"

// RECRAFT_API_KEY must be set in .env before running this script.
// Tests inject a fake fetchFn so no real key is needed for npm test.

const FRAME_SIZE = 48
const RECRAFT_API_URL = "https://external.api.recraft.ai/v1/images/generations"

const MANIFEST_PATH = path.resolve(
	import.meta.dirname,
	"../public/assets/sprite-manifest.json",
)
const OUT_DIR = path.resolve(import.meta.dirname, "../public/assets/gym")

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpriteStatus = "pending" | "approved" | "rejected"

export type RecraftParams = {
	style:
		| "digital_illustration"
		| "realistic_image"
		| "vector_illustration"
		| "icon"
	substyle?: string
	styleId?: string
	model: string
	size: string
}

export type SpriteManifestEntry = {
	key: string
	filename: string
	prompt: string
	recraftParams: RecraftParams
	frameCount: number
	fps: number
	status: SpriteStatus
	approvedHash: string | null
}

type SpriteManifest = {
	version: string
	styleReferenceKey: string | null
	sprites: SpriteManifestEntry[]
}

// ── Core functions (exported for testing) ─────────────────────────────────────

export async function loadManifest(
	manifestPath: string,
): Promise<SpriteManifestEntry[]> {
	const raw = await fs.promises.readFile(manifestPath, "utf8")
	const manifest: SpriteManifest = JSON.parse(raw)
	return manifest.sprites
}

export async function validateDimensions(
	filepath: string,
	entry: SpriteManifestEntry,
): Promise<{ pass: boolean; reason?: string }> {
	if (!fs.existsSync(filepath)) {
		return { pass: false, reason: `file not found: ${filepath}` }
	}
	const meta = await sharp(filepath).metadata()
	const expectedW = FRAME_SIZE * entry.frameCount
	const expectedH = FRAME_SIZE
	if (meta.width !== expectedW || meta.height !== expectedH) {
		return {
			pass: false,
			reason: `expected ${expectedW}×${expectedH}, got ${meta.width}×${meta.height}`,
		}
	}
	return { pass: true }
}

export async function generateSprite(
	entry: SpriteManifestEntry,
	outDir: string,
	fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
	const apiKey = process.env.RECRAFT_API_KEY
	if (!apiKey) throw new Error("RECRAFT_API_KEY not set in environment")

	const res = await fetchFn(RECRAFT_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			prompt: entry.prompt,
			style: entry.recraftParams.styleId
				? undefined
				: entry.recraftParams.style,
			style_id: entry.recraftParams.styleId,
			substyle: entry.recraftParams.substyle,
			model: entry.recraftParams.model,
			size: entry.recraftParams.size,
			n: 1,
		}),
	})

	if (!res.ok) {
		throw new Error(`Recraft API ${res.status}: ${await res.text()}`)
	}

	const json = (await res.json()) as {
		data: Array<{ b64_json?: string; url?: string }>
	}
	const item = json.data?.[0]
	if (!item) throw new Error("No data in Recraft response")

	let raw: Buffer
	if (item.b64_json) {
		raw = Buffer.from(item.b64_json, "base64")
	} else if (item.url) {
		const imgRes = await fetchFn(item.url)
		raw = Buffer.from(await imgRes.arrayBuffer())
	} else {
		throw new Error("No image data in Recraft response (no b64_json or url)")
	}

	// Resize to exact target dimensions using nearest-neighbor to preserve pixel art
	const targetW = FRAME_SIZE * entry.frameCount
	const resized = await sharp(raw)
		.resize(targetW, FRAME_SIZE, { kernel: "nearest" })
		.png()
		.toBuffer()

	fs.mkdirSync(outDir, { recursive: true })
	await fs.promises.writeFile(path.join(outDir, entry.filename), resized)
	console.log(`  SAVED  ${entry.filename}  (${targetW}×${FRAME_SIZE})`)
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			all: { type: "boolean", default: false },
			sprite: { type: "string" },
			"validate-only": { type: "boolean", default: false },
		},
	})

	const sprites = await loadManifest(MANIFEST_PATH)

	if (values["validate-only"]) {
		let allPass = true
		for (const entry of sprites) {
			const filepath = path.join(OUT_DIR, entry.filename)
			const result = await validateDimensions(filepath, entry)
			const mark = result.pass ? "PASS" : "FAIL"
			const detail = result.pass ? "" : `  — ${result.reason}`
			console.log(`  ${mark}  ${entry.key}${detail}`)
			if (!result.pass) allPass = false
		}
		process.exit(allPass ? 0 : 1)
	}

	const targets = values.sprite
		? sprites.filter((s) => s.key === values.sprite)
		: values.all
			? sprites
			: []

	if (targets.length === 0) {
		if (values.sprite) {
			console.error(`sprite key not found in manifest: ${values.sprite}`)
			process.exit(1)
		}
		console.log(
			"Usage: npm run generate-assets -- [--all] [--sprite=<key>] [--validate-only]",
		)
		process.exit(0)
	}

	for (const entry of targets) {
		try {
			await generateSprite(entry, OUT_DIR)
			const filepath = path.join(OUT_DIR, entry.filename)
			const check = await validateDimensions(filepath, entry)
			if (!check.pass) {
				console.error(
					`  WARN  ${entry.key}: dimension check failed — ${check.reason}`,
				)
			}
		} catch (err) {
			console.error(
				`  ERROR  ${entry.key}: ${err instanceof Error ? err.message : err}`,
			)
		}
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main()
}
