// Curated monthly challenges (#124): hand-written cards with a tagline, a
// coach intro line and a decor reward for finishing, from the Challenge Forge
// seeds. The monthly generator can fall back to one when the AI is down, and
// an admin can put one in a month. Goals are month-long running totals like
// the generated ones (`dailyAmount` is added each day the player taps).

import type { AutoGoalKind } from "./auto.js"

export type CatalogGoal = {
	id: string
	title: string
	description: string
	target: number
	unit: string
	dailyAmount: number
	dailyPrompt: string
	/** Counted by the app itself (shared/challenges/auto.ts). */
	auto?: AutoGoalKind
}

export type CatalogChallenge = {
	key: string
	title: string
	category: "strength" | "cardio" | "nutrition"
	tagline: string
	description: string
	theme: string
	/** The coach's opening line when the challenge starts. */
	coachIntro: string
	/** A decor cosmetic key (shared/gym3d/cosmetics.ts) for finishing it. */
	rewardCosmetic: string
	goals: CatalogGoal[]
}

export const CHALLENGE_CATALOG: readonly CatalogChallenge[] = [
	{
		key: "burpee_blitz",
		title: "Burpee Blitz",
		category: "strength",
		tagline: "Insert coin. Drop and give me burpees.",
		description:
			"A month of arcade-speed strength work: burpees and planks, a little every day.",
		theme: "arcade",
		coachIntro:
			"Player one, ready? Burpees on the board. Start small, score big.",
		rewardCosmetic: "arcade_cabinet",
		goals: [
			{
				id: "goal_1",
				title: "300 Burpees",
				description: "About 15 a day, in any sets you like",
				target: 300,
				unit: "burpees",
				dailyAmount: 15,
				dailyPrompt: "Did you do your 15 burpees today?",
			},
			{
				id: "goal_2",
				title: "60 Minutes of Plank",
				description: "A few minutes of plank each day adds up",
				target: 60,
				unit: "minutes",
				dailyAmount: 3,
				dailyPrompt: "Did you plank for 3 minutes today?",
			},
			{
				id: "goal_3",
				title: "20 Strength Sessions",
				description: "Any strength work counts: one session a day",
				target: 20,
				unit: "sessions",
				dailyAmount: 1,
				dailyPrompt: "Did you do a strength session today?",
			},
		],
	},
	{
		key: "sunrise_stride",
		title: "Sunrise Stride",
		category: "cardio",
		tagline: "Beat the sun out the door.",
		description:
			"Morning movement for a month: walk or run before 9am and watch the days get lighter.",
		theme: "sunrise",
		coachIntro:
			"Up with the sun. Shoes by the door, and I'll see you out there.",
		rewardCosmetic: "sunrise_mural",
		goals: [
			{
				id: "goal_1",
				title: "20 Morning Outings",
				description: "A walk or run before 9am",
				target: 20,
				unit: "mornings",
				dailyAmount: 1,
				dailyPrompt: "Did you get out before 9am today?",
			},
			{
				id: "goal_2",
				title: "450 Minutes of Cardio",
				description: "About 20 minutes of walking, running or cycling a day",
				target: 450,
				unit: "minutes",
				dailyAmount: 20,
				dailyPrompt: "Did you move for 20 minutes today?",
			},
			{
				id: "goal_3",
				title: "100 Glasses of Water",
				description: "A glass or two with each outing, about 5 a day",
				target: 100,
				unit: "glasses",
				dailyAmount: 5,
				dailyPrompt: "Did you drink your 5 glasses today?",
			},
		],
	},
	{
		key: "green_machine",
		title: "Green Machine",
		category: "nutrition",
		tagline: "Your plate, but greener.",
		description:
			"Add a little green to every day: vegetables, good meals and water.",
		theme: "greens",
		coachIntro: "One more green thing on the plate. That is the whole plan.",
		rewardCosmetic: "herb_planter",
		goals: [
			{
				id: "goal_1",
				title: "60 Servings of Vegetables",
				description: "About 3 a day",
				target: 60,
				unit: "servings",
				dailyAmount: 3,
				dailyPrompt: "Did you eat 3 servings of vegetables today?",
			},
			{
				id: "goal_2",
				title: "25 Great Meals",
				description: "Meal photos the coach rates great, counted for you",
				target: 25,
				unit: "meals",
				dailyAmount: 1,
				dailyPrompt: "Did you log a meal the coach rated great today?",
				auto: "great_meal",
			},
			{
				id: "goal_3",
				title: "120 Glasses of Water",
				description: "About 6 a day",
				target: 120,
				unit: "glasses",
				dailyAmount: 6,
				dailyPrompt: "Did you drink your 6 glasses today?",
			},
		],
	},
]

export function catalogChallenge(key: string): CatalogChallenge | null {
	return CHALLENGE_CATALOG.find((c) => c.key === key) ?? null
}

/** The catalog card for a month: they take turns, so the same month in
 * another year can differ and neighbouring months never repeat. */
export function catalogForMonth(month: number, year: number): CatalogChallenge {
	return CHALLENGE_CATALOG[(year * 12 + month) % CHALLENGE_CATALOG.length]
}
