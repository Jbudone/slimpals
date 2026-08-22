/**
 * Naming conventions + pure decision logic for NPC animation art (walk-cycle,
 * exercise poses). Kept free of Phaser so it's testable without a scene —
 * callers compute the "available" key set from scene.textures/registry and
 * pass it in.
 */

export function resolveWalkKey(npcKey: string): string {
	return `npc_${npcKey}_walk`
}

export function resolvePoseKey(npcKey: string, equipmentKey: string): string {
	return `npc_${npcKey}_${equipmentKey}`
}

export type AnimationAvailability = "art" | "fallback"

/**
 * Decides whether real animation art is available for a candidate key, given
 * the set of keys that currently resolve to real (non-placeholder) textures.
 * "fallback" means the caller should use its tween-based fake animation.
 */
export function resolveAnimationAvailability(
	candidateKey: string,
	availableKeys: ReadonlySet<string>,
): AnimationAvailability {
	return availableKeys.has(candidateKey) ? "art" : "fallback"
}
