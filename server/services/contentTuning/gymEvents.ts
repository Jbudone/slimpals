import { buildGymEventPrompt } from "../gym/content.js"
import type { ContentTuningType } from "./registry.js"

const LEVEL_TIERS: Record<
	string,
	{ level: number; upgradeList: string; statsStr: string }
> = {
	early_game: {
		level: 2,
		upgradeList: "basic equipment only",
		statsStr: "Check-ins last 7 days: 2. Streak: 2 days. Weight: unknown kg.",
	},
	mid_game: {
		level: 8,
		upgradeList: "treadmill, free weights rack, yoga studio",
		statsStr: "Check-ins last 7 days: 5. Streak: 12 days. Weight: 82 kg.",
	},
	late_game: {
		level: 18,
		upgradeList:
			"treadmill, free weights rack, yoga studio, pool, sauna, juice bar, personal training suite",
		statsStr: "Check-ins last 7 days: 7. Streak: 60 days. Weight: 76 kg.",
	},
}

const LEVEL_LABELS: Record<string, string> = {
	early_game: "Early game (level 2, basic equipment)",
	mid_game: "Mid game (level 8, several upgrades)",
	late_game: "Late game (level 18, fully upgraded)",
}

export const gymEventsType: ContentTuningType = {
	key: "gym_events",
	label: "Gym Events",
	subcategories: [
		{
			key: "default",
			label: "Event Rules",
			tuningDocPath: "server/services/contentTuning/docs/gym_events.md",
		},
	],
	contextParamFields: [
		{
			key: "levelTier",
			label: "Sample gym progression tier",
			type: "select",
			options: Object.entries(LEVEL_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Wrong tone",
		"Type mix feels off",
		"Too generic",
		"Doesn't fit the gym's state",
		"Perfect",
	],
	generateSample: async ({ contextParams, aiService }) => {
		const tier = LEVEL_TIERS[contextParams.levelTier] ?? LEVEL_TIERS.mid_game
		const prompt = buildGymEventPrompt(tier)
		const event = await aiService.generateGymEvent(prompt)
		return `[${event.type}] ${event.title}\n${event.description}\nHost: ${event.npcKey ?? "none"} · Active ${event.activeHours[0]}:00–${event.activeHours[1]}:00`
	},
}
