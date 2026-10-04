import type { ContentTuningType } from "./registry.js"

// Situations the gym can be in (mirrors the cases `shared/gym3d/banter.ts`
// picks for); the tuning doc holds the style rules.
export const BANTER_SCENARIOS: Record<string, string> = {
	maxout:
		"The rival gym across the street, MaxOut, has a fifty percent off sign up this weekend.",
	event:
		"A themed event is on in the lobby today, with its host standing by the door.",
	no_pool:
		"The gym has no swimming pool. The rival gym across the street, MaxOut, has one.",
	crowded: "Every machine in the cardio room is taken and people are waiting.",
	class_running: "A group class is running in the studio right now.",
	fresh_upgrade:
		"The owner upgraded a treadmill a few minutes ago. It has a new screen.",
	quiet: "Nothing special: a quiet afternoon with a handful of people.",
}

const LABELS: Record<string, string> = {
	maxout: "MaxOut's promo",
	event: "An event in the lobby",
	no_pool: "No pool (MaxOut has one)",
	crowded: "A crowded room",
	class_running: "A class is running",
	fresh_upgrade: "Gear was just upgraded",
	quiet: "A quiet afternoon",
}

export const npcBanterType: ContentTuningType = {
	key: "npc_banter",
	label: "NPC Banter",
	subcategories: [
		{
			key: "default",
			label: "Banter Style",
			tuningDocPath: "server/services/contentTuning/docs/npc_banter.md",
		},
	],
	contextParamFields: [
		{
			key: "situation",
			label: "Situation in the gym",
			type: "select",
			options: Object.entries(LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Too jokey",
		"Not dry enough",
		"Too long",
		"Ignores the situation",
		"Perfect",
	],
	generateSample: ({ contextParams, tuningDocText, aiService }) =>
		aiService.generateCoachSample(
			tuningDocText,
			BANTER_SCENARIOS[contextParams.situation] ?? BANTER_SCENARIOS.quiet,
		),
}
