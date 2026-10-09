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

/** How many unlocks show in full; the next one is only hinted at, the rest
 * stay a surprise (they appear as you level up). */
export const REVEALED = 3

/** The level whose XP range holds this XP (level L starts at 50 L² XP, the
 * same formula as `levelOf` in wallet.svelte.ts and the server). */
export const levelAtXp = (xp: number): number =>
	Math.floor(Math.sqrt(Math.max(0, xp) / 50))

export type UnlockRail = {
	/** The next unlocks, soonest first, shown in full. */
	shown: UnlockStep[]
	/** The one after those: no name, only when it comes. */
	hint: { requiredXp: number; level: number; toGo: number } | null
}

/** "Reveal three, hint one, hide the rest": what the player may see of the
 * road ahead, so something is always about to be discovered. */
export function unlockRail(
	gear: readonly LockedGear[],
	xp: number,
): UnlockRail {
	const next = upcomingUnlocks(gear, xp, REVEALED + 1)
	const h = next[REVEALED]
	return {
		shown: next.slice(0, REVEALED),
		hint: h
			? {
					requiredXp: h.requiredXp,
					level: levelAtXp(h.requiredXp),
					toGo: h.toGo,
				}
			: null,
	}
}
