// A name and prize line for a system tournament, written by the AI (#123) and
// checked here; anything that does not pass keeps the deterministic name from
// `recurringPeriods`. Pure so the rules are unit-tested.

export type TournamentFlavor = { name: string; reward: string }

const BODY_TALK = /weight|\bfat\b|lazy|skinny|diet|belly|calorie|scale/i

/** The flavor cleaned up, or null when it should not be used. A weight-loss
 * tournament keeps its own plain name, so the body-talk rule only checks the
 * words the AI added. */
export function cleanTournamentFlavor(raw: unknown): TournamentFlavor | null {
	const r = raw as { name?: unknown; reward?: unknown } | null
	if (!r || typeof r.name !== "string" || typeof r.reward !== "string")
		return null
	const name = r.name.trim().replace(/\s+/g, " ")
	const reward = r.reward.trim().replace(/\s+/g, " ")
	if (name.length < 4 || name.length > 40) return null
	if (reward.length < 4 || reward.length > 120) return null
	if (name.includes("!") || reward.includes("!")) return null
	if (BODY_TALK.test(name) || BODY_TALK.test(reward)) return null
	return { name, reward }
}
