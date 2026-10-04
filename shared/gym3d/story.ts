// The authored story (#188, first slice): short cutscene beats that open as
// the gym levels up, a few days apart, in a fixed order. Hand-written like the
// banter. Pure: `storyState` says which beat is waiting and what has been seen.
// Tone: dry and supportive, nothing about bodies, no exclamation marks. See
// docs/story_bible.md for the plan the beats follow.

export type Speaker = { name: string; color: string }

/** Everyone who speaks (NPC keys where the person is on the roster). */
export const SPEAKERS: Readonly<Record<string, Speaker>> = {
	lisa: { name: "Lisa", color: "#3aa89a" },
	marcus: { name: "Marcus", color: "#9a633f" },
	alex: { name: "Alex", color: "#5a6b8a" },
	kim: { name: "Dr. Kim", color: "#62b83f" },
	rivera: { name: "Coach Rivera", color: "#c85a3c" },
	derek: { name: "Derek", color: "#8a6bb5" },
	victor: { name: "Victor Maxwell", color: "#2b3440" },
	barry: { name: "Barry Baron", color: "#d4463a" },
	narrator: { name: "", color: "#6b5d4f" },
}

export type StoryLine = { who: keyof typeof SPEAKERS; text: string }

export type StoryBeat = {
	id: string
	act: number
	/** The gym level that opens it. */
	level: number
	title: string
	/** One line for the "Story so far" list. */
	recap: string
	lines: readonly StoryLine[]
}

/** Hours that must pass after one beat before the next can open. */
export const MIN_BEAT_GAP_HOURS = 16

export const STORY: readonly StoryBeat[] = [
	{
		id: "a1-opening",
		act: 1,
		level: 1,
		title: "Opening day",
		recap:
			"Slim Pals opens on a quiet street. The shop across the road is papered over.",
		lines: [
			{
				who: "lisa",
				text: "Welcome to Slim Pals. The front door sticks a little. Lift and turn.",
			},
			{
				who: "marcus",
				text: "Quiet street. Quiet gym. We can work with quiet.",
			},
			{
				who: "lisa",
				text: "The shop across the road has paper in the windows. No sign yet.",
			},
		],
	},
	{
		id: "a1-coat",
		act: 1,
		level: 2,
		title: "A very good coat",
		recap:
			"Victor Maxwell visits and announces he is opening MaxOut across the road.",
		lines: [
			{
				who: "victor",
				text: "Charming little place. Is the equipment original, or just loved?",
			},
			{ who: "lisa", text: "Both. Can I help you?" },
			{
				who: "victor",
				text: "Victor Maxwell. I'm opening across the road. We should be friends.",
			},
			{ who: "marcus", text: "Maxwell." },
			{ who: "lisa", text: "You know him?" },
			{ who: "marcus", text: "I know the name." },
		],
	},
	{
		id: "a1-samples",
		act: 1,
		level: 3,
		title: "Free samples",
		recap:
			"Barry Baron sets up a free burger stand on the pavement. Derek is only looking.",
		lines: [
			{
				who: "barry",
				text: "Free samples. Free. I said it twice, that's how free it is.",
			},
			{
				who: "kim",
				text: "That is a great deal of cheese standing on a pavement.",
			},
			{ who: "derek", text: "I was only looking at it. For research." },
		],
	},
	{
		id: "a1-sign",
		act: 1,
		level: 4,
		title: "The new sign",
		recap: "The MaxOut sign goes up. Marcus cannot stop looking at it.",
		lines: [
			{ who: "rivera", text: "You keep looking at that sign, Marcus." },
			{ who: "marcus", text: "It says MaxOut. I used to say it differently." },
			{
				who: "lisa",
				text: "Ask him later. After coffee. It is always after coffee.",
			},
		],
	},
	{
		id: "a1-offer",
		act: 1,
		level: 5,
		title: "The offer",
		recap:
			"Victor offers to buy the gym. Alex says no, on behalf of the treadmills too.",
		lines: [
			{
				who: "victor",
				text: "A fair offer for the building, the name and the charming old treadmills.",
			},
			{
				who: "alex",
				text: "Thank you, Mr Maxwell. The answer is no. The treadmills asked me to say so too.",
			},
			{
				who: "victor",
				text: "Everyone has a number. I'll leave mine under the door.",
			},
		],
	},
	{
		id: "a1-friend",
		act: 1,
		level: 6,
		title: "A friend of a friend",
		recap: "Barry asks the juice bar for a green one, for an imaginary friend.",
		lines: [
			{
				who: "barry",
				text: "Quick question. Does the juice bar do a green one? For a friend.",
			},
			{ who: "kim", text: "Of course. Is the friend you?" },
			{ who: "barry", text: "The friend is my accountant. Also me." },
			{
				who: "barry",
				text: "MaxOut has a pool. I have a fryer. We both have problems.",
			},
		],
	},
	{
		id: "a1-notebook",
		act: 1,
		level: 7,
		title: "The notebook",
		recap:
			"Marcus was MaxOut's first trainer. They put his programme on the wall under someone else's name.",
		lines: [
			{
				who: "marcus",
				text: "I was MaxOut's first trainer. I wrote their first programme in a notebook.",
			},
			{ who: "rivera", text: "And?" },
			{
				who: "marcus",
				text: "They printed it on the wall. Under someone else's name.",
			},
			{
				who: "lisa",
				text: "That notebook is in my drawer, by the way. Just so everyone knows.",
			},
		],
	},
	{
		id: "a1-lease",
		act: 1,
		level: 8,
		title: "Fine print",
		recap:
			"Barry's lease is quietly for sale. The buyer's name starts with a V.",
		lines: [
			{
				who: "lisa",
				text: "Alex. Barry Baron's lease has a clause. He is selling, quietly.",
			},
			{ who: "alex", text: "Selling to whom?" },
			{ who: "lisa", text: "The name is smudged. It starts with a V." },
			{
				who: "narrator",
				text: "End of act one. Act two begins when the gym has grown a little more.",
			},
		],
	},
]

export type StoryDto = {
	/** The chapter waiting to be shown, if any. */
	pending: StoryBeat | null
	/** Chapters seen, in story order. */
	log: { id: string; act: number; title: string; recap: string }[]
	/** The gym level that opens the next chapter (null at the end). */
	nextLevel: number | null
}

export type StorySeen = { id: string; at: Date }

export type StoryState = {
	/** The beat waiting to be shown, if any. */
	pending: StoryBeat | null
	/** Beats already seen, in story order. */
	log: StoryBeat[]
	/** The gym level that opens the next beat (null at the end of the story). */
	nextLevel: number | null
}

/** Which beat is waiting: the first unseen one in order, once the gym is at
 * its level and enough time has passed since the last beat. */
export function storyState(
	level: number,
	seen: readonly StorySeen[],
	now: Date,
): StoryState {
	const seenIds = new Set(seen.map((s) => s.id))
	const log = STORY.filter((b) => seenIds.has(b.id))
	const next = STORY.find((b) => !seenIds.has(b.id)) ?? null
	if (!next) return { pending: null, log, nextLevel: null }
	const last = seen.reduce<Date | null>(
		(m, s) => (!m || s.at > m ? s.at : m),
		null,
	)
	const gapOk =
		!last || now.getTime() - last.getTime() >= MIN_BEAT_GAP_HOURS * 3_600_000
	const ready = level >= next.level && gapOk
	return {
		pending: ready ? next : null,
		log,
		nextLevel: next.level,
	}
}
