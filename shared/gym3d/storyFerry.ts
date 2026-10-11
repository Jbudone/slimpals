// Campaign twelve's story: Harbour Road a fourth time, the ferry (#188).
// Nine chapters, gym levels 1-9. The harbour ferry has been laid up since the
// storm; the street repaints it, finds it a crew and runs the first crossing.
// Same tone rules: dry, supportive, nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_FERRY: readonly StoryBeat[] = [
	{
		id: "c12-laid-up",
		act: 1,
		level: 1,
		title: "The ferry in the shed",
		recap:
			"The harbour ferry has been laid up since the storm and the shed door finally opens.",
		lines: [
			{
				who: "reyes",
				text: "She has been in that shed since the storm. She is smaller than I remember.",
			},
			{ who: "joe", text: "Everything is smaller after a winter in a shed." },
			{
				who: "narrator",
				text: "Harbour Road opens its fourth season. The gym is asked to help with the ferry.",
			},
		],
	},
	{
		id: "c12-survey",
		act: 1,
		level: 2,
		title: "A very long list",
		recap:
			"Alex surveys the ferry and starts a list: paint, planks, a horn and a sensible number of lifebelts.",
		lines: [
			{
				who: "alex",
				text: "Paint, planks, a horn and fourteen lifebelts. I have numbered them.",
			},
			{ who: "reyes", text: "The horn is the only one that matters." },
			{ who: "alex", text: "The horn is item three. I will move it up." },
		],
	},
	{
		id: "c12-paint",
		act: 1,
		level: 3,
		title: "Two coats of blue",
		recap:
			"Volunteers repaint the hull; Derek takes the stern and does not talk for three hours.",
		lines: [
			{ who: "derek", text: "Stern. Two coats." },
			{
				who: "lisa",
				text: "That is the longest speech he has made in a month, and it was about paint.",
			},
			{
				who: "joe",
				text: "A good coat dries by Friday. A great one dries by Sunday.",
			},
		],
	},
	{
		id: "c12-crew",
		act: 1,
		level: 4,
		title: "Who crews her",
		recap:
			"The ferry needs a crew of three; Marcus, Jordan and Tess's cousin volunteer for the first run.",
		lines: [
			{
				who: "marcus",
				text: "Jordan and I will take the ropes. We spend all day lifting things anyway.",
			},
			{ who: "reyes", text: "A rope is not a barbell. A rope pulls back." },
			{
				who: "kim",
				text: "Warm up first. Everybody forgets the shoulders on a boat.",
			},
		],
	},
	{
		id: "c12-register",
		act: 1,
		level: 5,
		title: "The ledger comes out",
		recap:
			"Old Joe finds the ferry's first ticket book and a callback to the lighthouse in the Hall of fame.",
		lines: [
			{
				who: "joe",
				text: "First ticket book, 1962. Every crossing in pencil. Nobody missed a trip.",
			},
			{
				who: "lisa",
				text: "The street dug up a tin, Campus Row rang a bell. Harbour Road keeps a ledger.",
			},
			{
				who: "reyes",
				text: "The lighthouse is in the Hall of fame. The ferry goes next to it.",
			},
		],
	},
	{
		id: "c12-engine",
		act: 1,
		level: 6,
		title: "The engine coughs",
		recap:
			"The engine starts on the third try and coughs for a minute before it settles.",
		lines: [
			{
				who: "narrator",
				text: "The engine starts on the third try. A gull on the rail does not move.",
			},
			{ who: "rivera", text: "Warms up slowly. I respect that." },
			{
				who: "joe",
				text: "She is not coughing. She is clearing her throat before she speaks.",
			},
		],
	},
	{
		id: "c12-sea-trial",
		act: 1,
		level: 7,
		title: "A lap of the harbour",
		recap:
			"A trial lap of the harbour with a crew of six: a good wake and one lost hat.",
		lines: [
			{
				who: "reyes",
				text: "One lap, slow. Nobody stands at the front unless they hold something.",
			},
			{ who: "derek", text: "Hat." },
			{
				who: "lisa",
				text: "The hat is now part of the harbour. We will put it in the Hall of fame.",
			},
		],
	},
	{
		id: "c12-timetable",
		act: 1,
		level: 8,
		title: "Half past, every hour",
		recap:
			"Alex writes the timetable: half past every hour, with one extra crossing on market days.",
		lines: [
			{
				who: "alex",
				text: "Half past the hour, seven till seven. One extra crossing on market days.",
			},
			{ who: "joe", text: "Seven till seven. Sounds like a real ferry." },
			{
				who: "alex",
				text: "It is a real ferry. I have laminated the timetable to prove it.",
			},
		],
	},
	{
		id: "c12-first-run",
		act: 1,
		level: 9,
		title: "The first crossing",
		recap:
			"The ferry makes its first public crossing at half past seven with every seat taken.",
		lines: [
			{
				who: "reyes",
				text: "Half past seven. Ropes off. Take her out, steady.",
			},
			{
				who: "joe",
				text: "That is the sound she was built to make. Do not let anyone talk over it.",
			},
			{
				who: "narrator",
				text: "That is the twelfth story. The ferry runs, the harbour waves, and the gym keeps going.",
			},
		],
	},
]
