import { locationFor } from "../../../shared/gym3d/locations.js"
import {
	SPEAKERS,
	STORIES,
	type StoryBeat,
} from "../../../shared/gym3d/story.js"
import type { ContentTuningType } from "./registry.js"

// The story is hand-written (`shared/gym3d/story*.ts`), never AI text at play
// time. This type lets an admin read any chapter of any campaign next to the
// style rules, so the writing can be reviewed and tuned together. The sample
// is the scripted text itself.

const campaigns = Object.keys(STORIES).map(Number)

const chapterOptions = campaigns.flatMap((c) =>
	STORIES[c].map((b) => ({
		value: b.id,
		label: `Campaign ${c} · ${b.title}`,
	})),
)

function find(id: string): { campaign: number; beat: StoryBeat } | null {
	for (const c of campaigns) {
		const beat = STORIES[c].find((b) => b.id === id)
		if (beat) return { campaign: c, beat }
	}
	return null
}

export const storyChaptersType: ContentTuningType = {
	key: "story_chapters",
	label: "Story Chapters",
	subcategories: [
		{
			key: "default",
			label: "Story Style",
			tuningDocPath: "server/services/contentTuning/docs/story_lines.md",
		},
	],
	contextParamFields: [
		{
			key: "chapter",
			label: "Chapter",
			type: "select",
			options: chapterOptions,
		},
	],
	feedbackTags: [
		"Off-voice",
		"Too long",
		"Mentions the body",
		"Too many jokes",
		"Perfect",
	],
	generateSample: async ({ contextParams, tuningDocText }) => {
		const id = contextParams.chapter ?? chapterOptions[0].value
		const hit = find(id)
		if (!hit) return `No chapter "${id}".`
		const { campaign, beat } = hit
		const rules = tuningDocText.trim().split("\n")[0]
		return [
			`${beat.title} · campaign ${campaign} (${locationFor(campaign).name}), gym level ${beat.level}`,
			`Style: ${rules}`,
			`Recap: ${beat.recap}`,
			"",
			...beat.lines.map((l) => {
				const name = SPEAKERS[l.who]?.name
				return name ? `${name}: ${l.text}` : l.text
			}),
		].join("\n")
	},
}
