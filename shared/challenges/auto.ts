// Goals the app counts on its own (#124 "auto" task type): a goal marked
// `auto` takes no taps from the player; the food log and the check-in feed it.
// Silver targets and tiers apply as for any goal.

export const AUTO_GOAL_KINDS = ["great_meal", "checkin"] as const
export type AutoGoalKind = (typeof AUTO_GOAL_KINDS)[number]

export function isAutoKind(v: unknown): v is AutoGoalKind {
	return (
		typeof v === "string" && (AUTO_GOAL_KINDS as readonly string[]).includes(v)
	)
}

/** A meal photo counts as "great" from this AI rating (1-10) up. */
export const GREAT_MEAL_RATING = 8

export const AUTO_GOAL_NOTE: Readonly<Record<AutoGoalKind, string>> = {
	great_meal: "Counts on its own when a meal photo rates great.",
	checkin: "Counts on its own with your daily check-in.",
}
