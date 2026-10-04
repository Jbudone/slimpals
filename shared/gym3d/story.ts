// The authored story (#188, first slice): short cutscene beats that open as
// the gym levels up, a few days apart, in a fixed order. Hand-written like the
// banter. Pure: `storyState` says which beat is waiting and what has been seen.
// Tone: dry and supportive, nothing about bodies, no exclamation marks. See
// docs/story_bible.md for the plan the beats follow.

import type { OpenResult, OpenState } from "./open.js"
import { STORY_ALUMNI } from "./storyAlumni.js"
import { STORY_CAMPUS } from "./storyCampus.js"
import { STORY_EXAMS } from "./storyExams.js"
import { STORY_HARBOUR } from "./storyHarbour.js"
import { STORY_LIGHTHOUSE } from "./storyLighthouse.js"
import { STORY_NIGHT } from "./storyNight.js"
import { STORY_REUNION } from "./storyReunion.js"
import { STORY_TIDES } from "./storyTides.js"

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
	dana: { name: "Dana Voss", color: "#2a8f8f" },
	barry: { name: "Barry Baron", color: "#d4463a" },
	quill: { name: "Prof. Quill", color: "#6b4a8a" },
	tess: { name: "Tess", color: "#d98a3a" },
	reyes: { name: "Captain Reyes", color: "#2f5f8f" },
	joe: { name: "Old Joe", color: "#8f7a3a" },
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
	/** Waits for the Pavement Street Open: its result (win or lose, the other
	 * one is skipped) or just that it has ended. */
	needs?: "open-win" | "open-lose" | "open-ended"
	/** Paid once when the chapter is seen. */
	reward?: { coins: number }
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
	{
		id: "a2-sale",
		act: 2,
		level: 9,
		title: "Downsizing",
		recap:
			"Barry puts the Baron up for sale and admits someone made him an offer.",
		lines: [
			{
				who: "barry",
				text: "I'm downsizing. That's the word on the sign. The word in my stomach is different.",
			},
			{ who: "kim", text: "You are selling the Baron?" },
			{ who: "barry", text: "Someone made me an offer I can't pronounce." },
			{ who: "alex", text: "Pronounce it slowly. We have time." },
		],
	},
	{
		id: "a2-promo",
		act: 2,
		level: 10,
		title: "Half price",
		recap:
			"MaxOut runs a weekend promo. Marcus spots his programme on the flyer.",
		lines: [
			{
				who: "derek",
				text: "MaxOut has half price this weekend. I'm only mentioning it.",
			},
			{
				who: "marcus",
				text: "That is my warm-up on their flyer. Step for step.",
			},
			{
				who: "lisa",
				text: "The notebook is still in my drawer, Marcus. Dated and everything.",
			},
		],
	},
	{
		id: "a2-rival",
		act: 2,
		level: 11,
		title: "Old rivals",
		recap:
			"Dana Voss, MaxOut's head coach, turns out to be Coach Rivera's old rival.",
		lines: [
			{ who: "dana", text: "Nice place. You have done well with very little." },
			{ who: "rivera", text: "Dana." },
			{ who: "dana", text: "Marian. Still counting your reps out loud." },
			{ who: "rivera", text: "Somebody has to count them honestly." },
		],
	},
	{
		id: "a2-fries",
		act: 2,
		level: 12,
		title: "Research",
		recap:
			"Dr. Kim is caught with the Baron's large fries. She calls it research.",
		lines: [
			{ who: "barry", text: "Dr. Kim, your usual. Large fries, extra salt." },
			{ who: "kim", text: "That is research." },
			{ who: "derek", text: "That is my line." },
			{ who: "kim", text: "You may have it back when you have a doctorate." },
		],
	},
	{
		id: "a2-school",
		act: 2,
		level: 13,
		title: "Class of 99",
		recap:
			"A photo shows Victor and Barry were on the same debating team at school.",
		lines: [
			{
				who: "lisa",
				text: "Found this in the lease folder. Maxwell and Baron. Debate club.",
			},
			{ who: "alex", text: "They were on the same team." },
			{
				who: "barry",
				text: "He always spoke second. He always had the last word.",
			},
			{
				who: "victor",
				text: "And you always left the room before I'd finished.",
			},
		],
	},
	{
		id: "a2-deal",
		act: 2,
		level: 14,
		title: "The deal",
		recap:
			"Victor offers to buy Barry's building in front of everyone. Barry says not yet.",
		lines: [
			{
				who: "victor",
				text: "Barry. Twice what it is worth. Sign today and keep the fryer.",
			},
			{ who: "barry", text: "Not yet." },
			{
				who: "alex",
				text: "If anyone buys that building, it should be someone who keeps the street as it is.",
			},
			{
				who: "lisa",
				text: "Or someone who makes the sign smaller, and a lot friendlier.",
			},
		],
	},
	{
		id: "a2-wall",
		act: 2,
		level: 15,
		title: "The wall",
		recap:
			"Marcus takes his notebook to MaxOut. Victor never saw the wall before opening day.",
		lines: [
			{
				who: "marcus",
				text: "I brought the notebook. Page one is on your wall, word for word.",
			},
			{
				who: "victor",
				text: "I never saw that wall until opening day. Dana had it printed.",
			},
			{ who: "dana", text: "Standard procedure. Nobody told me whose it was." },
			{
				who: "marcus",
				text: "Now you know. Put my name under it, or take it down.",
			},
		],
	},
	{
		id: "a2-poster",
		act: 2,
		level: 16,
		title: "The poster",
		recap:
			"A poster announces the Pavement Street Open: MaxOut against Slim Pals, winner keeps the better sign.",
		lines: [
			{
				who: "lisa",
				text: "There is a poster on every lamp post. The Pavement Street Open.",
			},
			{
				who: "alex",
				text: "MaxOut against Slim Pals. Winner keeps the better sign.",
			},
			{ who: "marcus", text: "We could use a better sign." },
			{
				who: "narrator",
				text: "End of act two. The street is about to be settled in public.",
			},
		],
	},
	{
		id: "a3-start",
		act: 3,
		level: 17,
		title: "Seven days",
		recap:
			"The Pavement Street Open begins: seven days, and the gym with the most XP earned takes the better sign.",
		lines: [
			{
				who: "lisa",
				text: "The Open starts now. Seven days. Most XP earned takes the better sign.",
			},
			{
				who: "dana",
				text: "We have a pool. You have a notebook. Let's see which one wins.",
			},
			{ who: "marcus", text: "Page one is mine. I'll take that bet." },
			{ who: "victor", text: "May the better gym win. Mine, obviously." },
			{ who: "narrator", text: "Seven days. Everything the gym earns counts." },
		],
	},
	{
		id: "a3-win",
		act: 3,
		level: 17,
		needs: "open-win",
		reward: { coins: 1500 },
		title: "The better sign",
		recap: "Slim Pals won the Open and took the better sign.",
		lines: [
			{ who: "dana", text: "Final numbers are in. You beat us." },
			{
				who: "victor",
				text: "Statistically it was close. Emotionally it was not.",
			},
			{
				who: "barry",
				text: "I made a banner. It says congratulations, in ketchup.",
			},
			{
				who: "lisa",
				text: "The sign is ours. We will hang it crooked, for charm.",
			},
		],
	},
	{
		id: "a3-lose",
		act: 3,
		level: 17,
		needs: "open-lose",
		reward: { coins: 400 },
		title: "A narrow thing",
		recap:
			"MaxOut took the Open by a little. Slim Pals will earn the sign back.",
		lines: [
			{
				who: "dana",
				text: "We took it. Narrowly. Your last day was honest, I'll say that.",
			},
			{
				who: "victor",
				text: "The better sign is ours. The better notebook is yours.",
			},
			{ who: "marcus", text: "Next time. I have a better programme." },
			{
				who: "lisa",
				text: "We will earn it back. Somebody put the kettle on.",
			},
		],
	},
	{
		id: "a3-finale",
		act: 3,
		level: 17,
		needs: "open-ended",
		title: "The whole street",
		recap:
			"Barry keeps the Baron going, smaller and with a salad. Victor takes the salad.",
		lines: [
			{
				who: "barry",
				text: "I've decided. The Baron stays a burger place. A smaller one, with a salad.",
			},
			{ who: "victor", text: "A salad. You." },
			{
				who: "barry",
				text: "Debate club taught me to compromise. At the end.",
			},
			{ who: "victor", text: "I'll take the salad." },
			{ who: "alex", text: "Welcome to Pavement Street. All of it." },
			{
				who: "narrator",
				text: "That is the first story. The street keeps going, and so does the gym.",
			},
		],
	},
]

/** Each campaign's authored story (campaigns without one have none yet). */
export const STORIES: Readonly<Record<number, readonly StoryBeat[]>> = {
	1: STORY,
	2: STORY_CAMPUS,
	3: STORY_HARBOUR,
	4: STORY_REUNION,
	5: STORY_ALUMNI,
	6: STORY_TIDES,
	7: STORY_NIGHT,
	8: STORY_EXAMS,
	9: STORY_LIGHTHOUSE,
}

export function storyFor(campaign: number): readonly StoryBeat[] {
	return STORIES[campaign] ?? []
}

/** The chapter that finishes a campaign's story (null: it has no story). */
export function storyFinaleOf(campaign: number): string | null {
	const beats = storyFor(campaign)
	return beats.length ? beats[beats.length - 1].id : null
}

export type StoryDto = {
	/** The chapter waiting to be shown, if any. */
	pending: StoryBeat | null
	/** Chapters seen, in story order. */
	log: {
		id: string
		act: number
		title: string
		recap: string
		/** When the chapter was seen (ISO). */
		seenAt: string
	}[]
	/** The gym level that opens the next chapter (null at the end). */
	nextLevel: number | null
	/** The next chapter waits for the Open to end, not for a level. */
	waitingForOpen: boolean
	/** The Pavement Street Open, once it has started. */
	open: OpenState | null
}

export type StorySeen = { id: string; at: Date }

export type StoryState = {
	/** The beat waiting to be shown, if any. */
	pending: StoryBeat | null
	/** Beats already seen, in story order. */
	log: StoryBeat[]
	/** The gym level that opens the next beat (null at the end of the story). */
	nextLevel: number | null
	/** The next beat waits for the Open to end. */
	waitingForOpen: boolean
}

/** The beat the other result skips (win or lose chapter that does not apply). */
const skipped = (b: StoryBeat, open: OpenResult | null): boolean =>
	(b.needs === "open-win" && open === "lose") ||
	(b.needs === "open-lose" && open === "win")

/** Which beat is waiting: the first unseen one in order, once the gym is at
 * its level, enough time has passed since the last beat and, for the Open's
 * chapters, the Open has ended (the chapter for the other result is skipped). */
export function storyState(
	level: number,
	seen: readonly StorySeen[],
	now: Date,
	open: OpenResult | null = null,
	beats: readonly StoryBeat[] = STORY,
): StoryState {
	const seenIds = new Set(seen.map((s) => s.id))
	const log = beats.filter((b) => seenIds.has(b.id))
	const next =
		beats.find((b) => !seenIds.has(b.id) && !skipped(b, open)) ?? null
	if (!next)
		return { pending: null, log, nextLevel: null, waitingForOpen: false }
	const last = seen.reduce<Date | null>(
		(m, s) => (!m || s.at > m ? s.at : m),
		null,
	)
	const gapOk =
		!last || now.getTime() - last.getTime() >= MIN_BEAT_GAP_HOURS * 3_600_000
	const openOk = !next.needs || open !== null
	const ready = level >= next.level && gapOk && openOk
	return {
		pending: ready ? next : null,
		log,
		nextLevel: next.level,
		waitingForOpen: !!next.needs && open === null,
	}
}

// ── story guests ─────────────────────────────────────────────────────────────
// A chapter that features Victor or Barry also puts them in the gym for a
// while after it was seen (an extra standing in the lobby or on the pavement
// with a couple of lines of their own).

export type StoryGuestKey =
	| "victor"
	| "barry"
	| "dana"
	| "quill"
	| "tess"
	| "reyes"
	| "joe"

export type StoryGuest = {
	who: StoryGuestKey
	name: string
	where: "lobby" | "pavement"
	/** Looks laid over a plain staff outfit. */
	look: {
		skin: string
		hair: string
		top: string
		bottom: string
		shoes: string
	}
	/** Dry lines they say now and then while they are about. */
	lines: readonly string[]
}

export const STORY_GUESTS: Readonly<Record<StoryGuestKey, StoryGuest>> = {
	reyes: {
		who: "reyes",
		name: "Capt. Reyes",
		where: "lobby",
		look: {
			skin: "#c98f6a",
			hair: "#2a2a30",
			top: "#2f5f8f",
			bottom: "#1d3550",
			shoes: "#f0f0f0",
		},
		lines: [
			"Mind the ropes. Everyone minds the ropes.",
			"Forty years of IronWave. Thirty-nine, I am told.",
			"A friendly race. I am always friendly.",
			"Your rowers are acceptable.",
		],
	},
	joe: {
		who: "joe",
		name: "Old Joe",
		where: "pavement",
		look: {
			skin: "#d9a98a",
			hair: "#c8c8c0",
			top: "#8f7a3a",
			bottom: "#3a3a2a",
			shoes: "#5a4a2a",
		},
		lines: [
			"Fresh catch. Ask the gulls.",
			"Chips on the house. Once.",
			"My cousins row like they argue.",
			"The ledger does not lie. Much.",
		],
	},
	quill: {
		who: "quill",
		name: "Prof. Quill",
		where: "lobby",
		look: {
			skin: "#d9a98a",
			hair: "#b8b8c8",
			top: "#6b4a8a",
			bottom: "#3a2d4a",
			shoes: "#2a2030",
		},
		lines: [
			"Fascinating. Truly. A footnote, perhaps.",
			"Your signage is not peer reviewed.",
			"I am only here to observe.",
			"Participation is graded.",
		],
	},
	tess: {
		who: "tess",
		name: "Tess",
		where: "pavement",
		look: {
			skin: "#e8b48e",
			hair: "#8a3a1d",
			top: "#d98a3a",
			bottom: "#5a3a2a",
			shoes: "#ffffff",
		},
		lines: [
			"Cupcake. Take the cupcake.",
			"Student discount, no questions.",
			"Ada says hello. Ada did not say hello.",
			"Free coffee for anyone who looks tired.",
		],
	},
	dana: {
		who: "dana",
		name: "Dana",
		where: "lobby",
		look: {
			skin: "#f0c8a0",
			hair: "#d8b24a",
			top: "#2a8f8f",
			bottom: "#1d4f50",
			shoes: "#ffffff",
		},
		lines: [
			"Solid floor. Honest rubber.",
			"I would put the squat rack by the window.",
			"No hard feelings. Mostly.",
			"Is Marian counting out loud again.",
		],
	},
	victor: {
		who: "victor",
		name: "Victor",
		where: "lobby",
		look: {
			skin: "#e8b48e",
			hair: "#1d1a1f",
			top: "#2b3440",
			bottom: "#20242c",
			shoes: "#101216",
		},
		lines: [
			"Interesting floor plan.",
			"I would knock that wall down.",
			"Charming. Truly.",
			"Mind if I take a leaflet.",
		],
	},
	barry: {
		who: "barry",
		name: "Barry",
		where: "pavement",
		look: {
			skin: "#d99a6c",
			hair: "#6b3a1d",
			top: "#d4463a",
			bottom: "#e8b04a",
			shoes: "#ffffff",
		},
		lines: [
			"Smell that? That's marketing.",
			"Free. I said free.",
			"One bite. For the neighbourhood.",
			"My fryer is a good listener.",
		],
	},
}

/** The chapters that bring a guest, and how long the guest stays. */
export const GUEST_BEATS: Readonly<Record<string, StoryGuestKey>> = {
	"a1-coat": "victor",
	"a1-samples": "barry",
	"a1-offer": "victor",
	"a1-friend": "barry",
	"a2-sale": "barry",
	"a2-rival": "dana",
	"a2-deal": "victor",
	"a3-start": "dana",
	"a3-win": "barry",
	"a3-finale": "barry",
	"c2-professor": "quill",
	"c2-discount": "tess",
	"c2-hours": "quill",
	"c2-graduation": "tess",
	"c3-captain": "reyes",
	"c3-joe": "joe",
	"c3-ledger": "joe",
	"c3-race": "reyes",
	"c3-harbour-lights": "joe",
}
export const GUEST_MINUTES = 12

/** The guest who is about now: from the most recent guest chapter seen
 * within `GUEST_MINUTES`, or null. */
export function storyGuestNow(
	log: readonly { id: string; seenAt: string }[],
	now: Date,
): StoryGuest | null {
	let best: { who: StoryGuestKey; at: number } | null = null
	for (const c of log) {
		const who = GUEST_BEATS[c.id]
		const at = Date.parse(c.seenAt)
		if (!who || Number.isNaN(at)) continue
		if (now.getTime() - at > GUEST_MINUTES * 60_000 || at > now.getTime())
			continue
		if (!best || at > best.at) best = { who, at }
	}
	return best ? STORY_GUESTS[best.who] : null
}
