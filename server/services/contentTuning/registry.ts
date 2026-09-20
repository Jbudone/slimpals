import type { AIService } from "../ai/index.js"
import { coachPersonalityType } from "./coachPersonality.js"

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
	// Default "text" — an image-based type (e.g. NPC portraits, a future
	// tier) can set "image" so the frontend renders an <img> instead.
	sampleKind?: "text" | "image"
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

export const CONTENT_TUNING_TYPES: ContentTuningType[] = [coachPersonalityType]

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
