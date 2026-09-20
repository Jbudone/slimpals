import type { ContentTuningType } from "./registry.js"

const SCENARIOS: Record<string, string> = {
	healthy_salad: "Grilled chicken salad with olive oil dressing and quinoa",
	fast_food_splurge: "Double cheeseburger, large fries, and a milkshake",
	skipped_breakfast_guilt:
		"Just black coffee — skipped breakfast again, feeling guilty",
	post_workout_shake: "Protein shake with a banana right after a gym session",
}

// Shared with victoryMessage.ts / weeklyInspiration.ts, which cascade from
// these same persona docs (Tier 1) rather than owning their own tone.
export const PERSONALITY_LABELS: Record<string, string> = {
	drill_sergeant: "Drill Sergeant",
	friendly: "Friendly",
	roaster: "Roaster",
	anime_sensei: "Anime Sensei",
	bro: "Bro",
}
const LABELS = PERSONALITY_LABELS

export const coachPersonalityType: ContentTuningType = {
	key: "coach_personality",
	label: "Coach Personality",
	subcategories: Object.entries(LABELS).map(([key, label]) => ({
		key,
		label,
		tuningDocPath: `server/services/ai/prompts/${key}.md`,
	})),
	contextParamFields: [
		{
			key: "scenario",
			label: "Sample meal scenario",
			type: "select",
			options: Object.entries(SCENARIOS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Too harsh",
		"Too soft",
		"Off-tone",
		"Too generic",
		"Too long-winded",
		"Perfect",
	],
	generateSample: ({ contextParams, tuningDocText, aiService }) =>
		aiService.generateCoachSample(
			tuningDocText,
			SCENARIOS[contextParams.scenario] ?? SCENARIOS.healthy_salad,
		),
}
