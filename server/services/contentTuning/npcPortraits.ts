import {
	buildPortraitPrompt,
	PORTRAIT_STAGE_DESCRIPTIONS,
} from "../gym/content.js"
import type { ContentTuningType } from "./registry.js"

// Preview generations write to a small, fixed set of files (one per
// preset x stage) that get overwritten on every regenerate, rather than
// accumulating forever — a cache-busting query param on the returned URL
// keeps the browser from showing a stale image after an overwrite.
const PREVIEW_DIR = "public/assets/gym/portraits/_tuning-preview"

const NPC_PRESETS: Record<string, { npcName: string; upgradeHint: string }> = {
	trainer: {
		npcName: "Marcus the trainer",
		upgradeHint: " Background subtly references a free weights rack.",
	},
	receptionist: {
		npcName: "Lisa the receptionist",
		upgradeHint: " Background subtly references a smoothie bar.",
	},
}

const NPC_LABELS: Record<string, string> = {
	trainer: "Marcus (trainer)",
	receptionist: "Lisa (receptionist)",
}

const STAGE_LABELS: Record<string, string> = {
	"2": "Stage 2 — Gym Buddy",
	"3": "Stage 3 — Friend",
}

export const npcPortraitsType: ContentTuningType = {
	key: "npc_portraits",
	label: "NPC Portraits",
	sampleKind: "image",
	subcategories: [
		{
			key: "default",
			label: "Art Style Rules",
			tuningDocPath: "server/services/contentTuning/docs/npc_portraits.md",
		},
	],
	contextParamFields: [
		{
			key: "npcPreset",
			label: "Sample NPC",
			type: "select",
			options: Object.entries(NPC_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
		{
			key: "stage",
			label: "Relationship stage",
			type: "select",
			options: Object.entries(STAGE_LABELS).map(([value, label]) => ({
				value,
				label,
			})),
		},
	],
	feedbackTags: [
		"Wrong palette",
		"Too detailed",
		"Off-model",
		"Outline too thick/thin",
		"Perfect",
	],
	generateSample: async ({ contextParams, aiService }) => {
		const preset = NPC_PRESETS[contextParams.npcPreset] ?? NPC_PRESETS.trainer
		const stage = Number(contextParams.stage) || 2

		const prompt = buildPortraitPrompt({
			npcName: preset.npcName,
			stageDescription:
				PORTRAIT_STAGE_DESCRIPTIONS[stage] ?? "neutral expression",
			upgradeHint: stage === 3 ? preset.upgradeHint : "",
		})

		const fileName = `${contextParams.npcPreset || "trainer"}-stage${stage}.png`
		const outputPath = `${PREVIEW_DIR}/${fileName}`
		const result = await aiService.generateNpcPortrait(prompt, outputPath)
		if (!result) return ""
		return `/assets/gym/portraits/_tuning-preview/${fileName}?v=${Date.now()}`
	},
}
