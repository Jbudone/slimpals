import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import sharp from "sharp"
import {
	type FlatNpcSprite,
	flattenNpcManifest,
	type NpcManifest,
} from "../shared/npc-sprite-manifest.js"

const MANIFEST_PATH = path.resolve(
	import.meta.dirname,
	"../shared/gym-sprite-manifest.json",
)
const OUT_DIR = path.resolve(import.meta.dirname, "../public/assets/gym")

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpriteCategory =
	| "structure"
	| "ui"
	| "equipment"
	| "amenity"
	| "decor"
	| "staff"
	| "npc"
	| "portrait"

export type SpriteManifestEntry = {
	key: string
	filename: string
	category: SpriteCategory
	frameWidth: number
	frameHeight: number
	frameCount: number
	fps: number
	description: string
}

type SpriteManifest = {
	version: string
	styleReferenceKey: string | null
	sprites: SpriteManifestEntry[]
	npcs?: NpcManifest
}

export type AssetCheckResult = {
	key: string
	category: SpriteCategory
	expectedPath: string
	pass: boolean
	reason?: string
}

// ── Core functions (exported for testing) ─────────────────────────────────────

/** Adapts a flattened (npc, animation, direction) entry into the flat check-list shape. */
function npcSpriteToEntry(
	npcs: NpcManifest,
	flat: FlatNpcSprite,
): SpriteManifestEntry {
	const npcDescription = npcs[flat.npcKey]?.description ?? flat.npcKey
	return {
		key: flat.key,
		filename: flat.filename,
		category: "npc",
		frameWidth: flat.frameWidth,
		frameHeight: flat.frameHeight,
		frameCount: flat.frameCount,
		fps: flat.fps,
		description: `${npcDescription} — ${flat.animation} (${flat.direction})`,
	}
}

export async function loadManifest(
	manifestPath: string,
): Promise<SpriteManifestEntry[]> {
	const raw = await fs.promises.readFile(manifestPath, "utf8")
	const manifest: SpriteManifest = JSON.parse(raw)
	const npcs = manifest.npcs ?? {}
	const npcEntries = flattenNpcManifest(npcs).map((flat) =>
		npcSpriteToEntry(npcs, flat),
	)
	return [...manifest.sprites, ...npcEntries]
}

function expectedDimensions(entry: SpriteManifestEntry): {
	width: number
	height: number
} {
	return {
		width: entry.frameWidth * entry.frameCount,
		height: entry.frameHeight,
	}
}

export async function validateDimensions(
	filepath: string,
	entry: SpriteManifestEntry,
): Promise<{ pass: boolean; reason?: string }> {
	if (!fs.existsSync(filepath)) {
		return { pass: false, reason: `file not found: ${filepath}` }
	}
	const meta = await sharp(filepath).metadata()
	const { width: expectedW, height: expectedH } = expectedDimensions(entry)
	if (meta.width !== expectedW || meta.height !== expectedH) {
		return {
			pass: false,
			reason: `expected ${expectedW}×${expectedH}, got ${meta.width}×${meta.height}`,
		}
	}
	return { pass: true }
}

const ANIMATED_SOURCE_EXTENSIONS = [".gif", ".webp"]

async function isAnimatedImage(
	filepath: string,
): Promise<{ animated: boolean; pages: number }> {
	if (!fs.existsSync(filepath)) return { animated: false, pages: 0 }
	const meta = await sharp(filepath, { animated: true }).metadata()
	const pages = meta.pages ?? 1
	return { animated: pages > 1, pages }
}

/**
 * Looks for an animated source next to `targetPath` — either a sibling
 * file with the same base name (e.g. `foo_walk.gif` beside `foo_walk.png`),
 * or `targetPath` itself if it was saved as an animated GIF/WebP under the
 * expected `.png` filename.
 */
export async function findAnimatedSource(
	targetPath: string,
): Promise<string | null> {
	const dir = path.dirname(targetPath)
	const base = path.basename(targetPath, path.extname(targetPath))
	for (const ext of ANIMATED_SOURCE_EXTENSIONS) {
		const candidate = path.join(dir, `${base}${ext}`)
		if (fs.existsSync(candidate)) {
			const { animated } = await isAnimatedImage(candidate)
			if (animated) return candidate
		}
	}
	const { animated } = await isAnimatedImage(targetPath)
	return animated ? targetPath : null
}

/** Evenly samples `targetCount` frame indices across `[0, totalFrames - 1]`. */
function sampleFrameIndices(
	totalFrames: number,
	targetCount: number,
): number[] {
	if (targetCount <= 1) return [0]
	if (totalFrames <= 1) return Array(targetCount).fill(0)
	return Array.from({ length: targetCount }, (_, i) =>
		Math.round((i * (totalFrames - 1)) / (targetCount - 1)),
	)
}

/**
 * Converts an animated source (GIF/WebP/APNG) into the manifest's expected
 * horizontal-strip spritesheet PNG, resampling frames to `entry.frameCount`
 * if the source has a different number of frames.
 */
export async function convertAnimatedSource(
	sourcePath: string,
	targetPath: string,
	entry: SpriteManifestEntry,
): Promise<{ sourceFrames: number; sampledIndices: number[] }> {
	const meta = await sharp(sourcePath, { animated: true }).metadata()
	const totalFrames = meta.pages ?? 1
	const indices = sampleFrameIndices(totalFrames, entry.frameCount)

	const frameBuffers = await Promise.all(
		indices.map((idx) =>
			sharp(sourcePath, { page: idx })
				.resize(entry.frameWidth, entry.frameHeight, { kernel: "nearest" })
				.png()
				.toBuffer(),
		),
	)

	const sheet = await sharp({
		create: {
			width: entry.frameWidth * entry.frameCount,
			height: entry.frameHeight,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite(
			frameBuffers.map((input, i) => ({
				input,
				left: i * entry.frameWidth,
				top: 0,
			})),
		)
		.png()
		.toBuffer()

	await fs.promises.writeFile(targetPath, sheet)
	return { sourceFrames: totalFrames, sampledIndices: indices }
}

export async function normalizeAsset(
	filepath: string,
	entry: SpriteManifestEntry,
): Promise<{ resized: boolean; from?: { width: number; height: number } }> {
	if (!fs.existsSync(filepath)) {
		return { resized: false }
	}

	const { width: expectedW, height: expectedH } = expectedDimensions(entry)
	const meta = await sharp(filepath).metadata()
	if (meta.width === expectedW && meta.height === expectedH) {
		return { resized: false }
	}

	const from = { width: meta.width ?? 0, height: meta.height ?? 0 }
	const resized = await sharp(filepath)
		.resize(expectedW, expectedH, { kernel: "nearest" })
		.png()
		.toBuffer()
	await fs.promises.writeFile(filepath, resized)

	return { resized: true, from }
}

export async function checkAssets(
	entries: SpriteManifestEntry[],
	baseDir: string,
): Promise<AssetCheckResult[]> {
	const results: AssetCheckResult[] = []
	for (const entry of entries) {
		const expectedPath = path.join(baseDir, entry.filename)
		const { pass, reason } = await validateDimensions(expectedPath, entry)
		results.push({
			key: entry.key,
			category: entry.category,
			expectedPath,
			pass,
			reason,
		})
	}
	return results
}

export function printReport(
	toPrint: AssetCheckResult[],
	all: AssetCheckResult[] = toPrint,
): void {
	const byCategory = new Map<SpriteCategory, AssetCheckResult[]>()
	for (const result of toPrint) {
		const list = byCategory.get(result.category) ?? []
		list.push(result)
		byCategory.set(result.category, list)
	}

	for (const [category, categoryResults] of byCategory) {
		console.log(`\n${category}`)
		for (const result of categoryResults) {
			const mark = result.pass ? "PASS" : "MISSING"
			const detail = result.pass
				? ""
				: `  — expected at ${result.expectedPath} (${result.reason})`
			console.log(`  ${mark}  ${result.key}${detail}`)
		}
	}

	const missingCount = all.filter((r) => !r.pass).length
	console.log(`\n${all.length - missingCount}/${all.length} assets present.`)
	if (missingCount > 0) {
		console.log(
			`${missingCount} asset(s) missing or wrong-sized — see shared/gym-sprite-manifest.json for specs.`,
		)
	}
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			category: { type: "string" },
			missing: { type: "boolean", default: false },
			fix: { type: "boolean", default: false },
		},
	})

	const entries = await loadManifest(MANIFEST_PATH)
	const filtered = values.category
		? entries.filter((e) => e.category === values.category)
		: entries

	if (values.fix) {
		for (const entry of filtered) {
			const filepath = path.join(OUT_DIR, entry.filename)
			const animatedSource = await findAnimatedSource(filepath)
			if (animatedSource) {
				const { sourceFrames, sampledIndices } = await convertAnimatedSource(
					animatedSource,
					filepath,
					entry,
				)
				const note =
					sourceFrames === entry.frameCount
						? ""
						: ` (resampled from ${sourceFrames} source frames: [${sampledIndices.join(", ")}])`
				console.log(
					`  CONVERTED  ${entry.key}  ${path.basename(animatedSource)} → ${entry.frameCount}-frame spritesheet${note}`,
				)
				continue
			}

			const result = await normalizeAsset(filepath, entry)
			if (result.resized && result.from) {
				const { width: expectedW, height: expectedH } =
					expectedDimensions(entry)
				console.log(
					`  RESIZED  ${entry.key}  ${result.from.width}×${result.from.height} → ${expectedW}×${expectedH}`,
				)
			}
		}
	}

	const results = await checkAssets(filtered, OUT_DIR)
	const toPrint = values.missing ? results.filter((r) => !r.pass) : results
	printReport(toPrint, results)

	process.exit(results.every((r) => r.pass) ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main()
}
