// Speech-bubble lines for the 3D gym. Lines come from data the server already
// has (each NPC's cached dialog batch and fired milestone dialogs, cut into
// short sentences) mixed with small built-in lists per NPC and per role. No
// AI calls: nothing here generates text. Pure, so it is unit tested.

export type Rng = () => number

/** Longest line a bubble shows. */
export const MAX_LINE = 90

/** Short bubble lines cut from longer dialog responses: stage directions
 * (`*leans in*`) removed, split into sentences, kept when 8..MAX_LINE
 * characters, first `perResponse` of each response, no duplicates, at most
 * `max` in all. */
export function extractBubbleLines(
	responses: readonly string[],
	perResponse = 2,
	max = 8,
): string[] {
	const out: string[] = []
	const seen = new Set<string>()
	for (const r of responses) {
		if (typeof r !== "string") continue
		const clean = r
			.replace(/\*[^*]*\*/g, " ")
			.replace(/\s+/g, " ")
			.trim()
		const parts = clean.match(/[^.!?]+[.!?]*/g) ?? []
		let n = 0
		for (const p of parts) {
			const s = p.trim().replace(/^["'“”]+|["'“”]+$/g, "")
			if (s.length < 8 || s.length > MAX_LINE) continue
			const k = s.toLowerCase()
			if (seen.has(k)) continue
			seen.add(k)
			out.push(s)
			if (++n >= perResponse || out.length >= max) break
		}
		if (out.length >= max) break
	}
	return out
}

/** Built-in lines by role, for NPCs with nothing else to say and for the
 * anonymous crowd. */
export const ROLE_LINES: Readonly<Record<string, readonly string[]>> = {
	trainer: [
		"Keep that core tight!",
		"Two more, you've got this!",
		"Hydrate between sets.",
	],
	receptionist: [
		"Have a great workout!",
		"Don't forget your towel!",
		"See you tomorrow!",
	],
	specialist: [
		"Recovery is training too.",
		"Listen to your body.",
		"Consistency beats intensity.",
	],
	manager: ["Everything running smoothly?", "Love to see a busy floor."],
	regular: ["Good session today.", "Feeling strong!", "Almost done..."],
	hero: ["What a gym!", "Who wants a selfie?"],
	staff: ["Wiping this down for you.", "Need a spot?", "Lockers are that way."],
	member: [
		"One more rep!",
		"Phew!",
		"New PR!",
		"Is it Friday yet?",
		"Feeling it tomorrow...",
		"Water break.",
	],
	class: ["Let's go!", "Keep up!", "Woo!", "And again!"],
	swimmer: ["Splash!", "Two more laps."],
	worker: ["Almost there!", "Careful, wet paint!"],
}

/** Two NPCs near each other: an opener and a reply. `{name}` is the other
 * person's first name. */
export const PAIR_LINES = {
	friend: {
		open: [
			"Hey {name}!",
			"Looking strong, {name}!",
			"Same time tomorrow, {name}?",
			"{name}! How's it going?",
		],
		reply: ["You too!", "Always!", "See you then!", "Great, thanks!"],
	},
	rival: {
		open: [
			"Oh. It's {name}.",
			"Nice form... for a beginner, {name}.",
			"That's my spot, {name}.",
		],
		reply: ["Whatever.", "Watch and learn.", "Hmph.", "We'll see."],
	},
	neutral: {
		open: ["Hi {name}.", "Busy today, {name}?", "Morning, {name}!"],
		reply: ["Hey!", "Yeah, packed!", "Morning!"],
	},
} as const

export type Relation = keyof typeof PAIR_LINES

/** How two NPCs get on, from either side's personality. */
export function relationOf(
	a: { friends?: readonly string[]; rivals?: readonly string[] } | undefined,
	b: { friends?: readonly string[]; rivals?: readonly string[] } | undefined,
	aKey: string,
	bKey: string,
): Relation {
	if (a?.rivals?.includes(bKey) || b?.rivals?.includes(aKey)) return "rival"
	if (a?.friends?.includes(bKey) || b?.friends?.includes(aKey)) return "friend"
	return "neutral"
}

function pick<X>(a: readonly X[], rng: Rng): X {
	return a[Math.floor(rng() * a.length) % a.length]
}

/** First name for a bubble ("Rex \"The Titan\" Ramirez" -> "Rex"). */
export function firstName(name: string): string {
	if (/^(dr|coach)\.?\s/i.test(name)) return name
	return name.split(/\s+/)[0] ?? name
}

/**
 * One line for a person. Pools, in order of preference: lines from the
 * server's dialog data, the person's own signature lines, then role lines.
 * A pool is chosen by weight (server 0.45, own 0.35, role 0.2 among the
 * non-empty ones), then a line not in `recent` (falls back to any line
 * when all were said recently). Returns null when every pool is empty.
 */
export function pickLine(
	pools: {
		server?: readonly string[]
		own?: readonly string[]
		role?: readonly string[]
	},
	recent: readonly string[],
	rng: Rng,
): string | null {
	const opts: [readonly string[], number][] = []
	if (pools.server?.length) opts.push([pools.server, 0.45])
	if (pools.own?.length) opts.push([pools.own, 0.35])
	if (pools.role?.length) opts.push([pools.role, 0.2])
	if (!opts.length) return null
	const total = opts.reduce((s, o) => s + o[1], 0)
	let r = rng() * total
	let pool = opts[opts.length - 1][0]
	for (const [p, w] of opts) {
		if (r < w) {
			pool = p
			break
		}
		r -= w
	}
	const fresh = pool.filter((l) => !recent.includes(l))
	return pick(fresh.length ? fresh : pool, rng)
}

/** An opener and reply for a pair, with the names filled in. */
export function pairLines(
	rel: Relation,
	otherName: string,
	rng: Rng,
): { open: string; reply: string } {
	const L = PAIR_LINES[rel]
	return {
		open: pick(L.open, rng).replace("{name}", firstName(otherName)),
		reply: pick(L.reply, rng),
	}
}
