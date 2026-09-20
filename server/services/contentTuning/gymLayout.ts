import { db } from "../../db/index.js"
import { gymUpgradesCatalog } from "../../db/schema.js"
import { readTuningDoc } from "./fs.js"
import type { ContentTuningType } from "./registry.js"

// Preview only — this does NOT feed back into the live game's
// server/services/gym/layout.ts UPGRADE_LAYOUT, which stays a static,
// hand-tuned map. Promoting a tuned layout to production is a deliberate
// follow-up decision, not something this preview does automatically.
const LEVEL_TIER_MAX_XP: Record<string, number> = {
	early_game: 500,
	mid_game: 3000,
	late_game: 10000,
}

const LEVEL_LABELS: Record<string, string> = {
	early_game: "Early game (a handful of unlocks)",
	mid_game: "Mid game (most zones started)",
	late_game: "Late game (fully built out)",
}

export const gymLayoutType: ContentTuningType = {
	key: "gym_layout",
	label: "Gym Layout (experimental preview)",
	sampleKind: "layout",
	subcategories: [
		{
			key: "default",
			label: "Placement Rules",
			tuningDocPath: "server/services/contentTuning/docs/gym_layout.md",
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
		"Cluttered",
		"Awkwardly organized",
		"Not spaced out well",
		"Zones unclear",
		"Perfect",
	],
	generateSample: async ({ contextParams, aiService }) => {
		const maxXp =
			LEVEL_TIER_MAX_XP[contextParams.levelTier] ?? LEVEL_TIER_MAX_XP.mid_game
		const catalog = await db.select().from(gymUpgradesCatalog)
		const unlocked = catalog.filter((u) => u.requiredXp <= maxXp)

		const catalogLines = unlocked
			.map((u) => `${u.key} (${u.category})`)
			.join("\n")
		const rulesDoc = readTuningDoc(
			"server/services/contentTuning/docs/gym_layout.md",
		)
		const prompt = `${rulesDoc}\n\nItems to place:\n${catalogLines}`

		const layout = await aiService.generateGymLayout(prompt)

		return JSON.stringify({
			layout,
			items: unlocked.map((u) => ({
				key: u.key,
				name: u.name,
				category: u.category,
			})),
		})
	},
}
