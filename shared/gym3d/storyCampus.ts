// Campaign two's story: Campus Row (#188). A shorter arc than campaign one
// (nine chapters, gym levels 1-9): the staff are the same, the street is new,
// and the rival is Professor Ada Quill's FitZone, with her sister Tess's
// Campus Cafe next to it. Same tone rules: dry, supportive, nothing about
// bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_CAMPUS: readonly StoryBeat[] = [
	{
		id: "c2-arrival",
		act: 1,
		level: 1,
		title: "Freshman week",
		recap:
			"Slim Pals opens on Campus Row, where everyone is nineteen or very tired.",
		lines: [
			{
				who: "lisa",
				text: "New street, new door. Same sticky lock, I checked.",
			},
			{
				who: "marcus",
				text: "Campus Row. Everyone here is nineteen or very tired.",
			},
			{
				who: "alex",
				text: "The rent is lower if we are quiet about the noise.",
			},
		],
	},
	{
		id: "c2-professor",
		act: 1,
		level: 2,
		title: "The professor",
		recap: "Professor Ada Quill of FitZone says she will be studying the gym.",
		lines: [
			{
				who: "quill",
				text: "FitZone is a research facility. And you are a... gym?",
			},
			{ who: "lisa", text: "We prefer gym." },
			{ who: "quill", text: "Marvellous. I shall be studying you." },
		],
	},
	{
		id: "c2-discount",
		act: 1,
		level: 3,
		title: "Student discount",
		recap:
			"Tess at the Campus Cafe gives every member a student discount. Nobody checks.",
		lines: [
			{
				who: "tess",
				text: "The Campus Cafe gives gym members a student discount.",
			},
			{ who: "kim", text: "Whose students?" },
			{ who: "tess", text: "Everyone's. Nobody checks." },
		],
	},
	{
		id: "c2-group",
		act: 1,
		level: 4,
		title: "Group project",
		recap:
			"FitZone wants a group project with the gym. Marcus knows how those end.",
		lines: [
			{ who: "derek", text: "FitZone wants us on a group project." },
			{ who: "marcus", text: "Group projects are how friendships end." },
			{ who: "quill", text: "Participation is graded." },
		],
	},
	{
		id: "c2-hours",
		act: 1,
		level: 5,
		title: "Office hours",
		recap:
			"The professor critiques the squat rack. Rivera asks if it is a lecture.",
		lines: [
			{ who: "quill", text: "Your squat rack is at an unfortunate angle." },
			{ who: "rivera", text: "Is this a lecture?" },
			{
				who: "quill",
				text: "It is a footnote. Footnotes are where the truth lives.",
			},
			{
				who: "marcus",
				text: "Page one of my notebook hangs on a street board back home. Footnotes welcome.",
			},
		],
	},
	{
		id: "c2-sisters",
		act: 1,
		level: 6,
		title: "Family business",
		recap:
			"Ada and Tess are sisters. She does the gym, Tess does the pastries.",
		lines: [
			{
				who: "tess",
				text: "Ada is my sister. She does the gym, I do the pastries.",
			},
			{ who: "alex", text: "A cartel of muffins and squats." },
			{ who: "tess", text: "Together we run the street. Quietly." },
		],
	},
	{
		id: "c2-library",
		act: 1,
		level: 7,
		title: "The library",
		recap: "Lisa finds the real reason for the rivalry in the college archive.",
		lines: [
			{
				who: "lisa",
				text: "I spent the afternoon in the library archive. You will like this.",
			},
			{
				who: "quill",
				text: "I am not rivals with you. I am rivals with a 1998 ranking.",
			},
			{ who: "marcus", text: "What ranking?" },
			{ who: "quill", text: "Best campus gym. We were second. To a basement." },
		],
	},
	{
		id: "c2-exam",
		act: 1,
		level: 8,
		title: "Exam day",
		recap:
			"The professor sets a final exam: the gym that checks in most keeps the quad.",
		lines: [
			{
				who: "quill",
				text: "Final exam. Whichever gym checks in the most keeps the quad.",
			},
			{ who: "lisa", text: "So we keep checking in. That is the whole plan." },
			{ who: "derek", text: "I can do that. I live here." },
		],
	},
	{
		id: "c2-graduation",
		act: 1,
		level: 9,
		title: "Graduation",
		recap: "Slim Pals passes. The street remembers, and a new one is waiting.",
		lines: [
			{ who: "quill", text: "You pass. With honours. Barely." },
			{ who: "tess", text: "There are cupcakes. Please take a cupcake." },
			{ who: "lisa", text: "The sticky lock will miss us." },
			{
				who: "narrator",
				text: "Campus Row remembers the gym. Another street waits when you are ready.",
			},
		],
	},
]
