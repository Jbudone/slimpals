// Campaign five's story: Campus Row again, for alumni weekend (#188). Nine
// chapters, gym levels 1-9. The locations repeat after three, so the street is
// the second one, years after graduation: Professor Quill still studies the
// gym, Tess's cafe has a second floor and everyone has a reunion to run. Same
// tone rules: dry, supportive, nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_ALUMNI: readonly StoryBeat[] = [
	{
		id: "c5-reunion",
		act: 1,
		level: 1,
		title: "Alumni weekend",
		recap:
			"Slim Pals is back on Campus Row for alumni weekend. Everyone looks older and taller.",
		lines: [
			{
				who: "lisa",
				text: "Campus Row for alumni weekend. Everyone is older and talks louder.",
			},
			{
				who: "marcus",
				text: "The students still look nineteen. I do not think that is a good sign.",
			},
			{
				who: "alex",
				text: "The bunting is already up. I priced it. I regret nothing.",
			},
		],
	},
	{
		id: "c5-study",
		act: 1,
		level: 2,
		title: "The follow-up study",
		recap:
			"Professor Quill returns with a follow-up study of the gym. She calls it a longitudinal one.",
		lines: [
			{
				who: "quill",
				text: "A longitudinal study. I have been watching you since the exam.",
			},
			{ who: "lisa", text: "That sounds worse than it is." },
			{
				who: "quill",
				text: "It is exactly as bad as it sounds. I find it fascinating.",
			},
		],
	},
	{
		id: "c5-cafe",
		act: 1,
		level: 3,
		title: "A second floor",
		recap:
			"Tess has added a second floor to the Campus Cafe. Nobody knows what it is for yet.",
		lines: [
			{
				who: "tess",
				text: "The cafe has a second floor now. I am calling it the mezzanine.",
			},
			{ who: "kim", text: "What is on the mezzanine?" },
			{
				who: "tess",
				text: "More tables. And a plan. I have not decided which is which.",
			},
		],
	},
	{
		id: "c5-committee",
		act: 1,
		level: 4,
		title: "The committee",
		recap:
			"The alumni committee asks both gyms to run the weekend's fun run. Nobody will say how far.",
		lines: [
			{
				who: "quill",
				text: "The committee wants a fun run. The distance is under review.",
			},
			{ who: "derek", text: "How far is fun, in a run?" },
			{
				who: "marcus",
				text: "Three kilometres. After that it is just running.",
			},
		],
	},
	{
		id: "c5-route",
		act: 1,
		level: 5,
		title: "Mapping the route",
		recap:
			"The two gyms map a route through the quad. It goes past the old library twice.",
		lines: [
			{
				who: "alex",
				text: "The route passes the library twice. I can fix that or lean into it.",
			},
			{
				who: "rivera",
				text: "Lean into it. People like a landmark they can complain about.",
			},
			{ who: "quill", text: "I shall count the complaints. For the study." },
			{
				who: "tess",
				text: "The exam cup is still on the library desk. The librarian dusts it every day.",
			},
		],
	},
	{
		id: "c5-signup",
		act: 1,
		level: 6,
		title: "The sign-up sheet",
		recap:
			"The sign-up sheet fills quickly. Half the names are alumni who have not run since graduation.",
		lines: [
			{
				who: "lisa",
				text: "Two hundred names. Half of them have not run since graduation.",
			},
			{
				who: "kim",
				text: "We will have water and a first-aid table. Mostly water.",
			},
			{ who: "tess", text: "And cake at the finish. That is the real draw." },
		],
	},
	{
		id: "c5-eve",
		act: 1,
		level: 7,
		title: "The night before",
		recap:
			"The night before the run, the quad is quiet. The cafe stays open late for nervous runners.",
		lines: [
			{
				who: "tess",
				text: "The cafe is open late. Tea for the nervous. Cake for the rest.",
			},
			{ who: "derek", text: "I am nervous and I am not even running." },
			{
				who: "rivera",
				text: "Sleep. The route will still be there in the morning.",
			},
		],
	},
	{
		id: "c5-run",
		act: 1,
		level: 8,
		title: "The fun run",
		recap:
			"Two hundred runners cross the quad. Several of them are walking and none of them are sorry.",
		lines: [
			{
				who: "narrator",
				text: "Two hundred runners, one quad, a great deal of cheering.",
			},
			{
				who: "marcus",
				text: "That one is walking. Good for him. Walking is also a plan.",
			},
			{
				who: "quill",
				text: "Complaints so far: thirty-one. Compliments: two hundred.",
			},
		],
	},
	{
		id: "c5-finish",
		act: 1,
		level: 9,
		title: "Cake at the finish",
		recap:
			"The run ends with cake on the quad. Campus Row feels like a place to come back to.",
		lines: [
			{
				who: "tess",
				text: "Everyone gets a slice. Walkers get two. That is the rule.",
			},
			{
				who: "quill",
				text: "My conclusion: the gym works. I shall be publishing nothing.",
			},
			{
				who: "lisa",
				text: "The lock still sticks. I have grown very fond of it.",
			},
			{
				who: "narrator",
				text: "Campus Row remembers the gym. Another street waits when you are ready.",
			},
		],
	},
]
