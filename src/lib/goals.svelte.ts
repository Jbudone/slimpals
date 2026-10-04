// The gym's star rating and rolling goals, pushed in from every layout the
// 3D gym reads or changes (the server computes both, see
// shared/gym3d/rating.ts and goals.ts).
import type {
	GymBurgerDto,
	GymGoalDto,
	GymLayoutDto,
	GymRatingDto,
} from "../../shared/types"

export const gymGoals = $state<{
	rating: GymRatingDto | null
	goals: GymGoalDto[]
	burger: GymBurgerDto | null
	/** Gear not unlocked yet, for the rewards page's path of what is next. */
	locked: GymLayoutDto["lockedGear"]
}>({ rating: null, goals: [], burger: null, locked: [] })

/** How many open goals the card lists. */
export const OPEN_GOALS_SHOWN = 3

export function setGymGoals(
	l: Pick<GymLayoutDto, "rating" | "goals" | "burger"> &
		Partial<Pick<GymLayoutDto, "lockedGear">>,
): void {
	gymGoals.rating = l.rating
	gymGoals.goals = l.goals
	gymGoals.burger = l.burger ?? null
	gymGoals.locked = l.lockedGear ?? gymGoals.locked
}

/** The next goals to work on, in queue order. */
export function openGoals(goals: readonly GymGoalDto[]): GymGoalDto[] {
	return goals.filter((g) => !g.done).slice(0, OPEN_GOALS_SHOWN)
}

/** "+2 Sweat, +1 Greens" for a goal's reward. */
export function rewardText(r: { sweat: number; greens: number }): string {
	const parts: string[] = []
	if (r.sweat) parts.push(`+${r.sweat} Sweat`)
	if (r.greens) parts.push(`+${r.greens} Greens`)
	return parts.join(", ")
}
