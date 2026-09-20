import { PERSONALITY_LABELS } from "./coachPersonality.js"
import type { ContentTuningType } from "./registry.js"

const TOURNAMENT_TYPES: Record<string, string> = {
	weight_loss: "Weight Loss Challenge",
	streak: "30-Day Check-in Streak",
	food_challenge: "Clean Eating Challenge",
	step_count: "10K Steps Tournament",
}

export const victoryMessageType: ContentTuningType = {
	key: "victory_message",
	label: "Tournament Victory Message",
	subcategories: [
		{
			key: "default",
			label: "Wrapper Rules",
			tuningDocPath: "server/services/contentTuning/docs/victory_message.md",
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
			key: "tournamentType",
			label: "Tournament type",
			type: "select",
			options: Object.entries(TOURNAMENT_TYPES).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Too generic",
		"Too long-winded",
		"Off-tone",
		"Not celebratory enough",
		"Perfect",
	],
	generateSample: ({ contextParams, aiService }) =>
		aiService.generateVictoryMessage(
			"Sample User",
			TOURNAMENT_TYPES[contextParams.tournamentType] ?? "30-Day Step Challenge",
			contextParams.tournamentType || "step_count",
			contextParams.personality || "friendly",
		),
}
