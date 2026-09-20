import type { SprintContext } from "../ai/index.js"
import type { ContentTuningType } from "./registry.js"

const SCENARIOS: Record<string, SprintContext> = {
	active_user: {
		checkins: 6,
		foodLogs: 12,
		weightEntries: 3,
		hasChallenge: true,
	},
	quiet_user: {
		checkins: 1,
		foodLogs: 2,
		weightEntries: 0,
		hasChallenge: false,
	},
	mid_challenge: {
		checkins: 4,
		foodLogs: 8,
		weightEntries: 2,
		hasChallenge: true,
	},
}

const SCENARIO_LABELS: Record<string, string> = {
	active_user: "Active user (6/7 check-ins, in a challenge)",
	quiet_user: "Quiet user (1/7 check-ins, no challenge)",
	mid_challenge: "Mid-challenge, moderately active",
}

export const sprintsType: ContentTuningType = {
	key: "sprints",
	label: "Weekly Sprints",
	subcategories: [
		{
			key: "default",
			label: "Task Rules",
			tuningDocPath: "server/services/contentTuning/docs/sprints.md",
		},
	],
	contextParamFields: [
		{
			key: "scenario",
			label: "Sample activity scenario",
			type: "select",
			options: Object.entries(SCENARIO_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Too hard",
		"Too easy",
		"Not varied enough",
		"Off-tone",
		"Perfect",
	],
	generateSample: async ({ contextParams, aiService }) => {
		const ctx = SCENARIOS[contextParams.scenario] ?? SCENARIOS.active_user
		const result = await aiService.generateWeeklySprint("Sample User", ctx)
		return `${result.title}\n${result.tasks.map((t) => `- ${t.title}`).join("\n")}`
	},
}
