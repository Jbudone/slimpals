// Campaign eleven's story: Campus Row a fourth time, the bell tower (#188).
// Nine chapters, gym levels 1-9. The campus clock tower has been silent for
// years; students, staff and the gym team get it ringing again in time for
// freshers' week. Same tone rules: dry, supportive, nothing about bodies, no
// exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_BELL: readonly StoryBeat[] = [
	{
		id: "c11-silence",
		act: 1,
		level: 1,
		title: "The tower that stopped",
		recap:
			"The campus bell tower has been quiet for years; the new term starts with a petition to fix it.",
		lines: [
			{
				who: "quill",
				text: "The tower bell stopped the year the library moved. Nobody noticed, which is the problem.",
			},
			{ who: "tess", text: "I noticed. My morning rush has no ending now." },
			{
				who: "narrator",
				text: "Campus Row opens its fourth term. The gym signs the petition first.",
			},
		],
	},
	{
		id: "c11-ladder",
		act: 1,
		level: 2,
		title: "Two hundred and eleven steps",
		recap:
			"Marcus counts the tower stairs and offers the gym's stair routine to anyone who volunteers.",
		lines: [
			{
				who: "marcus",
				text: "Two hundred and eleven steps up. I counted them twice and lost count once.",
			},
			{ who: "kim", text: "Pace yourselves. Nobody wins a staircase." },
			{
				who: "marcus",
				text: "I am putting a stair class on the board. Bring water and a view.",
			},
		],
	},
	{
		id: "c11-clockmaker",
		act: 1,
		level: 3,
		title: "A clockmaker on Tuesday",
		recap:
			"A retired clockmaker agrees to look at the mechanism if someone carries up his tools.",
		lines: [
			{
				who: "tess",
				text: "He says the mechanism is fine. It is the fourth gear that has opinions.",
			},
			{ who: "derek", text: "I will carry the bag." },
			{
				who: "lisa",
				text: "Derek has volunteered to climb two hundred and eleven steps. Write that down.",
			},
		],
	},
	{
		id: "c11-gear",
		act: 1,
		level: 4,
		title: "The missing gear",
		recap:
			"The fourth gear is missing from the tower; Alex starts a search through the campus lost property.",
		lines: [
			{
				who: "alex",
				text: "The lost property cupboard has a gear, a cello and a trophy. No receipt for any of them.",
			},
			{
				who: "quill",
				text: "The trophy is mine. The gear is probably the tower's.",
			},
			{ who: "rivera", text: "Check it fits. Nobody ever checks it fits." },
		],
	},
	{
		id: "c11-fits",
		act: 1,
		level: 5,
		title: "It fits",
		recap:
			"The gear from the cupboard fits the tower, and Derek reminds the gym the street once dug up a tin.",
		lines: [
			{
				who: "derek",
				text: "Fits. Like the tin on Pavement Street. Things come back.",
			},
			{
				who: "lisa",
				text: "Harbour Road lit a lighthouse, Pavement Street dug a tin. Campus Row can ring a bell.",
			},
			{
				who: "tess",
				text: "Our Hall of fame gets a bell. I will make it a very large cake.",
			},
		],
	},
	{
		id: "c11-rope",
		act: 1,
		level: 6,
		title: "A rope for the bell",
		recap:
			"The bell needs a new rope; the gym's old climbing rope is donated and tested by Rivera.",
		lines: [
			{
				who: "rivera",
				text: "Forty feet of climbing rope, retired. It has done enough. Let it ring something.",
			},
			{ who: "marcus", text: "Tested. It holds. So does the clockmaker." },
			{
				who: "kim",
				text: "Gloves for whoever rings it. Hands are the first thing a rope notices.",
			},
		],
	},
	{
		id: "c11-rehearsal",
		act: 1,
		level: 7,
		title: "Rehearsal at noon",
		recap:
			"The first test pull of the rope: one long note and a pigeon leaving in a hurry.",
		lines: [
			{
				who: "narrator",
				text: "The bell gives one long note. A pigeon leaves the tower at speed.",
			},
			{ who: "alex", text: "Twelve seconds. I timed it." },
			{
				who: "quill",
				text: "It is flat. It has been flat for years. That is how it sounds.",
			},
		],
	},
	{
		id: "c11-schedule",
		act: 1,
		level: 8,
		title: "Who rings what",
		recap:
			"Alex draws up a ringing rota for freshers' week: morning, noon and a quiet one at night.",
		lines: [
			{
				who: "alex",
				text: "Seven o'clock, noon and nine. Nine is the quiet one. Three pulls, no more.",
			},
			{ who: "tess", text: "Can the cafe ring it on Fridays?" },
			{
				who: "alex",
				text: "The cafe can ring it on Fridays. I have added a column for that.",
			},
		],
	},
	{
		id: "c11-chime",
		act: 1,
		level: 9,
		title: "Seven o'clock, Monday",
		recap:
			"At seven on the first morning of freshers' week the bell rings across Campus Row.",
		lines: [
			{
				who: "rivera",
				text: "Seven sharp. Pull steady. Let the bell do the talking.",
			},
			{
				who: "lisa",
				text: "It sounded like a school day, which is what it was built for.",
			},
			{
				who: "narrator",
				text: "That is the eleventh story. Campus Row keeps time again, and the gym keeps going.",
			},
		],
	},
]
