// The one level curve (docs/pacing.md): XP to begin level N is LEVEL_A x N^LEVEL_P.
// Flatter than the old 50 x N^2, so levels keep arriving at a steady pace for a
// player who keeps checking in. Server, client and the pacing tool all read this.
export const LEVEL_A = 90
export const LEVEL_P = 1.5

/** XP at which `level` begins. */
export const xpOfLevel = (level: number): number =>
	level <= 0 ? 0 : Math.round(LEVEL_A * level ** LEVEL_P)

/** Gym level at `xp`. */
export function levelOfXp(xp: number): number {
	const x = Math.max(0, xp)
	let l = Math.floor((x / LEVEL_A) ** (1 / LEVEL_P))
	while (xpOfLevel(l + 1) <= x) l++
	while (l > 0 && xpOfLevel(l) > x) l--
	return l
}
