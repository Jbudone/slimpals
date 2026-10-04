import {
	allChallengeLines,
	allCoachLines,
	COACH_NAMES,
	COACH_VOICES,
} from "../../../shared/gym3d/coachLines.js"
import type { ContentTuningType } from "./registry.js"

// The coach bubble's lines are scripted (`shared/gym3d/coachLines.ts`), never
// written by the AI at play time. This type lets an admin read every line a
// voice has for a situation next to the style rules, so the lines can be
// reviewed and tuned together. The sample is the scripted text itself.

const lines = () => [...allCoachLines(), ...allChallengeLines()]

const SITUATIONS = [...new Set(lines().map((l) => l.id.split(":")[1]))].sort()

const label = (s: string) =>
	s.replace("challenge-", "Challenge: ").replace(/^./, (c) => c.toUpperCase())

export const coachLinesType: ContentTuningType = {
	key: "coach_lines",
	label: "Coach Lines",
	subcategories: [
		{
			key: "default",
			label: "Line Style",
			tuningDocPath: "server/services/contentTuning/docs/coach_lines.md",
		},
	],
	contextParamFields: [
		{
			key: "voice",
			label: "Coach voice",
			type: "select",
			options: COACH_VOICES.map((v) => ({ value: v, label: COACH_NAMES[v] })),
		},
		{
			key: "situation",
			label: "Situation",
			type: "select",
			options: SITUATIONS.map((s) => ({ value: s, label: label(s) })),
		},
	],
	feedbackTags: [
		"Too long",
		"Off-voice",
		"Mentions the body",
		"Too repetitive",
		"Perfect",
	],
	generateSample: async ({ contextParams, tuningDocText }) => {
		const voice = contextParams.voice ?? COACH_VOICES[0]
		const sit = contextParams.situation ?? "morning"
		const prefix = `${voice}:${sit}:`
		const found = lines().filter((l) => l.id.startsWith(prefix))
		if (found.length === 0) return `No lines for ${voice} in "${sit}".`
		const rules = tuningDocText.trim().split("\n")[0]
		return [
			`${COACH_NAMES[voice as keyof typeof COACH_NAMES] ?? voice} · ${label(sit)} (${found.length} lines)`,
			`Style: ${rules}`,
			"",
			...found.map((l) => `${l.lead} ${l.rest}`),
		].join("\n")
	},
}
