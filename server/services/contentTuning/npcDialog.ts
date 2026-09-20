import { buildNpcDialogPrompt, type RelationshipStage } from "../gym/dialog.js"
import type { ContentTuningType } from "./registry.js"

const PROFILE_PRESETS: Record<
	string,
	{
		npcName: string
		npcRole: string
		personalityProfile: Record<string, unknown>
		isHero: boolean
	}
> = {
	energetic_trainer: {
		npcName: "Jess",
		npcRole: "personal trainer",
		personalityProfile: {
			energy: "high",
			humor: "playful",
			specialty: "strength training",
		},
		isHero: false,
	},
	chill_regular: {
		npcName: "Marcus",
		npcRole: "gym regular",
		personalityProfile: {
			energy: "low-key",
			humor: "dry",
			specialty: "cardio",
		},
		isHero: false,
	},
	hero_visitor: {
		npcName: "Ava Steele",
		npcRole: "visiting fitness influencer",
		personalityProfile: {
			energy: "very high",
			humor: "confident",
			specialty: "motivation",
		},
		isHero: true,
	},
}

const STAGE_LABELS: Record<string, string> = {
	"0": "Stranger",
	"1": "Acquaintance",
	"2": "Gym Buddy",
	"3": "Friend",
}

export const npcDialogType: ContentTuningType = {
	key: "npc_dialog",
	label: "NPC Dialog",
	subcategories: [
		{
			key: "default",
			label: "Shared Scaffolding",
			tuningDocPath: "server/services/contentTuning/docs/npc_dialog.md",
		},
	],
	contextParamFields: [
		{
			key: "npcProfile",
			label: "Sample NPC personality",
			type: "select",
			options: Object.entries(PROFILE_PRESETS).map(([value, p]) => ({
				value,
				label: `${p.npcName} (${p.npcRole})`,
			})),
		},
		{
			key: "relationshipStage",
			label: "Relationship stage",
			type: "select",
			options: Object.entries(STAGE_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Too generic",
		"Off-tone",
		"Too long",
		"Doesn't feel like the character",
		"Perfect",
	],
	generateSample: async ({ contextParams, aiService }) => {
		const preset =
			PROFILE_PRESETS[contextParams.npcProfile] ??
			PROFILE_PRESETS.energetic_trainer
		const stage = (Number(contextParams.relationshipStage) ||
			0) as RelationshipStage

		const prompt = buildNpcDialogPrompt({
			npcName: preset.npcName,
			npcRole: preset.npcRole,
			personalityProfile: preset.personalityProfile,
			stage,
			statsStr:
				"Streak: 12 days. Recent badges: Early Bird. Latest weight: 78 kg.",
			notesStr: "Mentioned they're training for a 5K.",
			memoryStr: "",
			isHero: preset.isHero,
		})

		const dialogs = await aiService.generateNpcDialogs(prompt)
		return dialogs
			.map((d) => `Q: ${d.promptText}\nA: ${d.response}`)
			.join("\n\n")
	},
}
