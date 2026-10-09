// The authored story (#188, first slice): short cutscene beats that open as
// the gym levels up, a few days apart, in a fixed order. Hand-written like the
// banter. Pure: `storyState` says which beat is waiting and what has been seen.
// Tone: dry and supportive, nothing about bodies, no exclamation marks. See
// docs/story_bible.md for the plan the beats follow.

import type { OpenResult, OpenState } from "./open.js"
import { STORY_ALUMNI } from "./storyAlumni.js"
import { STORY_CAMPUS } from "./storyCampus.js"
import { STORY_CAPSULE } from "./storyCapsule.js"
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
	/** The sub-story this chapter belongs to (see docs/story_series_plan.md). */
	thread?: string
}

/** Hours that must pass after one beat before the next can open. */
export const MIN_BEAT_GAP_HOURS = 16

export const STORY: readonly StoryBeat[] = [
	{
		id: "a1-opening",
		act: 1,
		level: 1,
		thread: "street",
		title: "Opening day",
		recap:
			"Slim Pals opens on a quiet street. The shop across the road is papered over.",
		lines: [
			{
				who: "narrator",
				text: "Slim Pals opens on Pavement Street. The shop across the road is papered over.",
			},
			{
				who: "lisa",
				text: "First day. Nobody has signed in yet, but I have a drawer ready for the paperwork.",
			},
			{
				who: "marcus",
				text: "A drawer for paperwork. You keep a drawer for everything.",
			},
			{
				who: "lisa",
				text: "Evidence, mostly. A street like this remembers things.",
			},
			{
				who: "narrator",
				text: "Across the road, someone is peeling paper off a window.",
			},
		],
	},
	{
		id: "a1-coat",
		act: 1,
		level: 2,
		thread: "rival",
		title: "A very good coat",
		recap:
			"Victor Maxwell visits in a very good coat and announces MaxOut. Marcus has heard that line before.",
		lines: [
			{
				who: "victor",
				text: "Victor Maxwell. I am opening a gym across the road. MaxOut. It will be very good.",
			},
			{ who: "alex", text: "We are Slim Pals. We were here first." },
			{ who: "victor", text: "Everyone has a number. I will find yours." },
			{ who: "lisa", text: "Coat, charming, no handshake. Noted." },
			{
				who: "marcus",
				text: "I have heard that line before. I just cannot think where.",
			},
		],
	},
	{
		id: "a1-samples",
		act: 1,
		level: 3,
		thread: "food",
		title: "Free samples",
		recap:
			"Barry Baron hands out free burgers and mentions that someone has been measuring his shop.",
		lines: [
			{
				who: "barry",
				text: "Barry Baron, the Burger Baron, next door but one. Free samples for the street.",
			},
			{ who: "kim", text: "Free burgers outside a gym. You are a brave man." },
			{
				who: "barry",
				text: "Brave, or worried. Somebody measured my shop with a tape this week.",
			},
			{ who: "derek", text: "I'm only looking." },
			{
				who: "lisa",
				text: "Somebody measured the Baron. I am writing that down.",
			},
		],
	},
	{
		id: "a1-sign",
		act: 1,
		level: 4,
		thread: "notebook",
		title: "The new sign",
		recap: "The MaxOut sign goes up with a line Marcus says is his.",
		lines: [
			{
				who: "narrator",
				text: "The MaxOut sign goes up across the road. It is very bright.",
			},
			{
				who: "alex",
				text: "It says 'Show up. Start small. Get measured.' in letters a metre high.",
			},
			{ who: "marcus", text: "Show up. Start small. That part is not theirs." },
			{ who: "rivera", text: "Marcus. Sit down. Tell us whose line that is." },
			{
				who: "marcus",
				text: "Mine. Page one of a notebook. I will say the rest out loud when I can.",
			},
		],
	},
	{
		id: "a1-offer",
		act: 1,
		level: 5,
		thread: "rival",
		title: "The offer",
		recap:
			"Victor offers to buy the gym and asks to keep Marcus, who knows 'the programme'.",
		lines: [
			{
				who: "victor",
				text: "A fair offer for the gym. The treadmills, the lease, the plant. Keep your staff.",
			},
			{
				who: "alex",
				text: "No. The treadmills have asked me to say no as well.",
			},
			{
				who: "victor",
				text: "Keep Marcus especially. He knows the programme.",
			},
			{ who: "marcus", text: "I know it very well." },
			{
				who: "lisa",
				text: "'The programme.' I am writing that down, with the date.",
			},
		],
	},
	{
		id: "a1-friend",
		act: 1,
		level: 6,
		thread: "food",
		title: "A friend of a friend",
		recap:
			"Barry orders a green juice for an imaginary friend who is worried about his lease.",
		lines: [
			{ who: "barry", text: "A green juice, please. It is for a friend." },
			{
				who: "kim",
				text: "Your friend has the same pickle stain on his sleeve as you.",
			},
			{
				who: "barry",
				text: "He is worried. Somebody wants his lease and he does not know who.",
			},
			{ who: "kim", text: "Tell your friend the salad bar does not bite." },
			{
				who: "barry",
				text: "He will think about it. He is a very stubborn friend.",
			},
		],
	},
	{
		id: "a1-notebook",
		act: 1,
		level: 7,
		thread: "notebook",
		title: "The notebook",
		recap:
			"Marcus tells the street he wrote MaxOut's first programme, and it hangs on their wall under another name.",
		lines: [
			{
				who: "marcus",
				text: "I was MaxOut's first trainer, before it had a sign. I wrote their programme in a notebook.",
			},
			{
				who: "marcus",
				text: "They put it on the wall. Somebody else's name is underneath it.",
			},
			{ who: "rivera", text: "Whose name?" },
			{ who: "marcus", text: "I do not know. I never went back to look." },
			{ who: "lisa", text: "I have a date for that. I will find the page." },
		],
	},
	{
		id: "a1-lease",
		act: 1,
		level: 8,
		thread: "rival",
		title: "Fine print",
		recap: "Barry's lease has been sold to a company whose name starts with V.",
		lines: [
			{
				who: "alex",
				text: "The Baron's lease has been sold. It is on the register, in very small print.",
			},
			{ who: "barry", text: "Sold to who?" },
			{ who: "alex", text: "A company. The first letter is V." },
			{
				who: "lisa",
				text: "The drawer is getting full. I am going to need a second one.",
			},
			{
				who: "narrator",
				text: "Across the road, a light stays on late in the MaxOut office.",
			},
		],
	},
	{
		id: "a2-sale",
		act: 2,
		level: 9,
		thread: "food",
		title: "Downsizing",
		recap:
			"Barry puts the Baron up for sale and admits an offer, from someone in a very good coat.",
		lines: [
			{
				who: "barry",
				text: "I am putting the Baron up for sale. Quietly. Please be quiet about it.",
			},
			{ who: "kim", text: "Someone made you an offer." },
			{
				who: "barry",
				text: "Someone did. I am not saying who. The coat is very good.",
			},
			{ who: "alex", text: "Nobody say anything. Lisa, put the drawer away." },
			{
				who: "lisa",
				text: "The drawer does not go away. It only gets quieter.",
			},
		],
	},
	{
		id: "a2-promo",
		act: 2,
		level: 10,
		thread: "notebook",
		title: "Half price",
		recap:
			"MaxOut's half price flyer says 'Programme by D. Voss', and Marcus knows the exercises.",
		lines: [
			{
				who: "narrator",
				text: "MaxOut runs a half price weekend. The street queues for the free coffee.",
			},
			{ who: "marcus", text: "Look at the flyer. 'Programme by D. Voss.'" },
			{ who: "alex", text: "Well, that is a name, at least." },
			{
				who: "marcus",
				text: "Page one is my writing. The exercises are my order. Somebody copied the lot.",
			},
			{
				who: "lisa",
				text: "D. Voss. I think I have that name. I will check the drawer.",
			},
		],
	},
	{
		id: "a2-rival",
		act: 2,
		level: 11,
		thread: "coaches",
		title: "Old rivals",
		recap:
			"Dana Voss turns out to be Rivera's old rival, and Lisa finds a 2009 clipping that puts Marcus's programme before MaxOut.",
		lines: [
			{
				who: "dana",
				text: "Dana Voss, MaxOut's head coach. I wrote the programme, as the flyer says.",
			},
			{
				who: "rivera",
				text: "We coached against each other in 2011. You still count sets under your breath.",
			},
			{ who: "dana", text: "And you still pretend not to notice." },
			{
				who: "lisa",
				text: "I found it. A clipping from 2009: 'Marcus writes a programme for community gyms.'",
			},
			{ who: "dana", text: "Old paper proves old paper. We will see." },
		],
	},
	{
		id: "a2-fries",
		act: 2,
		level: 12,
		thread: "food",
		title: "Research",
		recap:
			"Dr. Kim is caught with the Baron's large fries. Barry says he first made them for a debating team in '99.",
		lines: [
			{
				who: "kim",
				text: "I was seen with the Baron's large fries. It was research.",
			},
			{ who: "barry", text: "She ordered a large. And then a second large." },
			{ who: "kim", text: "Replication. Good science needs a second trial." },
			{
				who: "alex",
				text: "Dr. Kim, your secret is safe with the whole street.",
			},
			{
				who: "barry",
				text: "I first made those fries for the debating team in '99. I have never told anyone that.",
			},
		],
	},
	{
		id: "a2-school",
		act: 2,
		level: 13,
		thread: "rival",
		title: "Class of 99",
		recap:
			"A school photo shows Victor and Barry were best friends on the same debating team. The lease buyer is Victor.",
		lines: [
			{
				who: "lisa",
				text: "A photo from the class of '99 debating team. Two boys in the back row.",
			},
			{
				who: "barry",
				text: "That is me. And that is Victor Maxwell, in the same coat.",
			},
			{
				who: "alex",
				text: "You went to school with him. The V in the lease is Victor.",
			},
			{
				who: "barry",
				text: "He was my best friend. He asked me to keep it quiet. I said yes.",
			},
			{
				who: "marcus",
				text: "Everyone on this street knows someone with a very good coat.",
			},
		],
	},
	{
		id: "a2-deal",
		act: 2,
		level: 14,
		thread: "rival",
		title: "The deal",
		recap:
			"Victor offers to buy Barry's building in front of the street. Barry says not yet.",
		lines: [
			{
				who: "victor",
				text: "Barry. I am buying your building, in front of everyone, so there is no mystery.",
			},
			{ who: "barry", text: "Not yet, Victor. Not today." },
			{ who: "victor", text: "Debating team rules. State your case." },
			{
				who: "barry",
				text: "My case is pickles. And a salad bar, if I can find the room.",
			},
			{
				who: "rivera",
				text: "Dana has been watching from the window all afternoon. She has never watched anything that long.",
			},
		],
	},
	{
		id: "a2-wall",
		act: 2,
		level: 15,
		thread: "notebook",
		title: "The wall",
		recap:
			"Marcus takes the notebook into MaxOut. Victor never saw the wall before opening day, and Dana hung it.",
		lines: [
			{
				who: "marcus",
				text: "I am taking the notebook across the road. Nobody argue.",
			},
			{
				who: "narrator",
				text: "Marcus carries it into MaxOut and stops in front of the wall of the programme.",
			},
			{
				who: "victor",
				text: "I have never seen this wall. It was hung before I opened. Dana, who hung it?",
			},
			{
				who: "dana",
				text: "I did. I did not think anyone would read the name.",
			},
			{
				who: "marcus",
				text: "Page one is mine. I only wanted someone to read it.",
			},
			{
				who: "lisa",
				text: "The clipping, the date and the notebook are all in the drawer. Whenever you want them.",
			},
		],
	},
	{
		id: "a2-poster",
		act: 2,
		level: 16,
		thread: "coaches",
		title: "The poster",
		recap:
			"A poster announces the Pavement Street Open: MaxOut against Slim Pals, winner keeps the better sign.",
		lines: [
			{
				who: "alex",
				text: "There is a poster on the lamp post. The Pavement Street Open. MaxOut against Slim Pals.",
			},
			{
				who: "victor",
				text: "Winner keeps the better sign. Loser takes the other one.",
			},
			{ who: "dana", text: "We coach our own sides. Same rules as 2011." },
			{ who: "rivera", text: "Same rules. A better whistle." },
			{
				who: "narrator",
				text: "The Open starts when the gym is ready. Seven days, and the most XP earned wins.",
			},
		],
	},
	{
		id: "a3-start",
		act: 3,
		level: 17,
		thread: "rival",
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
			{ who: "marcus", text: "Page one is mine. I will take that bet." },
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
		thread: "rival",
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
		thread: "rival",
		title: "A narrow thing",
		recap:
			"MaxOut took the Open by a little. Slim Pals will earn the sign back.",
		lines: [
			{
				who: "dana",
				text: "We took it. Narrowly. Your last day was honest, I will say that.",
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
		thread: "street",
		title: "The whole street",
		recap:
			"Barry keeps the Baron going, smaller and with a salad. Rivera and Dana shake hands, and the notebook goes on the street board.",
		lines: [
			{
				who: "barry",
				text: "I have decided. The Baron stays a burger place. A smaller one, with a salad.",
			},
			{ who: "victor", text: "A salad. You. I will take one." },
			{
				who: "rivera",
				text: "Dana. Same time next year? Bring your own whistle.",
			},
			{
				who: "marcus",
				text: "The notebook goes on the street board. Page one is free for anyone to copy.",
			},
			{
				who: "lisa",
				text: "I am closing the drawer. Everything in it is accounted for.",
			},
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
	10: STORY_CAPSULE,
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
