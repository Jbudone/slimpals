// The writers' room (content pipeline, quality v3): several roles, each its own
// model route, instead of one model asked to be funny once.
//   writer (and an optional second writer from another family) draft
//     exchanges, each built on a named comedy device (shared/content/comedy.ts)
//   critic reads them cold and says whether the turn really breaks the
//     expectation, whether it is generic, how funny it is, and one concrete fix
//   the writer revises the ones worth saving
// The roles are routes in `content_config` (`writer`, `writer2`, `critic`), so
// the owner can put a different, stronger model on each from the Admin card.
import {
	type Critique,
	DEVICES,
	type Device,
	type Plan,
	parseCritiques,
	parsePlans,
	pickDevices,
	shortlist,
} from "../../../shared/content/comedy.js"
import {
	DETAIL_MENU,
	type Example,
	type Kit,
} from "../../../shared/content/tasteKit.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import type { ModelClient } from "./modelClient.js"

export type RoomRoles = {
	/** A second writer is configured (another model family). */
	secondWriter: boolean
}

export type RoomItem = {
	lines: string[]
	device: string
	funny: number
	/** The critic's note on the draft. */
	note: string
	revised: boolean
}

const fmtExample = (e: Example) =>
	e.lines.map((l, i) => `${i % 2 ? "B" : "A"}: ${l}`).join(" / ") +
	(e.note ? `  (rejected: ${e.note})` : "")

const deviceList = (ds: Device[]) =>
	ds
		.map(
			(d) =>
				`- ${d.key} (${d.name}): ${d.how} Example: setup "${d.example.setup}", expected "${d.example.expected}", turn "${d.example.turn}".`,
		)
		.join("\n")

export function writerPrompt(
	situation: string,
	devices: Device[],
	kit: Kit,
	details: string[],
): string {
	return [
		"Two regulars at a small neighbourhood gym talk for ten seconds.",
		`Situation: ${situation}`,
		"",
		"Funny dialogue has three parts: a setup (something noticed or said), the reply a listener would expect, and a turn that says something else that still makes sense of the setup. Write one exchange for each device below, in that order.",
		deviceList(devices),
		"",
		...(kit.gold.length
			? ["Lines the owner liked:", ...kit.gold.slice(0, 4).map(fmtExample), ""]
			: []),
		...(kit.anti.length
			? [
					"Lines the owner rejected (nothing like these):",
					...kit.anti.slice(0, 5).map(fmtExample),
					"",
				]
			: []),
		`Ways to be specific if they fit: ${details.join("; ")}.`,
		"Rules: 2 or 3 lines per exchange, a few words to one short sentence each, no exclamation marks, no emoji, no advice, no motivational talk, nothing about weight or bodies, do not use the word gym. The last line is the flattest line, never a moral.",
		"",
		'Reply with ONLY a JSON array, one object per device: {"device": key, "setup": "...", "expected": "...", "turn": "...", "lines": ["...", "..."]}.',
	].join("\n")
}

export function criticPrompt(situation: string, plans: Plan[]): string {
	return [
		"You are a hard-to-please comedy editor reading short exchanges between two gym regulars. Situation: " +
			situation,
		"For each candidate decide:",
		"- turn_works: does the turn genuinely break the expectation and still make sense? false if it is predictable, random, or explains itself.",
		"- generic: true if it could be said about any gym, sounds like an AI, or is stock gym talk.",
		"- funny: 1 to 5. 3 means fine, nobody would miss it. 4 would be repeated. 5 is rare. Be stingy.",
		"- fix: one concrete change that would make it better (what to cut, what to make more specific, what the last line should do instead). Empty if it needs none.",
		"",
		...plans.map(
			(p, i) =>
				`#${i} [${p.device}] setup: ${p.setup} | expected: ${p.expected} | turn: ${p.turn}\n   ${p.lines.map((l, k) => `${k % 2 ? "B" : "A"}: ${l}`).join(" / ")}`,
		),
		"",
		'Reply with ONLY a JSON array: [{"index": 0, "turn_works": true, "generic": false, "funny": 3, "fix": "..."}].',
	].join("\n")
}

export function revisePrompt(
	items: { plan: Plan; critique: Critique; index: number }[],
): string {
	return [
		"Revise these gym exchanges using the editor's fix. Keep the same device and the same two people; make it more specific and keep the last line the flattest. 2 or 3 lines, no exclamation marks.",
		"",
		...items.map(
			(x) =>
				`#${x.index} [${x.plan.device}] ${x.plan.lines.join(" / ")}\n   fix: ${x.critique.fix}`,
		),
		"",
		'Reply with ONLY a JSON array: [{"index": 0, "device": key, "setup": "...", "expected": "...", "turn": "...", "lines": ["...", "..."]}].',
	].join("\n")
}

/** One situation through the room. Returns the shortlisted exchanges, best
 * first, or an empty list when a stage produced nothing usable (the caller
 * then falls back to a single-shot batch). */
export async function writeBanterWithRoom(
	client: ModelClient,
	situation: string,
	kit: Kit,
	roles: RoomRoles,
	rand: () => number = Math.random,
): Promise<RoomItem[]> {
	let styleDoc = ""
	try {
		styleDoc = readTuningDoc("server/services/contentTuning/docs/npc_banter.md")
	} catch {
		// the prompt carries the rules
	}
	const devices = pickDevices(roles.secondWriter ? 10 : 6, rand)
	const details = [...DETAIL_MENU].sort(() => rand() - 0.5).slice(0, 3)
	const halves = roles.secondWriter
		? [
				{ task: "writer", ds: devices.slice(0, 5) },
				{ task: "writer2", ds: devices.slice(5, 10) },
			]
		: [{ task: "writer", ds: devices }]
	const drafted = await Promise.all(
		halves.map((h) =>
			client
				.generateText({
					task: h.task,
					system: styleDoc,
					prompt: writerPrompt(situation, h.ds, kit, details),
					maxOutputTokens: 1600,
				})
				.then((r) => parsePlans(r.text))
				.catch((err) => {
					// a failed second writer must not sink the first
					if (h.task === "writer") throw err
					return [] as Plan[]
				}),
		),
	)
	const plans = drafted.flat()
	if (plans.length === 0) return []

	const critic = await client.generateText({
		task: "critic",
		prompt: criticPrompt(situation, plans),
		maxOutputTokens: 1400,
	})
	const kept = shortlist(plans, parseCritiques(critic.text))
	if (kept.length === 0) return []

	// revise the ones that are good but not great, once
	const toRevise = kept
		.map((k, i) => ({ ...k, index: i }))
		.filter((k) => k.critique.fix && k.critique.funny <= 4)
	const revisedBy = new Map<number, Plan>()
	if (toRevise.length) {
		try {
			const rev = await client.generateText({
				task: "writer",
				system: styleDoc,
				prompt: revisePrompt(toRevise),
				maxOutputTokens: 1400,
			})
			// revised plans carry the index of the shortlist entry they replace
			const raw = rev.text.match(/\[[\s\S]*\]/)
			const arr = raw ? (JSON.parse(raw[0]) as { index?: number }[]) : []
			const parsed = parsePlans(rev.text)
			const withIndex = arr.filter((a) => typeof a.index === "number")
			parsed.forEach((p, i) => {
				const at = withIndex[i]?.index
				if (typeof at === "number") revisedBy.set(at, p)
			})
		} catch {
			// keep the drafts
		}
	}
	return kept.map((k, i) => {
		const revised = revisedBy.get(i)
		return {
			lines: (revised ?? k.plan).lines,
			device: (revised ?? k.plan).device,
			funny: k.critique.funny,
			note: k.critique.fix,
			revised: revised !== undefined,
		}
	})
}

export { DEVICES }
