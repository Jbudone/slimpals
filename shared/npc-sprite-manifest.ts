/**
 * NPC sprites are nested by animation and direction (unlike the flat
 * `sprites[]` list for props/equipment) because each NPC can have several
 * named animations (idle, walk, cheer, per-equipment exercise poses), and
 * each animation can in principle have per-direction art later. `directions`
 * only ever has a "default" key today — no 4-directional art yet, see
 * docs/prd-gym-pixel-art-redesign.md — but the shape leaves room for it.
 */

export type StaticFileSpec = {
	type: "static"
	file: string
}

export type SpritesheetFileSpec = {
	type: "spritesheet"
	file: string
	frameWidth: number
	frameHeight: number
	frameCount: number
	fps: number
	offsetX?: number
	offsetY?: number
}

/**
 * Art authored as an animated GIF instead of a hand-laid-out spritesheet.
 * `npm run check-assets -- --fix` converts it to a spritesheet PNG on disk
 * (resampling to frameCount if the gif has a different number of frames);
 * frameWidth/frameHeight/frameCount/fps describe the desired *output*, same
 * as they would for a spritesheet entry.
 */
export type GifFileSpec = {
	type: "gif"
	file: string
	frameWidth: number
	frameHeight: number
	frameCount: number
	fps: number
}

export type NpcFileSpec = StaticFileSpec | SpritesheetFileSpec | GifFileSpec

export type NpcAnimationSpec = {
	directions: Record<string, NpcFileSpec>
}

export type NpcManifestEntry = {
	description?: string
	animations: Record<string, NpcAnimationSpec>
}

export type NpcManifest = Record<string, NpcManifestEntry>

/** One (npc, animation, direction) resolved into a loadable sprite entry. */
export type FlatNpcSprite = {
	key: string
	npcKey: string
	animation: string
	direction: string
	sourceType: NpcFileSpec["type"]
	/** Always the path Phaser should load — for gif sources this is the .gif's basename with .png swapped in, i.e. what `--fix` writes. */
	filename: string
	frameWidth: number
	frameHeight: number
	frameCount: number
	fps: number
	offsetX: number
	offsetY: number
}

export function deriveNpcTextureKey(
	npcKey: string,
	animation: string,
	direction: string,
): string {
	return `npc_${npcKey}__${animation}__${direction}`
}

function toLoadableFilename(spec: NpcFileSpec): string {
	if (spec.type === "gif") return spec.file.replace(/\.gif$/i, ".png")
	return spec.file
}

export function flattenNpcSprite(
	npcKey: string,
	animation: string,
	direction: string,
	spec: NpcFileSpec,
): FlatNpcSprite {
	const key = deriveNpcTextureKey(npcKey, animation, direction)
	const filename = toLoadableFilename(spec)
	if (spec.type === "static") {
		return {
			key,
			npcKey,
			animation,
			direction,
			sourceType: spec.type,
			filename,
			frameWidth: 96,
			frameHeight: 96,
			frameCount: 1,
			fps: 0,
			offsetX: 0,
			offsetY: 0,
		}
	}
	return {
		key,
		npcKey,
		animation,
		direction,
		sourceType: spec.type,
		filename,
		frameWidth: spec.frameWidth,
		frameHeight: spec.frameHeight,
		frameCount: spec.frameCount,
		fps: spec.fps,
		offsetX: spec.type === "spritesheet" ? (spec.offsetX ?? 0) : 0,
		offsetY: spec.type === "spritesheet" ? (spec.offsetY ?? 0) : 0,
	}
}

export function flattenNpcManifest(npcs: NpcManifest): FlatNpcSprite[] {
	const out: FlatNpcSprite[] = []
	for (const [npcKey, npc] of Object.entries(npcs)) {
		for (const [animation, animSpec] of Object.entries(npc.animations)) {
			for (const [direction, fileSpec] of Object.entries(animSpec.directions)) {
				out.push(flattenNpcSprite(npcKey, animation, direction, fileSpec))
			}
		}
	}
	return out
}
