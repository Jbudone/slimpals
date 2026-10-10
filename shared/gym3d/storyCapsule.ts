// Campaign ten's story: Pavement Street a fourth time, the time capsule (#188).
// Nine chapters, gym levels 1-9. The street turns ten and digs up the tin buried
// on its first day: letters, photos, a membership card, and a new tin to bury.
// Same tone rules: dry, supportive, nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_CAPSULE: readonly StoryBeat[] = [
	{
		id: "c10-spade",
		act: 1,
		level: 1,
		title: "A spade by the lamp post",
		recap:
			"A council worker marks a patch by the lamp post: the street turns ten and the tin comes up.",
		lines: [
			{
				who: "barry",
				text: "Ten years on the street. Under that lamp post there is a tin I buried.",
			},
			{ who: "lisa", text: "You buried a tin and told no one?" },
			{
				who: "barry",
				text: "I told everyone. Nobody wrote it down, which is different.",
			},
			{
				who: "narrator",
				text: "Pavement Street turns ten. The gym is asked to help dig.",
			},
		],
	},
	{
		id: "c10-list",
		act: 1,
		level: 2,
		title: "What goes in the next one",
		recap: "Alex starts a list for a new tin to bury beside the old one.",
		lines: [
			{
				who: "alex",
				text: "If we dig one up we bury one. I have started a list.",
			},
			{ who: "marcus", text: "What is on it?" },
			{ who: "alex", text: "Item one: a stopwatch. Item two: a better list." },
		],
	},
	{
		id: "c10-letter",
		act: 1,
		level: 3,
		title: "A letter to later",
		recap:
			"Rivera writes a letter to be read in ten years and will not say what is in it.",
		lines: [
			{
				who: "rivera",
				text: "Everyone writes a letter to the street. Mine is two lines.",
			},
			{ who: "kim", text: "Two lines is a good length for a letter." },
			{
				who: "rivera",
				text: "It says keep showing up. It also says buy a new whistle.",
			},
		],
	},
	{
		id: "c10-pole",
		act: 1,
		level: 4,
		title: "Victor's banner pole",
		recap:
			"Dana remembers the spot was marked on a banner pole Victor lent the street.",
		lines: [
			{
				who: "dana",
				text: "Victor lent a banner pole to mark the place. It is still in his shed.",
			},
			{
				who: "victor",
				text: "The pole is yours to borrow. Please return it after the dig.",
			},
			{
				who: "marcus",
				text: "A MaxOut pole marking a Baron tin outside our gym. Fitting.",
			},
		],
	},
	{
		id: "c10-dig",
		act: 1,
		level: 5,
		title: "Eight inches down",
		recap:
			"The street takes turns with one spade. A passing bus waits while they work.",
		lines: [
			{
				who: "narrator",
				text: "Everyone gets three scoops of earth. The bus driver takes four.",
			},
			{
				who: "derek",
				text: "Spade. Pass it on.",
			},
			{
				who: "lisa",
				text: "Derek has been here for ten years and has said that sentence before.",
			},
			{
				who: "marcus",
				text: "The notebook board is across the road. Page one has been copied nine hundred times.",
			},
		],
	},
	{
		id: "c10-tin",
		act: 1,
		level: 6,
		title: "The tin",
		recap:
			"The old biscuit tin holds a membership card numbered 0001 and a hand-drawn gym map.",
		lines: [
			{
				who: "lisa",
				text: "Membership card number one. That was mine. I forgot I buried it.",
			},
			{
				who: "marcus",
				text: "And a map of the gym. It has one treadmill and a very large plant.",
			},
			{ who: "barry", text: "The plant is still there. I checked." },
		],
	},
	{
		id: "c10-photos",
		act: 1,
		level: 7,
		title: "Opening day, in colour",
		recap:
			"A roll of photos from opening day, with Derek in the background of every one.",
		lines: [
			{
				who: "kim",
				text: "Forty photos. Derek is in the corner of all forty.",
			},
			{ who: "derek", text: "Warming up." },
			{
				who: "alex",
				text: "Ten years of warming up. We should give him a plaque.",
			},
		],
	},
	{
		id: "c10-new",
		act: 1,
		level: 8,
		title: "The new tin",
		recap:
			"The street fills a new tin: Alex's list, a stopwatch, Rivera's letter and one very good pickle.",
		lines: [
			{
				who: "barry",
				text: "A jar of my best pickle. It will be remarkable in ten years.",
			},
			{
				who: "alex",
				text: "It will be a jar of pickle in a tin in the ground.",
			},
			{ who: "dana", text: "Put it in. It has opinions about its future." },
		],
	},
	{
		id: "c10-buried",
		act: 1,
		level: 9,
		title: "Back under the lamp post",
		recap:
			"Both tins go back in the ground with a date to open them: ten years from today.",
		lines: [
			{
				who: "rivera",
				text: "Same lamp post, same hole, one more tin. Date it ten years on.",
			},
			{
				who: "lisa",
				text: "I am putting a reminder in the diary. Of the next diary.",
			},
			{
				who: "narrator",
				text: "That is the tenth story. The street keeps going, and so does the gym.",
			},
		],
	},
]
