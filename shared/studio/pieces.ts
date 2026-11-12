// The Studio's pieces (docs/studio): pure helpers shared by the server and the
// /studio page. A piece is a premise plus a script of "who | text" lines.

export const PIECE_STATUSES = [
	"idea",
	"next",
	"in_progress",
	"paused",
	"done",
] as const
export type PieceStatus = (typeof PIECE_STATUSES)[number]

export const STATUS_LABEL: Record<PieceStatus, string> = {
	idea: "Ideas",
	next: "Next",
	in_progress: "In progress",
	paused: "Paused",
	done: "Done",
}

export const PIECE_KINDS = [
	"bro-hype",
	"dnd",
	"banter",
	"story",
	"other",
] as const
export type PieceKind = (typeof PIECE_KINDS)[number]

export const KIND_LABEL: Record<PieceKind, string> = {
	"bro-hype": "Bro Hype",
	dnd: "Friday D&D",
	banter: "Banter",
	story: "Story",
	other: "Other",
}

export type ScriptLine = { who: string; text: string }

export function isStatus(v: unknown): v is PieceStatus {
	return (
		typeof v === "string" && (PIECE_STATUSES as readonly string[]).includes(v)
	)
}
export function isKind(v: unknown): v is PieceKind {
	return typeof v === "string" && (PIECE_KINDS as readonly string[]).includes(v)
}

/** "who | text" per line; blank lines are skipped, a line with no bar belongs to the narrator. */
export function parseScript(text: string): ScriptLine[] {
	const out: ScriptLine[] = []
	for (const raw of text.split("\n")) {
		const line = raw.trim()
		if (!line || line.startsWith("```")) continue
		const bar = line.indexOf("|")
		if (bar < 0) {
			out.push({ who: "narrator", text: line })
			continue
		}
		const who = line.slice(0, bar).trim().toLowerCase()
		const body = line.slice(bar + 1).trim()
		if (who && body) out.push({ who, text: body })
	}
	return out
}

export function formatScript(lines: ScriptLine[]): string {
	return lines.map((l) => `${l.who} | ${l.text}`).join("\n")
}

/** The cast of a script, in order of first appearance, narrator left out. */
export function castOf(lines: ScriptLine[]): string[] {
	const seen: string[] = []
	for (const l of lines)
		if (l.who !== "narrator" && !seen.includes(l.who)) seen.push(l.who)
	return seen
}

/** The next dates (UTC, ISO yyyy-mm-dd) of a weekly slot, `count` of them from `from`. 0 = Sunday. */
export function nextSlotDates(
	weekday: number,
	from: Date,
	count: number,
): string[] {
	const d = new Date(
		Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
	)
	d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7))
	const out: string[] = []
	for (let i = 0; i < count; i++) {
		out.push(d.toISOString().slice(0, 10))
		d.setUTCDate(d.getUTCDate() + 7)
	}
	return out
}

/** The standing slots: Friday D&D and Sunday Bro Hype. */
export const STUDIO_SLOTS = [
	{ kind: "dnd" as PieceKind, label: "Friday D&D", weekday: 5 },
	{ kind: "bro-hype" as PieceKind, label: "Sunday Bro Hype", weekday: 0 },
]
