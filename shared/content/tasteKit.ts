// The taste kit (content pipeline, quality v2): what "good" means, written down
// so a model can aim at it. Hand-written exemplars and clichés to refuse, plus
// the owner's own verdicts fed back in (services/content/tasteKit.ts). Pure.

/** Exchanges at the target quality: a concrete detail, a person who is slightly
 * wrong, a flat last line. Used as the fixed part of the kit. */
export const GOLD_BANTER: readonly (readonly string[])[] = [
	["Third time you've wiped that bench.", "It keeps being wet.", "That's you."],
	[
		"Did you hear the treadmill belt this morning?",
		"I thought it was my knees.",
		"It was also your knees.",
	],
	[
		"He's been on that cable machine twenty minutes.",
		"He texts between every set.",
		"Between every rep, I think.",
	],
	[
		"I can hear someone doing laps at MaxOut from here.",
		"That's the pipes.",
		"I'd still rather it was laps.",
	],
	[
		"Quiet today.",
		"Don't say that. Last time a coach walked in.",
		"Fine. It's very busy.",
	],
	[
		"The new screen has the weather on it.",
		"Rain all week.",
		"I'll run like it's sunny.",
	],
	[
		"Fifty percent off at MaxOut.",
		"Off what.",
		"I asked. The sign doesn't say.",
	],
	[
		"That class has held the same squat ten minutes.",
		"It's called a hold.",
		"It's called a mistake.",
	],
]

/** Phrases that mark a line as stock gym talk or AI filler. A line with one is
 * dropped before anyone has to read it. */
export const CLICHES: readonly string[] = [
	"no pain",
	"leg day",
	"beast mode",
	"crushing it",
	"let's go",
	"lets go",
	"fitness journey",
	"your journey",
	"stay hydrated",
	"you got this",
	"keep pushing",
	"push through",
	"feel the burn",
	"sweat it out",
	"gains",
	"the grind",
	"as an ai",
	"remember,",
	"at the end of the day",
	"one rep at a time",
	"every step counts",
	"proud of you",
	"never give up",
	"stronger every day",
]

export function hasCliche(lines: readonly string[]): boolean {
	const text = lines.join(" ").toLowerCase()
	return CLICHES.some((c) => text.includes(c))
}

/** Ways to be specific, offered so the model does not reach for "the gym". */
export const DETAIL_MENU: readonly string[] = [
	"a squeaky treadmill belt",
	"the one fan that points at no one",
	"someone's towel left on a machine",
	"a locker that will not close",
	"the water fountain queue",
	"the playlist nobody chose",
	"a person who stretches for longer than they lift",
	"a laminated sign that is slightly wrong",
	"the clock that is four minutes fast",
	"someone who knows everyone's name and nobody's workout",
	"a protein shake that has been left in the same cup holder all week",
	"the mirror people avoid and the mirror people love",
]

export type Example = { lines: readonly string[]; note?: string }

export type Kit = {
	/** Owner-approved lines of this type (newest first). */
	gold: Example[]
	/** Owner-rejected lines, with the tags they were rejected for. */
	anti: Example[]
}

const fmt = (e: Example): string =>
	e.lines.map((l, i) => `${i % 2 ? "B" : "A"}: ${l}`).join("\n") +
	(e.note ? `\n(why not: ${e.note})` : "")

/** The brief for a batch of banter: aim, craft notes, what the owner liked and
 * refused, one situation, and how many to write. */
export function banterBrief(
	situation: string,
	kit: Kit,
	n: number,
	pick: () => number = Math.random,
): string {
	const gold = [
		...kit.gold.slice(0, 4),
		...GOLD_BANTER.filter(() => true)
			.sort(() => pick() - 0.5)
			.slice(0, 5 - Math.min(4, kit.gold.length))
			.map((lines) => ({ lines })),
	]
	const details = [...DETAIL_MENU].sort(() => pick() - 0.5).slice(0, 3)
	return [
		"Two regulars at a small neighbourhood gym talk for ten seconds. Write the exchanges that people would repeat later.",
		"",
		"What makes one land:",
		"- One oddly specific, physical detail (a thing in the room), never a general remark about exercise.",
		"- Subtext: one person is slightly wrong, avoiding something, or quietly one-upping the other. They do not agree with each other.",
		"- The last line is the flattest line, not a moral. No explaining the joke.",
		"- Short, how people really talk: fragments, understatement. Under 12 words a line, 2 or 3 lines.",
		"",
		"Examples at the quality we want:",
		...gold.map((e) => `${fmt(e)}\n`),
		...(kit.anti.length
			? [
					"Examples we rejected (do not write anything like these):",
					...kit.anti.slice(0, 5).map((e) => `${fmt(e)}\n`),
				]
			: []),
		"Never: exclamation marks, emoji, the words gym or fitness journey, motivational talk, advice, weight or bodies, the same sentence shape twice.",
		`Details you could use if they fit (do not use all): ${details.join("; ")}.`,
		"",
		`Situation: ${situation}`,
		"",
		`Write ${n} different exchanges now, separated by a blank line, each line starting "A:" or "B:". Make them different from each other in shape and in detail.`,
	].join("\n")
}

/** The extra material a judge gets so it scores against the owner's taste. */
export function judgeAnchors(kit: Kit): string {
	const good = kit.gold.slice(0, 3)
	const bad = kit.anti.slice(0, 3)
	const fixed = GOLD_BANTER.slice(0, 3).map((lines) => ({ lines }))
	return [
		"Score against these. Good (should score 80+):",
		...[...good, ...fixed].slice(0, 4).map(fmt),
		...(bad.length
			? ["", "Bad (should score under 40):", ...bad.map(fmt)]
			: []),
		"",
		"A line that is merely fine, generic or could be said about any gym scores under 50.",
	].join("\n")
}
