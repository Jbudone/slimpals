// Bronze / silver / gold on the monthly challenge (#124): the player picks a
// tier when joining. A tier scales every goal's target (and the coins its
// milestones pay), so the same challenge fits a gentler or a harder month.
// Silver is the challenge as generated, and what everyone joined before tiers.

export const CHALLENGE_TIERS = ["bronze", "silver", "gold"] as const
export type ChallengeTier = (typeof CHALLENGE_TIERS)[number]

export const TIER_INFO: Record<
	ChallengeTier,
	{ label: string; targetMult: number; coinMult: number }
> = {
	bronze: { label: "Bronze", targetMult: 0.6, coinMult: 0.75 },
	silver: { label: "Silver", targetMult: 1, coinMult: 1 },
	gold: { label: "Gold", targetMult: 1.4, coinMult: 1.5 },
}

export function isTier(v: unknown): v is ChallengeTier {
	return (
		typeof v === "string" && (CHALLENGE_TIERS as readonly string[]).includes(v)
	)
}

/** A goal's target at a tier (at least 1, whole numbers). */
export function tierTarget(base: number, tier: ChallengeTier): number {
	return Math.max(1, Math.round(base * TIER_INFO[tier].targetMult))
}

/** The goals as this tier sees them: the same goals with scaled targets. */
export function tierGoals<G extends { target: number }>(
	goals: readonly G[],
	tier: ChallengeTier,
): G[] {
	return goals.map((g) => ({ ...g, target: tierTarget(g.target, tier) }))
}

export function tierCoins(coins: number, tier: ChallengeTier): number {
	return Math.round(coins * TIER_INFO[tier].coinMult)
}
