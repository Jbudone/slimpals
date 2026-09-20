import type { WeeklyStats } from "../ai/index.js"
import { PERSONALITY_LABELS } from "./coachPersonality.js"
import type { ContentTuningType } from "./registry.js"

const SCENARIOS: Record<string, WeeklyStats> = {
	strong_week: {
		checkins: 7,
		weightDeltaKg: -0.6,
		foodLogs: 15,
		badgesEarned: 1,
	},
	quiet_week: {
		checkins: 2,
		weightDeltaKg: null,
		foodLogs: 3,
		badgesEarned: 0,
	},
	mixed_week: {
		checkins: 4,
		weightDeltaKg: 0.2,
		foodLogs: 8,
		badgesEarned: 0,
	},
}

const SCENARIO_LABELS: Record<string, string> = {
	strong_week: "Strong week (7/7 check-ins, lost weight, earned a badge)",
	quiet_week: "Quiet week (2/7 check-ins, no weight entries)",
	mixed_week: "Mixed week (4/7 check-ins, slight weight gain)",
}

export const weeklyInspirationType: ContentTuningType = {
	key: "weekly_inspiration",
	label: "Weekly Inspiration",
	subcategories: [
		{
			key: "default",
			label: "Wrapper Rules",
			tuningDocPath: "server/services/contentTuning/docs/weekly_inspiration.md",
		},
	],
	contextParamFields: [
		{
			key: "personality",
			label: "Coach personality (cascades from Tier 1 persona docs)",
			type: "select",
			options: Object.entries(PERSONALITY_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
		{
			key: "scenario",
			label: "Sample week scenario",
			type: "select",
			options: Object.entries(SCENARIO_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Too generic",
		"Too long-winded",
		"Off-tone",
		"Not specific enough",
		"Perfect",
	],
	generateSample: ({ contextParams, aiService }) =>
		aiService.generateWeeklyInspiration(
			"Sample User",
			SCENARIOS[contextParams.scenario] ?? SCENARIOS.strong_week,
			contextParams.personality || "friendly",
		),
}
