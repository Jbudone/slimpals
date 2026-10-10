// Campaign eight's story: Campus Row a third time, during exam week (#188).
// Nine chapters, gym levels 1-9. The students are frazzled, Professor Quill
// sets a "fitness exam" for her own study and Tess keeps the cafe open all
// night. Same tone rules: dry, supportive, nothing about bodies, no
// exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_EXAMS: readonly StoryBeat[] = [
	{
		id: "c8-week",
		act: 1,
		level: 1,
		title: "Exam week",
		recap:
			"Campus Row is in exam week. The library is full and the gym is quiet.",
		lines: [
			{
				who: "lisa",
				text: "Exam week. Every window on the Row has a desk lamp in it.",
			},
			{
				who: "marcus",
				text: "Nobody is lifting. They are all studying how not to panic.",
			},
			{
				who: "narrator",
				text: "Campus Row a third time. The students look tired and hopeful.",
			},
		],
	},
	{
		id: "c8-pass",
		act: 1,
		level: 2,
		title: "A study break pass",
		recap:
			"Quill proposes a ten minute study break pass: leave the desk, move, return.",
		lines: [
			{
				who: "quill",
				text: "My data says ten minutes of movement helps the next hour of study.",
			},
			{
				who: "kim",
				text: "Your data and my advice agree. I am as surprised as you are.",
			},
			{
				who: "alex",
				text: "A pass, printed on card, with a stamp. Students love a stamp.",
			},
		],
	},
	{
		id: "c8-cafe",
		act: 1,
		level: 3,
		title: "Open all night",
		recap:
			"Tess keeps the cafe open all night and adds a quiet corner for students who need a break.",
		lines: [
			{
				who: "tess",
				text: "Open all night. I put a quiet corner in the back. No laptops.",
			},
			{ who: "lisa", text: "A corner with no laptops. Brave." },
			{
				who: "tess",
				text: "Tea is free for anyone who has a stamp. Quill's idea. Do not tell her I agreed.",
			},
		],
	},
	{
		id: "c8-rush",
		act: 1,
		level: 4,
		title: "The ten minute rush",
		recap: "Students queue for ten minute sessions between exams.",
		lines: [
			{
				who: "marcus",
				text: "Ten minutes, a queue, a clock. I feel like a pit crew.",
			},
			{
				who: "derek",
				text: "I only came to look at the stamp. Fine, I will do the lunges.",
			},
			{ who: "rivera", text: "Short sessions, honestly done. That counts." },
		],
	},
	{
		id: "c8-nerves",
		act: 1,
		level: 5,
		title: "Nerves",
		recap:
			"A first-year admits to Dr. Kim that she is nervous about her biggest exam.",
		lines: [
			{
				who: "kim",
				text: "Nervous is normal. Breathe in for four, out for six. Try it twice.",
			},
			{
				who: "lisa",
				text: "She is back from her exam. She says the breathing helped.",
			},
			{
				who: "kim",
				text: "Good. I will take credit on behalf of the breathing.",
			},
			{
				who: "tess",
				text: "There is a slice of the fun run cake in the freezer. It is for moments like this.",
			},
		],
	},
	{
		id: "c8-library",
		act: 1,
		level: 6,
		title: "The library lights",
		recap:
			"The library leaves its lights on all night. Quill walks the students home in groups.",
		lines: [
			{
				who: "quill",
				text: "The library never closes this week. I walk the late ones home.",
			},
			{
				who: "alex",
				text: "A professor with a torch and a clipboard. Quite a sight.",
			},
			{ who: "marcus", text: "Safe is the point. The clipboard is optional." },
		],
	},
	{
		id: "c8-results",
		act: 1,
		level: 7,
		title: "Results on the door",
		recap:
			"Results go up on the library door. The gym keeps a chair for anyone who needs to sit.",
		lines: [
			{
				who: "lisa",
				text: "Results are up. We put a chair by the door. Just in case.",
			},
			{
				who: "tess",
				text: "I have cake for the ones who passed and cake for the ones who did not.",
			},
			{ who: "kim", text: "Same cake. That is the right call." },
		],
	},
	{
		id: "c8-retake",
		act: 1,
		level: 8,
		title: "Second tries",
		recap:
			"A few students need a retake. The gym offers a standing study group and a stamp card.",
		lines: [
			{
				who: "marcus",
				text: "Retakes in a month. Study group here, stamp card on the house.",
			},
			{ who: "derek", text: "I am one of the retakes. I will say so once." },
			{ who: "rivera", text: "Said once and heard. Welcome to the group." },
		],
	},
	{
		id: "c8-summer",
		act: 1,
		level: 9,
		title: "The last stamp",
		recap: "Exam week ends. The stamp cards are full and the Row exhales.",
		lines: [
			{
				who: "quill",
				text: "Final tally: two hundred stamps. My study is oddly cheerful.",
			},
			{
				who: "tess",
				text: "The cafe closes at midnight tonight. First time in a week.",
			},
			{
				who: "lisa",
				text: "The lock still sticks. It has seen three of these weeks.",
			},
			{
				who: "narrator",
				text: "Campus Row sleeps in. Another street waits when you are ready.",
			},
		],
	},
]
