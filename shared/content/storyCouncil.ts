// The story council (docs/story_council.md): types, prompts, parsers and
// validators for the three levels (arc, outline, scene). Pure; the stages that
// call models and keep drafts are in services/content/storyCouncil.ts.
import { SPEAKERS } from "../gym3d/story.js"

export type ArcChapter = {
	n: number
	/** The gym level that opens it. */
	level: number
	title: string
	logline: string
	/** What changes by the end of the chapter. */
	turn: string
}

export type Arc = {
	title: string
	premise: string
	/** What is lost if the player's gym fails to matter. */
	stakes: string
	threads: string[]
	chapters: ArcChapter[]
}

export type Outline = {
	id: string
	title: string
	place: string
	/** A physical thing in the scene. */
	object: string
	goal: string
	conflict: string
	turn: string
	emotion: string
	/** Who is in it and what each wants, by speaker key. */
	wants: { who: string; want: string }[]
	ending: string
}

export type SceneLine = { who: string; text: string }

export type Scene = {
	id: string
	title: string
	recap: string
	lines: SceneLine[]
}

const BODY_TALK = /weight|\bfat\b|lazy|skinny|diet|belly|calorie|\bscale\b/i

function jsonOf(text: string): unknown {
	const m = text.match(/[[{][\s\S]*[\]}]/)
	if (!m) return null
	try {
		return JSON.parse(m[0])
	} catch {
		return null
	}
}

const str = (v: unknown, max = 400): string | null =>
	typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null

/** One arc, or null when it is not usable (6 to 12 chapters, rising levels). */
export function validateArc(raw: unknown): Arc | null {
	const r = raw as Record<string, unknown> | null
	if (!r || typeof r !== "object") return null
	const title = str(r.title, 80)
	const premise = str(r.premise, 600)
	const stakes = str(r.stakes, 400)
	const threads = Array.isArray(r.threads)
		? r.threads.map((t) => str(t, 120)).filter((t): t is string => t !== null)
		: []
	const chapters = Array.isArray(r.chapters) ? r.chapters : []
	if (!title || !premise || !stakes || threads.length < 1) return null
	if (chapters.length < 6 || chapters.length > 12) return null
	const out: ArcChapter[] = []
	let last = 0
	for (const [i, c] of chapters.entries()) {
		const x = c as Record<string, unknown>
		const level = Number(x.level)
		const t = str(x.title, 80)
		const logline = str(x.logline, 300)
		const turn = str(x.turn, 300)
		if (!t || !logline || !turn || !Number.isInteger(level) || level < last)
			return null
		last = level
		out.push({ n: i + 1, level, title: t, logline, turn })
	}
	return { title, premise, stakes, threads, chapters: out }
}

export function parseArcs(text: string): Arc[] {
	const v = jsonOf(text)
	const list = Array.isArray(v) ? v : v ? [v] : []
	return list.map(validateArc).filter((a): a is Arc => a !== null)
}

export function validateOutline(raw: unknown, id: string): Outline | null {
	const r = raw as Record<string, unknown> | null
	if (!r || typeof r !== "object") return null
	const title = str(r.title, 80)
	const place = str(r.place, 160)
	const object = str(r.object, 160)
	const goal = str(r.goal, 300)
	const conflict = str(r.conflict, 300)
	const turn = str(r.turn, 300)
	const emotion = str(r.emotion, 200)
	const ending = str(r.ending, 300)
	const wants = Array.isArray(r.wants)
		? r.wants.flatMap((w) => {
				const x = w as Record<string, unknown>
				const who = str(x.who, 24)
				const want = str(x.want, 200)
				return who && who in SPEAKERS && want ? [{ who, want }] : []
			})
		: []
	if (
		!title ||
		!place ||
		!object ||
		!goal ||
		!conflict ||
		!turn ||
		!emotion ||
		!ending ||
		wants.length < 2
	)
		return null
	return {
		id,
		title,
		place,
		object,
		goal,
		conflict,
		turn,
		emotion,
		wants,
		ending,
	}
}

/** Outlines keyed by the chapter ids they answer; anything unusable is dropped. */
export function parseOutlines(text: string, ids: string[]): Outline[] {
	const v = jsonOf(text)
	const list = Array.isArray(v) ? v : []
	const out: Outline[] = []
	for (const [i, raw] of list.entries()) {
		const id = ids[i]
		if (!id) break
		const o = validateOutline(raw, id)
		if (o) out.push(o)
	}
	return out
}

/** The house rules a scene must follow before the owner ever sees it. */
export function validateScene(raw: unknown, id: string): Scene | null {
	const r = raw as Record<string, unknown> | null
	if (!r || typeof r !== "object") return null
	const title = str(r.title, 80)
	const recap = str(r.recap, 240)
	const lines = Array.isArray(r.lines) ? r.lines : []
	if (!title || !recap || lines.length < 3 || lines.length > 6) return null
	const out: SceneLine[] = []
	for (const l of lines) {
		const x = l as Record<string, unknown>
		const who = typeof x.who === "string" ? x.who : ""
		const text = str(x.text, 100)
		if (!(who in SPEAKERS) || !text) return null
		if (text.includes("!") || BODY_TALK.test(text)) return null
		out.push({ who, text })
	}
	// a scene needs at least two voices, a narrator counts as one
	if (new Set(out.map((l) => l.who)).size < 2) return null
	return { id, title, recap, lines: out }
}

export function parseScene(text: string, id: string): Scene | null {
	const v = jsonOf(text)
	return validateScene(Array.isArray(v) ? v[0] : v, id)
}

// ── prompts ────────────────────────────────────────────────────────────────

const CAST = Object.entries(SPEAKERS)
	.filter(([k]) => k !== "narrator")
	.map(([k, s]) => `${k} (${s.name})`)
	.join(", ")

export function arcPrompt(
	bible: string,
	campaign: number,
	chapters: number,
	ownerNotes?: string,
): string {
	return [
		"You are the showrunner of a small, warm, dry comic drama set around a neighbourhood gym that the player owns and grows. Levels are earned by daily habits; each gym level opens one short cutscene chapter.",
		"",
		"Series bible and cast:",
		bible,
		"",
		`Design campaign ${campaign}: a new arc of ${chapters} chapters. Propose THREE different options. Each must have real stakes for the characters (not just for a sign or a lease), a thread that pays off, and chapters that change something. No two chapters may repeat the same shape (a discovery, then a quip).`,
		...(ownerNotes
			? ["", `The owner's notes, which win over everything: ${ownerNotes}`]
			: []),
		"",
		'Reply with ONLY a JSON array of three objects: {"title","premise","stakes","threads":["..."],"chapters":[{"level":1,"title","logline","turn"}]}. Levels start at 1 and never go down.',
	].join("\n")
}

export function readerPrompt(arcs: Arc[]): string {
	return [
		"You are a story editor reading three arc options cold. For each: where would a player get bored, what is cliché or repeated, are the stakes real, does every chapter change something? Then choose the best and give one concrete fix.",
		"",
		...arcs.map(
			(a, i) =>
				`#${i} ${a.title}: ${a.premise}\nStakes: ${a.stakes}\n${a.chapters.map((c) => `${c.n}. ${c.title}: ${c.logline} -> ${c.turn}`).join("\n")}`,
		),
		"",
		'Reply with ONLY JSON: {"best": 0, "fix": "...", "notes": [{"index": 0, "bored": "...", "cliche": "...", "stakes": 1}]} where stakes is 1 to 5.',
	].join("\n")
}

export function arcRevisePrompt(arc: Arc, fix: string): string {
	return [
		"Revise this arc applying the editor's fix. Keep the number of chapters. Keep what works.",
		`Fix: ${fix}`,
		JSON.stringify(arc),
		"Reply with ONLY the revised arc as one JSON object with the same shape.",
	].join("\n")
}

export function outlinePrompt(
	craft: string,
	arc: Arc,
	ownerNotes?: string,
): string {
	return [
		"You are the showrunner turning an approved arc into scene outlines, one per chapter.",
		"",
		"Craft rules:",
		craft,
		"",
		`Arc: ${arc.title}. ${arc.premise} Stakes: ${arc.stakes}`,
		...arc.chapters.map(
			(c) =>
				`${c.n}. [level ${c.level}] ${c.title}: ${c.logline} Turn: ${c.turn}`,
		),
		"",
		`Speaker keys you may use: ${CAST}.`,
		"For each chapter give: title, place (where exactly), object (one physical thing in the scene), goal (what the scene's main person wants right now), conflict (what is in the way), turn (what changes), emotion (the feeling it should leave), wants (each person in the scene and what they want, 2 to 4 people), ending (how it ends: a gesture or a flat line, not a riddle).",
		...(ownerNotes ? ["", `The owner's notes, which win: ${ownerNotes}`] : []),
		"",
		'Reply with ONLY a JSON array in chapter order: [{"title","place","object","goal","conflict","turn","emotion","wants":[{"who":"key","want":"..."}],"ending"}].',
	].join("\n")
}

export function advocatePrompt(outlines: Outline[]): string {
	return [
		"You speak for the characters. Read these scene outlines. For each, say: does every person in it want something different? do two of them sound alike? is anyone just there to quip? Give one concrete fix per outline that needs it.",
		"",
		...outlines.map(
			(o, i) =>
				`#${i} ${o.title} (${o.place}, with ${o.object}). Goal: ${o.goal} Conflict: ${o.conflict} Turn: ${o.turn}\nWants: ${o.wants.map((w) => `${w.who}: ${w.want}`).join("; ")}`,
		),
		"",
		'Reply with ONLY a JSON array: [{"index": 0, "ok": true, "fix": ""}].',
	].join("\n")
}

export function scenePrompt(
	craft: string,
	arc: Arc,
	outline: Outline,
	chapter: ArcChapter,
	devices: string,
	ownerNotes?: string,
): string {
	return [
		"Write one cutscene chapter as dialogue, following the approved outline exactly.",
		"",
		"Craft rules:",
		craft,
		"",
		`Arc: ${arc.title}. Chapter ${chapter.n}: ${chapter.title}. ${chapter.logline}`,
		`Place: ${outline.place}. A physical thing in the scene: ${outline.object}.`,
		`Goal: ${outline.goal} Conflict: ${outline.conflict} Turn: ${outline.turn} Feeling: ${outline.emotion}.`,
		`Who wants what: ${outline.wants.map((w) => `${w.who}: ${w.want}`).join("; ")}.`,
		`Ending: ${outline.ending}`,
		"",
		"Where a laugh fits, use one of these devices (setup, the reply a listener expects, a turn that says something else that still makes sense):",
		devices,
		"",
		`Speaker keys: ${CAST}, narrator. The narrator stages the scene in one short concrete line.`,
		"3 to 6 lines, each under 100 characters, no exclamation marks, nothing about bodies, no stage directions in the text, people do not introduce themselves by name and job.",
		...(ownerNotes ? ["", `The owner's notes, which win: ${ownerNotes}`] : []),
		"",
		'Reply with ONLY one JSON object: {"title","recap":"one line for the story log","lines":[{"who":"key","text":"..."}]}.',
	].join("\n")
}

export function sceneCriticPrompt(scene: Scene, outline: Outline): string {
	return [
		"You are a hard-to-please script editor reading a short scene cold. Judge it against its outline.",
		`Outline: goal ${outline.goal}; conflict ${outline.conflict}; turn ${outline.turn}; feeling ${outline.emotion}; ending ${outline.ending}.`,
		"",
		scene.lines.map((l) => `${l.who}: ${l.text}`).join("\n"),
		"",
		"Check: does everyone sound different? is anyone only quipping? does anyone explain the plot or introduce themselves? does it hit the turn and the feeling? is the last line earned rather than a riddle? Score 1 to 5 (3 is fine, 5 is rare) and give one concrete fix.",
		'Reply with ONLY JSON: {"score": 3, "fix": "..."}.',
	].join("\n")
}

export function sceneRevisePrompt(scene: Scene, fix: string): string {
	return [
		"Revise this scene applying the editor's fix. Keep the same speakers and the same turn. Same JSON shape, same rules (3 to 6 lines, under 100 characters, no exclamation marks).",
		`Fix: ${fix}`,
		JSON.stringify({
			title: scene.title,
			recap: scene.recap,
			lines: scene.lines,
		}),
		"Reply with ONLY the revised JSON object.",
	].join("\n")
}

export function parseReaderVerdict(
	text: string,
): { best: number; fix: string } | null {
	const v = jsonOf(text) as { best?: unknown; fix?: unknown } | null
	if (!v || !Number.isInteger(v.best)) return null
	return { best: v.best as number, fix: typeof v.fix === "string" ? v.fix : "" }
}

export function parseAdvocate(
	text: string,
): { index: number; ok: boolean; fix: string }[] {
	const v = jsonOf(text)
	return (Array.isArray(v) ? v : []).flatMap((x) => {
		const r = x as { index?: unknown; ok?: unknown; fix?: unknown }
		return Number.isInteger(r.index)
			? [
					{
						index: r.index as number,
						ok: r.ok === true,
						fix: typeof r.fix === "string" ? r.fix : "",
					},
				]
			: []
	})
}

export function parseSceneVerdict(
	text: string,
): { score: number; fix: string } | null {
	const v = jsonOf(text) as { score?: unknown; fix?: unknown } | null
	const score = Number(v?.score)
	return v && score >= 1 && score <= 5
		? { score, fix: typeof v.fix === "string" ? v.fix : "" }
		: null
}
