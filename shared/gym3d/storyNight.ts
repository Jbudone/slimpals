// Campaign seven's story: Pavement Street a third time, as a night market (#188).
// Nine chapters, gym levels 1-9. The street closes to cars on Friday evenings, the
// shops put out stalls and the gym is asked to run a stand. Same tone rules: dry,
// supportive, nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_NIGHT: readonly StoryBeat[] = [
	{
		id: "c7-notice",
		act: 1,
		level: 1,
		title: "Road closed on Fridays",
		recap:
			"Pavement Street will close to traffic on Friday evenings for a night market.",
		lines: [
			{
				who: "lisa",
				text: "A notice on the door. The road closes on Friday evenings.",
			},
			{
				who: "marcus",
				text: "No cars. The zebra crossing will finally be unemployed.",
			},
			{
				who: "narrator",
				text: "Pavement Street is changing again. The gym is asked to take part.",
			},
		],
	},
	{
		id: "c7-stalls",
		act: 1,
		level: 2,
		title: "Everyone puts out a stall",
		recap:
			"Barry sets up a pickle stall and Dana puts out a MaxOut table of leaflets.",
		lines: [
			{
				who: "barry",
				text: "Pickle stall, front and centre. The Baron name does the rest.",
			},
			{
				who: "dana",
				text: "A small table, a few leaflets. Nothing like last time.",
			},
			{ who: "rivera", text: "Dana has a table. Of course Dana has a table." },
		],
	},
	{
		id: "c7-stand",
		act: 1,
		level: 3,
		title: "What does a gym sell",
		recap: "The gym has nothing to sell. Alex suggests selling five minutes.",
		lines: [
			{
				who: "alex",
				text: "We sell five minutes. A short workout, free, with a smile.",
			},
			{
				who: "kim",
				text: "Five minutes is plenty. Most people stop before they start.",
			},
			{
				who: "lisa",
				text: "I will bring a kettle. Nobody argues with a kettle.",
			},
		],
	},
	{
		id: "c7-lights",
		act: 1,
		level: 4,
		title: "String lights",
		recap: "Victor lends the street his old banner poles to hang lights from.",
		lines: [
			{
				who: "victor",
				text: "My old banner poles. They have never held anything this useful.",
			},
			{
				who: "marcus",
				text: "They are slightly crooked. I choose to call that charm.",
			},
			{
				who: "narrator",
				text: "By dusk the street is strung from end to end.",
			},
		],
	},
	{
		id: "c7-rain",
		act: 1,
		level: 5,
		title: "Rain at five",
		recap: "Rain arrives an hour before opening. The street shares awnings.",
		lines: [
			{
				who: "dana",
				text: "Rain. Our awning is big enough for two tables. Come under.",
			},
			{
				who: "barry",
				text: "The pickles are waterproof. The people are the concern.",
			},
			{
				who: "rivera",
				text: "Sharing an awning with MaxOut. I did not see that coming.",
			},
		],
	},
	{
		id: "c7-first",
		act: 1,
		level: 6,
		title: "The first Friday",
		recap:
			"The market opens. A queue forms for the five minute stand, mostly out of curiosity.",
		lines: [
			{
				who: "lisa",
				text: "A queue at our stand. I counted twelve. I counted again.",
			},
			{
				who: "kim",
				text: "Most of them stay for the whole five minutes. That is rare.",
			},
			{
				who: "marcus",
				text: "One lady asked for ten. I said that was not on the sign.",
			},
		],
	},
	{
		id: "c7-pigeon",
		act: 1,
		level: 7,
		title: "The pigeon returns",
		recap:
			"The mural pigeon is seen on a stall. Nobody can say if it is the same one.",
		lines: [
			{
				who: "barry",
				text: "That pigeon is on my stall. It has taste, at least.",
			},
			{
				who: "alex",
				text: "It is the one from the mural. I would stake a small sum.",
			},
			{ who: "dana", text: "It looks pleased. I will not read more into it." },
		],
	},
	{
		id: "c7-vote",
		act: 1,
		level: 8,
		title: "Keep the market",
		recap:
			"The council asks whether the market should stay. The street signs a long list.",
		lines: [
			{
				who: "victor",
				text: "I signed first. I was told I did not need to say so.",
			},
			{
				who: "lisa",
				text: "Two hundred names. The pen ran dry halfway through.",
			},
			{
				who: "rivera",
				text: "A street that signs one list together. Good to see.",
			},
		],
	},
	{
		id: "c7-final",
		act: 1,
		level: 9,
		title: "Every Friday",
		recap: "The market stays. The gym keeps its five minute stand.",
		lines: [
			{ who: "barry", text: "Every Friday, then. I will need more pickles." },
			{
				who: "kim",
				text: "Five minutes at a time. That counts, and I will say so.",
			},
			{ who: "lisa", text: "The lock still sticks. I would not change it." },
			{
				who: "narrator",
				text: "Pavement Street keeps its lights on. Another street waits when you are ready.",
			},
		],
	},
]
