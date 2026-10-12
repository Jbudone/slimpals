import { ROOM_ARCS } from "../../../shared/gym3d/staffRoom.js"
import { SPEAKERS } from "../../../shared/gym3d/story.js"
import type { ContentTuningType } from "./registry.js"

// The staff room stories are hand-written (`shared/gym3d/staffRoom.ts`), never
// AI text at play time. This type lets an admin read any episode next to the
// style rules. The sample is the scripted text itself.

const episodeOptions = ROOM_ARCS.flatMap((a) =>
	a.episodes.map((e, i) => ({
		value: `${a.id}.${i + 1}`,
		label: `${a.title} · ${i + 1}. ${e.title}`,
	})),
)

export const staffRoomType: ContentTuningType = {
	key: "staff_room",
	label: "Staff Room",
	subcategories: [
		{
			key: "default",
			label: "Staff Room Style",
			tuningDocPath: "server/services/contentTuning/docs/staff_room.md",
		},
	],
	contextParamFields: [
		{
			key: "episode",
			label: "Episode",
			type: "select",
			options: episodeOptions,
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
		const id = contextParams.episode ?? episodeOptions[0].value
		const [arcId, n] = id.split(".")
		const arc = ROOM_ARCS.find((a) => a.id === arcId)
		const ep = arc?.episodes[Number(n) - 1]
		if (!arc || !ep) return `No episode "${id}".`
		const rules = tuningDocText.trim().split("\n")[0]
		return [
			`${ep.title} · ${arc.title}, episode ${n} of 3 (needs ${arc.minHires} coaches)`,
			`Style: ${rules}`,
			"",
			...ep.lines.map((l) => `${SPEAKERS[l.who]?.name ?? l.who}: ${l.text}`),
		].join("\n")
	},
}
