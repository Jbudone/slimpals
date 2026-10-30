// Gear and class unlocks on a ladder instead of in clumps (docs/pacing.md).
// The catalog lists each piece with the XP it was first written for; what
// matters is the order. The n-th unlock, in that order, lands on rung n: dense
// early (about every 2 days for a steady player), sparser later, ending near
// level 16. Rungs come from `npm run pacing` (steady player, ladderDays).
export const UNLOCK_RUNGS: readonly number[] = [
	50, 120, 180, 270, 330, 390, 450, 530, 640, 780, 890, 1120, 1250, 1370, 1510,
	1620, 1760, 1880, 2010, 2240, 2480, 2720, 2960, 3260, 3460, 3670, 3900, 4150,
	4460, 4660, 4880, 5090, 5400, 5640, 5870, 6060,
]

type Row = { requiredXp: number }

/** Re-space the XP of unlocks across two lists at once, keeping their
 * order (ties keep list order) and leaving the free starters (0 XP) alone.
 * Past the last rung each one adds a level-sized step. */
export function respaceUnlocks<A extends Row, B extends Row>(
	first: A[],
	second: B[],
): [A[], B[]] {
	const all: { r: Row; l: number; i: number }[] = [
		...first.map((r, i) => ({ r: r as Row, l: 0, i })),
		...second.map((r, i) => ({ r: r as Row, l: 1, i })),
	]
	const paid = all.filter((x) => x.r.requiredXp > 0)
	paid.sort((a, b) => a.r.requiredXp - b.r.requiredXp || a.l - b.l || a.i - b.i)
	const xp = new Map<Row, number>()
	const last = UNLOCK_RUNGS[UNLOCK_RUNGS.length - 1] as number
	paid.forEach((x, n) => {
		xp.set(x.r, UNLOCK_RUNGS[n] ?? last + (n - UNLOCK_RUNGS.length + 1) * 300)
	})
	const re = <T extends Row>(rows: T[]): T[] =>
		rows.map((r) => ({ ...r, requiredXp: xp.get(r) ?? r.requiredXp }))
	return [re(first), re(second)]
}
