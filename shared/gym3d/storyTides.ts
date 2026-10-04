// Campaign six's story: Harbour Road again, some years on (#188). Nine chapters,
// gym levels 1-9. The locations repeat after three, so it is the third street
// revisited: Captain Reyes has handed IronWave to her crew and Old Joe's Fish
// Shack has a queue. Same tone rules: dry, supportive, nothing about bodies,
// no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_TIDES: readonly StoryBeat[] = [
	{
		id: "c6-return",
		act: 1,
		level: 1,
		title: "Back on the harbour",
		recap: "Slim Pals returns to Harbour Road. The gulls remember everyone.",
		lines: [
			{ who: "lisa", text: "Harbour Road again. The gulls have not moved on." },
			{
				who: "marcus",
				text: "The smell is the same. I find that comforting and I do not know why.",
			},
			{
				who: "narrator",
				text: "A new door, a new lock and the same grey water.",
			},
		],
	},
	{
		id: "c6-crew",
		act: 1,
		level: 2,
		title: "The new crew",
		recap:
			"Captain Reyes has handed IronWave to a young crew. She still watches from the quay.",
		lines: [
			{
				who: "reyes",
				text: "I retired on Tuesday. I was back on the quay by Wednesday.",
			},
			{
				who: "alex",
				text: "The new crew train at five. I have opinions about five.",
			},
			{
				who: "rivera",
				text: "Good crew. Loud, but good. Loud is a fine start.",
			},
		],
	},
	{
		id: "c6-queue",
		act: 1,
		level: 3,
		title: "The queue at the shack",
		recap:
			"Old Joe's Fish Shack has a queue down the road and he cannot explain why.",
		lines: [
			{ who: "joe", text: "A queue. Nobody told me. I only fried the fish." },
			{
				who: "lisa",
				text: "Someone posted a photo of your chips. It went a long way.",
			},
			{ who: "joe", text: "Then I had better buy more potatoes." },
		],
	},
	{
		id: "c6-tide",
		act: 1,
		level: 4,
		title: "The tide table",
		recap:
			"The road floods at high tide twice a month. The street plans around it.",
		lines: [
			{
				who: "reyes",
				text: "Springs come on the fifteenth. Park uphill or buy a boat.",
			},
			{
				who: "marcus",
				text: "I could run the class at low tide. Wet shoes build character.",
			},
			{
				who: "kim",
				text: "I would rather the class stayed dry. Character can wait.",
			},
		],
	},
	{
		id: "c6-lantern",
		act: 1,
		level: 5,
		title: "Lantern night",
		recap:
			"The harbour holds a lantern night. Each business lights one for the year ahead.",
		lines: [
			{
				who: "joe",
				text: "My father lit one for every boat. I only have the one boat.",
			},
			{
				who: "rivera",
				text: "We light one for the regulars. It is a big lantern.",
			},
			{
				who: "narrator",
				text: "The lanterns drift out and the street goes quiet for a minute.",
			},
		],
	},
	{
		id: "c6-swap",
		act: 1,
		level: 6,
		title: "The swap",
		recap: "IronWave and the gym swap a session. Rowers lift, members row.",
		lines: [
			{
				who: "reyes",
				text: "My crew will lift with you. Yours will row with us. Fair.",
			},
			{
				who: "alex",
				text: "I have never rowed. Is the boat supposed to move this way.",
			},
			{
				who: "marcus",
				text: "Their deadlift form is excellent. I am annoyed.",
			},
		],
	},
	{
		id: "c6-storm",
		act: 1,
		level: 7,
		title: "Storm warning",
		recap:
			"A storm is due. The street ties everything down and the gym stays open.",
		lines: [
			{ who: "reyes", text: "Wind by dark. Tie down anything you love." },
			{
				who: "lisa",
				text: "The gym stays open. People like somewhere warm to be.",
			},
			{
				who: "joe",
				text: "I will fry for whoever turns up. The oil does not mind weather.",
			},
		],
	},
	{
		id: "c6-morning",
		act: 1,
		level: 8,
		title: "The morning after",
		recap:
			"The storm passes. The street sweeps up together and finds the crew's boat in the car park.",
		lines: [
			{
				who: "alex",
				text: "A boat is in the car park. Nobody will admit to parking it.",
			},
			{ who: "reyes", text: "She floated in on her own. I am proud of her." },
			{
				who: "rivera",
				text: "Everyone is here with a broom. That is the whole street, really.",
			},
		],
	},
	{
		id: "c6-regatta",
		act: 1,
		level: 9,
		title: "Regatta day",
		recap:
			"The street holds a small regatta. Everyone gets a medal, including the gulls.",
		lines: [
			{
				who: "joe",
				text: "Every crew gets a medal. The gull gets a chip. It is tradition now.",
			},
			{
				who: "reyes",
				text: "Same trophy, three names on it. Room for a fourth.",
			},
			{
				who: "lisa",
				text: "The lock still sticks. I missed it more than the sea.",
			},
			{
				who: "narrator",
				text: "Harbour Road is a good place to come back to. Another street waits when you are ready.",
			},
		],
	},
]
