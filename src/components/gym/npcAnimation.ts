/**
 * Resolves whether real animation art exists for a given NPC animation
 * (walk, cheer, a per-equipment exercise pose, ...), directly off the
 * manifest's `npcs` structure — no more string-guessing (`npc_<key>_walk`).
 * Kept free of Phaser so it's testable without a scene — callers compute the
 * "available" key set from scene.textures/registry and pass it in.
 */
import manifest from "shared/gym-sprite-manifest.json"
import {
	deriveNpcTextureKey,
	type NpcManifest,
} from "shared/npc-sprite-manifest.js"

export type AnimationAvailability = "art" | "fallback"

/**
 * Looks up the Phaser texture key for (npc, animation, direction) if the
 * manifest declares that animation at all. Direction defaults to "default" —
 * no 4-directional art yet, see docs/prd-gym-pixel-art-redesign.md.
 */
export function resolveAnimationKey(
	npcKey: string,
	animation: string,
	npcs: NpcManifest = manifest.npcs as NpcManifest,
	direction = "default",
): string | null {
	const spec = npcs[npcKey]?.animations[animation]?.directions[direction]
	if (!spec) return null
	return deriveNpcTextureKey(npcKey, animation, direction)
}

/**
 * Decides whether real animation/pose art is available for (npc, animation),
 * given the set of texture keys that currently resolve to real (non-
 * placeholder) textures. "fallback" means the caller should use its
 * tween-based fake animation.
 */
export type NpcAnimationOption = {
	npcKey: string
	animation: string
	textureKey: string
}

/**
 * Flattens the manifest into every (npc, animation) pair that has default-
 * direction art, for admin tooling that lets a tester jump to and inspect
 * any specific pose (see gh-103). Sorted by npcKey then animation for a
 * stable, predictable dropdown order.
 */
export function listNpcAnimationOptions(
	npcs: NpcManifest = manifest.npcs as NpcManifest,
): NpcAnimationOption[] {
	const options: NpcAnimationOption[] = []
	for (const [npcKey, npc] of Object.entries(npcs)) {
		for (const animation of Object.keys(npc.animations)) {
			const textureKey = resolveAnimationKey(npcKey, animation, npcs)
			if (textureKey) options.push({ npcKey, animation, textureKey })
		}
	}
	return options.sort(
		(a, b) =>
			a.npcKey.localeCompare(b.npcKey) ||
			a.animation.localeCompare(b.animation),
	)
}

export function resolveAnimationAvailability(
	npcKey: string,
	animation: string,
	availableKeys: ReadonlySet<string>,
	npcs: NpcManifest = manifest.npcs as NpcManifest,
	direction = "default",
): AnimationAvailability {
	const key = resolveAnimationKey(npcKey, animation, npcs, direction)
	return key !== null && availableKeys.has(key) ? "art" : "fallback"
}
