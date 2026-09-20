import type { AIService } from "../ai/index.js"
import { coachPersonalityType } from "./coachPersonality.js"
import { gymEventsType } from "./gymEvents.js"
import { gymLayoutType } from "./gymLayout.js"
import { monthlyChallengeType } from "./monthlyChallenge.js"
import { npcDialogType } from "./npcDialog.js"
import { npcPortraitsType } from "./npcPortraits.js"
import { sprintsType } from "./sprints.js"
import { victoryMessageType } from "./victoryMessage.js"
import { weeklyInspirationType } from "./weeklyInspiration.js"

export type ContextParamField =
	| {
			key: string
			label: string
			type: "select"
			options: { value: string; label: string }[]
	  }
	| { key: string; label: string; type: "text" }

export type ContentTuningSubcategory = {
	key: string
	label: string
	tuningDocPath: string
}

export type ContentTuningType = {
	key: string
	label: string
	// Default "text". "image" renders an <img> (e.g. NPC portraits).
	// "layout" renders a JSON.parse'd {layout, items} spatial preview as
	// inline SVG (e.g. gym layout).
	sampleKind?: "text" | "image" | "layout"
	subcategories: ContentTuningSubcategory[]
	contextParamFields: ContextParamField[]
	feedbackTags: string[]
	generateSample: (args: {
		subcategoryKey: string
		contextParams: Record<string, string>
		tuningDocText: string
		aiService: AIService
	}) => Promise<string>
}

export const CONTENT_TUNING_TYPES: ContentTuningType[] = [
	coachPersonalityType,
	sprintsType,
	monthlyChallengeType,
	victoryMessageType,
	weeklyInspirationType,
	npcDialogType,
	gymEventsType,
	npcPortraitsType,
	gymLayoutType,
]

export function getContentTuningType(
	key: string,
): ContentTuningType | undefined {
	return CONTENT_TUNING_TYPES.find((t) => t.key === key)
}

export function getSubcategory(
	type: ContentTuningType,
	subcategoryKey: string,
): ContentTuningSubcategory | undefined {
	return type.subcategories.find((s) => s.key === subcategoryKey)
}
