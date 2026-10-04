// What the gym unlocks next, by XP: the upcoming gear in order, with how far
// along the player is (pure, so the rewards page and tests agree).
import type { GymLayoutDto } from "../../shared/types"

export type LockedGear = GymLayoutDto["lockedGear"][number]

export type UnlockStep = LockedGear & {
	/** XP still to earn (0 once reached). */
	toGo: number
	/** 0-1 of the way from the previous unlock (or 0) to this one. */
	k: number
}

/** The next `limit` unlocks, soonest first. */
export function upcomingUnlocks(
	gear: readonly LockedGear[],
	xp: number,
	limit = 6,
): UnlockStep[] {
	const sorted = [...gear]
		.filter((g) => g.requiredXp > 0)
		.sort((a, b) => a.requiredXp - b.requiredXp)
	const out: UnlockStep[] = []
	let prev = 0
	for (const g of sorted) {
		if (g.requiredXp <= xp) {
			prev = g.requiredXp
			continue
		}
		if (out.length >= limit) break
		const span = Math.max(1, g.requiredXp - prev)
		out.push({
			...g,
			toGo: g.requiredXp - xp,
			k: Math.min(1, Math.max(0, (xp - prev) / span)),
		})
		prev = g.requiredXp
	}
	return out
}
