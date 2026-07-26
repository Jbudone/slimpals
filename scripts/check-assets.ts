import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import sharp from "sharp"

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
}

export type AssetCheckResult = {
	key: string
	category: SpriteCategory
	expectedPath: string
	pass: boolean
	reason?: string
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
	const expectedW = entry.frameWidth * entry.frameCount
	const expectedH = entry.frameHeight
	if (meta.width !== expectedW || meta.height !== expectedH) {
		return {
			pass: false,
			reason: `expected ${expectedW}×${expectedH}, got ${meta.width}×${meta.height}`,
		}
	}
	return { pass: true }
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
		},
	})

	const entries = await loadManifest(MANIFEST_PATH)
	const filtered = values.category
		? entries.filter((e) => e.category === values.category)
		: entries

	const results = await checkAssets(filtered, OUT_DIR)
	const toPrint = values.missing ? results.filter((r) => !r.pass) : results
	printReport(toPrint, results)

	process.exit(results.every((r) => r.pass) ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main()
}
