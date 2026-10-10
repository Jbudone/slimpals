// Campaign nine's story: Harbour Road a third time, the winter the lighthouse
// is restored (#188). Nine chapters, gym levels 1-9. Captain Reyes organises the
// volunteers, Old Joe feeds them and the gym runs the early shift. Same tone
// rules: dry, supportive, nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_LIGHTHOUSE: readonly StoryBeat[] = [
	{
		id: "c9-dark",
		act: 1,
		level: 1,
		title: "The dark tower",
		recap:
			"The old lighthouse at the end of Harbour Road has been dark for years. A notice asks for volunteers.",
		lines: [
			{
				who: "lisa",
				text: "A notice on the quay. The lighthouse needs volunteers.",
			},
			{
				who: "reyes",
				text: "It has been dark for eleven years. I have counted every night.",
			},
			{
				who: "narrator",
				text: "Harbour Road a third time. Cold air and a tower with no light.",
			},
		],
	},
	{
		id: "c9-sign",
		act: 1,
		level: 2,
		title: "Sign here",
		recap: "Forty names go on the volunteer list in a day. The gym adds six.",
		lines: [
			{
				who: "marcus",
				text: "Six of us signed. Alex signed twice and says it counts double.",
			},
			{ who: "alex", text: "It was a clerical decision. I stand by it." },
			{ who: "reyes", text: "Forty-six names. I did not expect forty." },
		],
	},
	{
		id: "c9-stairs",
		act: 1,
		level: 3,
		title: "A hundred and twelve steps",
		recap:
			"The tower has a hundred and twelve steps. The volunteers carry up supplies in relays.",
		lines: [
			{
				who: "rivera",
				text: "A hundred and twelve steps. I counted twice and then sat down.",
			},
			{
				who: "kim",
				text: "Relays, rest on every landing. The stairs are not going anywhere.",
			},
			{
				who: "marcus",
				text: "Landings every twenty steps. It is the best set I have run.",
			},
		],
	},
	{
		id: "c9-soup",
		act: 1,
		level: 4,
		title: "Soup at the base",
		recap:
			"Old Joe sets up a soup pot at the foot of the tower and will not take payment.",
		lines: [
			{
				who: "joe",
				text: "Soup for the lamp crew. No charge. It is my father's recipe.",
			},
			{ who: "lisa", text: "It has a lot of pepper." },
			{ who: "joe", text: "That is the recipe. Have another bowl." },
		],
	},
	{
		id: "c9-lens",
		act: 1,
		level: 5,
		title: "The lens arrives",
		recap:
			"The old lens comes back from restoration in a crate. It takes six people to carry it up.",
		lines: [
			{
				who: "reyes",
				text: "Six to a crate, slow and together. Nobody runs with glass.",
			},
			{
				who: "marcus",
				text: "On three. One, two, three. Everyone lift with the legs.",
			},
			{ who: "kim", text: "That is the right way to lift, in any building." },
			{
				who: "joe",
				text: "The regatta lantern already hangs in the tower window. It was waiting for this.",
			},
		],
	},
	{
		id: "c9-gale",
		act: 1,
		level: 6,
		title: "A night of wind",
		recap:
			"A gale pauses the work for two days. The crew waits it out in the gym.",
		lines: [
			{
				who: "lisa",
				text: "The crew is here until the wind drops. The kettle is on.",
			},
			{
				who: "derek",
				text: "I taught three of them to play cards. I did not say for money.",
			},
			{
				who: "rivera",
				text: "Some stretching while we wait. Voluntary. Mostly.",
			},
		],
	},
	{
		id: "c9-wire",
		act: 1,
		level: 7,
		title: "The last wire",
		recap:
			"The electrician needs one more day. The street collects spare cable from every shop.",
		lines: [
			{
				who: "alex",
				text: "Every shop on the road found a coil. The Fish Shack found two.",
			},
			{
				who: "joe",
				text: "One was from the freezer. I will find another freezer.",
			},
			{
				who: "reyes",
				text: "A lighthouse made from a street's odds and ends. I like it.",
			},
		],
	},
	{
		id: "c9-switch",
		act: 1,
		level: 8,
		title: "Who throws the switch",
		recap:
			"Reyes says the switch should be thrown by the youngest volunteer. It turns out to be Marcus's nephew.",
		lines: [
			{
				who: "reyes",
				text: "Youngest volunteer throws the switch. That is the rule I just made up.",
			},
			{
				who: "marcus",
				text: "That is my nephew. He is nine. Do not let him near the big lever.",
			},
			{
				who: "kim",
				text: "He has been practising on the small one for a week.",
			},
		],
	},
	{
		id: "c9-light",
		act: 1,
		level: 9,
		title: "The light turns",
		recap:
			"The lighthouse turns on. The whole of Harbour Road stands on the quay and watches it sweep.",
		lines: [
			{
				who: "joe",
				text: "There it is. My father said it would come back. He was early.",
			},
			{
				who: "reyes",
				text: "Eleven years. I will not count tonight. I will just watch.",
			},
			{
				who: "lisa",
				text: "The lock on our door still sticks. The light helps me see it.",
			},
			{
				who: "narrator",
				text: "Harbour Road has its light again. Another street waits when you are ready.",
			},
		],
	},
]
