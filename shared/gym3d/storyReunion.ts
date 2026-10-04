// Campaign four's story: Pavement Street again, some years on (#188). Nine
// chapters, gym levels 1-9. The locations repeat after three, so the street
// is the first one, but nobody is where they were: MaxOut is a smaller gym
// under Dana Voss, Victor is back for a different reason, and Barry has
// finally sold the Burger Baron's secret (it is the pickle). Same tone rules:
// dry, supportive, nothing about bodies, no exclamation marks.
import type { StoryBeat } from "./story.js"

export const STORY_REUNION: readonly StoryBeat[] = [
	{
		id: "c4-return",
		act: 1,
		level: 1,
		title: "Back on the street",
		recap:
			"Slim Pals opens on Pavement Street again. The lock is still sticky.",
		lines: [
			{
				who: "lisa",
				text: "Pavement Street. I recognise the lock. It still sticks.",
			},
			{
				who: "marcus",
				text: "Same street. Different decade. The same pigeons.",
			},
			{
				who: "alex",
				text: "The rent went up. So did the pigeons' confidence.",
			},
		],
	},
	{
		id: "c4-sign",
		act: 1,
		level: 2,
		title: "The new sign",
		recap:
			"MaxOut has shrunk and Dana Voss runs it now. She waves from the doorway.",
		lines: [
			{ who: "dana", text: "MaxOut is mine now. Smaller. Quieter. Mine." },
			{ who: "rivera", text: "You used to say quiet was for libraries." },
			{ who: "dana", text: "I used to say a lot of things. Welcome back." },
		],
	},
	{
		id: "c4-victor",
		act: 1,
		level: 3,
		title: "A visitor",
		recap: "Victor Maxwell drops in with a coffee and no leaflets.",
		lines: [
			{
				who: "victor",
				text: "No leaflets today. I only wanted to look at the floor.",
			},
			{ who: "lisa", text: "It is the same floor." },
			{
				who: "victor",
				text: "It is a better floor. I should not say that out loud.",
			},
		],
	},
	{
		id: "c4-baron",
		act: 1,
		level: 4,
		title: "The Baron's secret",
		recap:
			"Barry Baron says the secret of the burger is the pickle. Nobody believes him.",
		lines: [
			{
				who: "barry",
				text: "Forty years of research. The secret is the pickle.",
			},
			{ who: "kim", text: "That is not a secret. That is a garnish." },
			{ who: "barry", text: "A garnish with a following." },
		],
	},
	{
		id: "c4-mural",
		act: 1,
		level: 5,
		title: "The wall",
		recap:
			"The council wants a mural on the street. Everyone has a different idea.",
		lines: [
			{ who: "dana", text: "The council wants a mural. I vote for a barbell." },
			{ who: "barry", text: "A burger. Large. In the centre." },
			{ who: "victor", text: "Something with a clear call to action." },
			{
				who: "marcus",
				text: "A pigeon. They are the only ones who live here.",
			},
		],
	},
	{
		id: "c4-vote",
		act: 1,
		level: 6,
		title: "The vote",
		recap:
			"The street votes on the mural. It ends in a tie between a pigeon and a burger.",
		lines: [
			{
				who: "alex",
				text: "Forty votes for the pigeon. Forty for the burger.",
			},
			{ who: "lisa", text: "And one for a barbell. Dana, that was you." },
			{ who: "dana", text: "I like to lose on principle." },
		],
	},
	{
		id: "c4-paint",
		act: 1,
		level: 7,
		title: "Paint day",
		recap:
			"The gyms and the burger place paint the wall together. It is a pigeon holding a burger.",
		lines: [
			{
				who: "victor",
				text: "A pigeon with a burger. A compromise nobody wanted.",
			},
			{ who: "barry", text: "I would call it a masterpiece. Quietly." },
			{ who: "rivera", text: "Hand me the blue. The pigeon needs a gym bag." },
		],
	},
	{
		id: "c4-open-day",
		act: 1,
		level: 8,
		title: "Open day",
		recap:
			"Both gyms hold an open day together. The street gets a little busier.",
		lines: [
			{
				who: "dana",
				text: "Open day. Two gyms, one queue. Do not tell my accountant.",
			},
			{
				who: "kim",
				text: "There is a sign-up sheet. People are signing it, a bit.",
			},
			{
				who: "victor",
				text: "I will not say I told you so. I will only think it.",
			},
		],
	},
	{
		id: "c4-street-party",
		act: 1,
		level: 9,
		title: "The street party",
		recap:
			"The street holds a party under the new mural. Pavement Street feels like home.",
		lines: [
			{
				who: "barry",
				text: "Free pickles for everyone. Do not ask what is in them.",
			},
			{ who: "dana", text: "To the street. And the pigeon." },
			{
				who: "lisa",
				text: "The lock still sticks. I have decided to love it.",
			},
			{
				who: "narrator",
				text: "Pavement Street remembers the gym. Another street waits when you are ready.",
			},
		],
	},
]
