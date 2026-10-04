// Milestones on the monthly challenge (#124, first slice): at 25, 50, 75 and
// 100% of the challenge (the average completion of its goals) the gym is paid
// a small reward, once. Pure: the fraction and which milestones it reaches.

export type ChallengeMilestone = {
	pct: 25 | 50 | 75 | 100
	coins: number
	sweat: number
	greens: number
}

export const CHALLENGE_MILESTONES: readonly ChallengeMilestone[] = [
	{ pct: 25, coins: 50, sweat: 0, greens: 0 },
	{ pct: 50, coins: 100, sweat: 1, greens: 0 },
	{ pct: 75, coins: 150, sweat: 0, greens: 1 },
	{ pct: 100, coins: 250, sweat: 2, greens: 2 },
]

/** Average completion of the goals, 0-1 (a goal counts up to its target). */
export function challengeFraction(
	goals: readonly { id: string; target: number }[],
	progress: Readonly<Record<string, number>>,
): number {
	if (goals.length === 0) return 0
	const sum = goals.reduce(
		(a, g) =>
			a + (g.target > 0 ? Math.min(1, (progress[g.id] ?? 0) / g.target) : 1),
		0,
	)
	return sum / goals.length
}

/** The milestones a completion fraction has reached. */
export function reachedMilestones(fraction: number): ChallengeMilestone[] {
	// the small epsilon keeps 0.25 reached when it was summed from fractions
	return CHALLENGE_MILESTONES.filter((m) => fraction * 100 + 1e-9 >= m.pct)
}

export function milestoneSource(challengeId: number, pct: number): string {
	return `challenge:${challengeId}:m${pct}`
}
