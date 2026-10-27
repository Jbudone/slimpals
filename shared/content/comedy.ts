// Comedy as structure (content pipeline, writers' room): an exchange is a
// situation or observation, a reasonable follow-up that sets an expectation,
// and a turn that breaks it. The turn comes from a named device, so a batch
// can be steered to differ in mechanism, not only in wording, and a critic can
// check that the turn really breaks the expectation. Pure.

export type Device = {
	key: string
	name: string
	/** One sentence a writer can act on. */
	how: string
	/** A worked example: the observation, the expected reply, the turn. */
	example: { setup: string; expected: string; turn: string }
}

export const DEVICES: readonly Device[] = [
	{
		key: "literal",
		name: "Taken literally",
		how: "One person takes a figure of speech or a vague instruction at face value.",
		example: {
			setup: "Light contact, he said.",
			expected: "That was not light.",
			turn: "I touched him lightly. Twice. Both times he fell down.",
		},
	},
	{
		key: "understate",
		name: "Understatement",
		how: "Something large or alarming gets a tiny, calm reaction.",
		example: {
			setup: "The new treadmill screen just reset itself.",
			expected: "Annoying.",
			turn: "It also reset the person on it. He's in the lobby now.",
		},
	},
	{
		key: "third",
		name: "Rule of three, broken",
		how: "Two ordinary items in a list, then a third that does not belong.",
		example: {
			setup: "Things I check before I lift:",
			expected: "My belt, my wrist straps,",
			turn: "whether Gary's here.",
		},
	},
	{
		key: "misdirect",
		name: "Misdirection",
		how: "The first line points one way; the reply reveals a smaller or odder truth.",
		example: {
			setup: "I can hear someone doing laps at MaxOut from here.",
			expected: "They have a pool, so, yes.",
			turn: "That's the pipes. I'd still rather it was laps.",
		},
	},
	{
		key: "callback",
		name: "Callback to a detail",
		how: "The reply refers to a specific physical thing in the room, as if it were a character.",
		example: {
			setup: "Quiet today.",
			expected: "Enjoy it.",
			turn: "Don't say that. Last time a coach walked in.",
		},
	},
	{
		key: "confident-wrong",
		name: "Confidently wrong",
		how: "One person explains something with total authority and is plainly mistaken; the other lets it stand.",
		example: {
			setup: "That class has held the same squat ten minutes.",
			expected: "It's a hold.",
			turn: "It's called a mistake.",
		},
	},
	{
		key: "register",
		name: "Wrong register",
		how: "Grand or formal language for something trivial, or casual language for something serious.",
		example: {
			setup: "The cooler by the door is new.",
			expected: "It was there in March.",
			turn: "Then it has been quietly serving us for seven months.",
		},
	},
	{
		key: "escalate",
		name: "Small escalation",
		how: "Each line makes the situation a little more specific and a little more absurd, and stops one step early.",
		example: {
			setup: "He's been on that cable machine twenty minutes.",
			expected: "Resting between sets.",
			turn: "He texts between every rep, I think.",
		},
	},
	{
		key: "precise",
		name: "Absurd precision",
		how: "A very exact number, rule or time for something nobody should be counting.",
		example: {
			setup: "The clock in here is four minutes fast.",
			expected: "I've noticed.",
			turn: "I plan my whole evening around the four minutes.",
		},
	},
	{
		key: "self-own",
		name: "Self-undercut",
		how: "A speaker states a plan or boast and then quietly takes it back.",
		example: {
			setup: "I'm feeling lucky today.",
			expected: "It's the pre-workout talking.",
			turn: "Lucky enough for one more set. Possibly half.",
		},
	},
]

export type Plan = {
	device: string
	/** What is noticed or said first. */
	setup: string
	/** The reply a listener would expect. */
	expected: string
	/** What is said instead, and why it breaks the expectation. */
	turn: string
	/** The finished 2 or 3 lines. */
	lines: string[]
}

export function deviceByKey(key: string): Device | undefined {
	return DEVICES.find((d) => d.key === key)
}

/** `n` different devices, in a shuffled order. */
export function pickDevices(
	n: number,
	rand: () => number = Math.random,
): Device[] {
	const pool = [...DEVICES]
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1))
		;[pool[i], pool[j]] = [pool[j] as Device, pool[i] as Device]
	}
	return pool.slice(0, Math.min(n, pool.length))
}

function jsonArray(text: string): unknown[] | null {
	const m = text.match(/\[[\s\S]*\]/)
	if (!m) return null
	try {
		const v = JSON.parse(m[0])
		return Array.isArray(v) ? v : null
	} catch {
		return null
	}
}

const str = (v: unknown, max = 200): string | null =>
	typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null

/** Plans out of a writer's JSON answer; anything malformed is dropped. */
export function parsePlans(text: string): Plan[] {
	const out: Plan[] = []
	for (const raw of jsonArray(text) ?? []) {
		const r = raw as Record<string, unknown>
		const device = str(r.device, 40)
		const setup = str(r.setup)
		const expected = str(r.expected)
		const turn = str(r.turn)
		const lines = Array.isArray(r.lines) ? r.lines.map((l) => str(l, 120)) : []
		if (
			!device ||
			!setup ||
			!expected ||
			!turn ||
			lines.length < 2 ||
			lines.length > 3 ||
			lines.some((l) => l === null)
		)
			continue
		out.push({ device, setup, expected, turn, lines: lines as string[] })
	}
	return out
}

export type Critique = {
	index: number
	/** The turn really breaks the expectation (not telegraphed, not random). */
	turnWorks: boolean
	/** Stock or AI-sounding. */
	generic: boolean
	/** 1 to 5. */
	funny: number
	/** One concrete change that would make it better; empty when it is fine. */
	fix: string
}

/** The critic's JSON answer; entries that do not parse are dropped. */
export function parseCritiques(text: string): Critique[] {
	const out: Critique[] = []
	for (const raw of jsonArray(text) ?? []) {
		const r = raw as Record<string, unknown>
		const index = Number(r.index)
		const funny = Number(r.funny)
		if (!Number.isInteger(index) || !(funny >= 1 && funny <= 5)) continue
		out.push({
			index,
			turnWorks: r.turn_works === true,
			generic: r.generic === true,
			funny: Math.round(funny),
			fix: typeof r.fix === "string" ? r.fix.slice(0, 240) : "",
		})
	}
	return out
}

/** Which plans go on: the critic must say the turn works and it is not generic;
 * the funniest first. Plans the critic skipped are dropped. */
export function shortlist(
	plans: Plan[],
	critiques: Critique[],
): {
	plan: Plan
	critique: Critique
}[] {
	const byIndex = new Map(critiques.map((c) => [c.index, c]))
	return plans
		.map((plan, i) => ({ plan, critique: byIndex.get(i) }))
		.filter(
			(x): x is { plan: Plan; critique: Critique } =>
				x.critique !== undefined && x.critique.funny >= 2,
		)
		.sort((a, b) => b.critique.funny - a.critique.funny)
}
