// Campaign three's story: Harbour Road (#188). Nine chapters, gym levels 1-9.
// The staff are the same, the street is a working harbour, the rival is
// Captain Mara Reyes's IronWave (a rowing club that grew a weights room) and
// the food shop is Old Joe's Fish Shack. Same tone rules: dry, supportive,
// nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_HARBOUR: readonly StoryBeat[] = [
	{
		id: "c3-arrival",
		act: 1,
		level: 1,
		title: "Low tide",
		recap:
			"Slim Pals opens on Harbour Road, where the air smells of rope and chips.",
		lines: [
			{ who: "lisa", text: "Third street. The lock here is sticky and salty." },
			{
				who: "marcus",
				text: "Harbour Road. Everything smells of rope and chips.",
			},
			{
				who: "alex",
				text: "The rent is cheap. The seagulls are not included.",
			},
		],
	},
	{
		id: "c3-captain",
		act: 1,
		level: 2,
		title: "The captain",
		recap:
			"Captain Reyes of IronWave welcomes the gym to the harbour. Politely.",
		lines: [
			{
				who: "reyes",
				text: "IronWave has trained this harbour for forty years.",
			},
			{ who: "rivera", text: "Thirty-nine. I checked the sign." },
			{ who: "reyes", text: "Welcome to the harbour. Mind the ropes." },
		],
	},
	{
		id: "c3-joe",
		act: 1,
		level: 3,
		title: "Fresh catch",
		recap:
			"Old Joe at the Fish Shack feeds the gym lunch and has opinions about protein.",
		lines: [
			{
				who: "joe",
				text: "Fish Shack. Best protein on the road. Ask the gulls.",
			},
			{ who: "kim", text: "I will ask a nutrition expert instead." },
			{ who: "joe", text: "The gulls have a diploma too." },
		],
	},
	{
		id: "c3-rowing",
		act: 1,
		level: 4,
		title: "Row, row",
		recap:
			"IronWave invites the gym to a rowing machine race. Derek volunteers, then regrets it.",
		lines: [
			{ who: "reyes", text: "A friendly race. Twenty minutes on the rowers." },
			{ who: "derek", text: "I volunteer. Wait. Twenty minutes?" },
			{ who: "marcus", text: "He volunteers fast and thinks slow." },
		],
	},
	{
		id: "c3-tide",
		act: 1,
		level: 5,
		title: "High tide",
		recap:
			"The harbour floods the pavement and the whole street trains indoors for a day.",
		lines: [
			{ who: "alex", text: "The water is at the door. Nobody panic." },
			{
				who: "joe",
				text: "I'm selling chips on the stairs. Don't tell the council.",
			},
			{
				who: "reyes",
				text: "IronWave is open to all for the day. Bring a towel.",
			},
			{
				who: "lisa",
				text: "Every harbour keeps a ledger. Mine was a drawer on Pavement Street. It is closed now.",
			},
		],
	},
	{
		id: "c3-ledger",
		act: 1,
		level: 6,
		title: "The old ledger",
		recap:
			"Joe finds a ledger: IronWave started as a rowing club that lost to a fishing crew.",
		lines: [
			{
				who: "joe",
				text: "Found a ledger. 1987. IronWave lost a race to my father.",
			},
			{ who: "reyes", text: "That ledger is a rumour." },
			{ who: "lisa", text: "It has a signature and a chip stain." },
		],
	},
	{
		id: "c3-rematch",
		act: 1,
		level: 7,
		title: "The rematch",
		recap:
			"Reyes proposes a rematch for the old race, gym against gym against Joe's crew.",
		lines: [
			{ who: "reyes", text: "A rematch. Three crews. One harbour trophy." },
			{
				who: "joe",
				text: "I will enter my cousins. They row like they argue.",
			},
			{ who: "rivera", text: "We train this week. Every day counts." },
		],
	},
	{
		id: "c3-race",
		act: 1,
		level: 8,
		title: "Race day",
		recap:
			"The harbour race: Slim Pals, IronWave and Joe's cousins, one trophy.",
		lines: [
			{ who: "narrator", text: "Three boats. One buoy. A lot of gulls." },
			{ who: "derek", text: "I pulled. I really pulled. I am done." },
			{ who: "reyes", text: "Second. Behind the cousins. I will allow it." },
		],
	},
	{
		id: "c3-harbour-lights",
		act: 1,
		level: 9,
		title: "Harbour lights",
		recap:
			"Everyone shares the trophy. The street has a gym, a rival and a fish shack.",
		lines: [
			{
				who: "reyes",
				text: "The trophy lives in the harbour. All three crews.",
			},
			{
				who: "joe",
				text: "Chips are on the house. Once. Do not get used to it.",
			},
			{ who: "marcus", text: "We came for the rent. We stayed for the rope." },
			{
				who: "narrator",
				text: "Harbour Road remembers the gym. Another street waits when you are ready.",
			},
		],
	},
]
