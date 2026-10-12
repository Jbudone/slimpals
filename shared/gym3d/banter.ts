// Ambient banter: short scripted exchanges (2-3 lines) between two people
// standing near each other. Pure: the client picks one that fits the gym as
// it is now (a missing room or machine, a crowd) and plays it as alternating
// bubbles. Style: understated, specific, dry; no exclamation marks.
import type { Rng } from "./npcLines.js"
import type { Season } from "./season.js"

/** What the gym looks like right now, as far as banter cares. */
export type BanterContext = {
	/** Types of the finished rooms. */
	rooms: readonly string[]
	/** Item keys of the placed gear. */
	gear: readonly string[]
	/** A room is busy: several people are working out at once. */
	crowded: boolean
	/** Today's event is on. */
	event?: boolean
	/** A group class is running. */
	classes?: boolean
	/** The player upgraded or placed gear a moment ago. */
	upgraded?: boolean
	/** The rival gym is running its weekend promo. */
	maxout?: boolean
	/** Room types with a game on (sparring, pickup): see `roomPlayLabel`. */
	playing?: readonly string[]
	/** The season dressing the gym (October to December). */
	season?: Season | null
	/** The campaign in play: the exchanges about MaxOut belong to the first. */
	campaign?: number
	/** The staff room story playing this week (`ROOM_ARCS` id), if any. */
	roomArc?: string | null
}

export type BanterWhen = "event" | "classes" | "upgraded" | "maxout"

export type Banter = {
	id: string
	/** Only when this room type does not exist yet. */
	missingRoom?: string
	/** Only when this gear is not placed anywhere. */
	missingGear?: string
	/** Only when the gym is busy. */
	crowded?: boolean
	/** Only while a game is on in this room type. */
	playIn?: string
	/** Only in this season; counts as plain chatter, so gaps still win. */
	season?: Season
	/** Only while this staff room story is playing; plain chatter too. */
	arc?: string
	/** Only while this is going on (an event, a class, a fresh upgrade). */
	when?: BanterWhen
	/** Lines in turn: the first person speaks first. */
	lines: readonly [string, string] | readonly [string, string, string]
}

export const BANTER: readonly Banter[] = [
	{
		id: "play-sparring",
		playIn: "boxing",
		lines: [
			"Light contact, he said.",
			"That was light for you.",
			"My idea of light is different.",
		],
	},
	{
		id: "play-sparring-coach",
		playIn: "boxing",
		lines: ["Hands up. Hands up.", "They are up. The jab found them anyway."],
	},
	{
		id: "play-pickup",
		playIn: "court",
		lines: [
			"Next basket wins.",
			"You said that two baskets ago.",
			"Third time lucky.",
		],
	},
	{
		id: "play-pickup-rules",
		playIn: "court",
		lines: ["Is that a foul or a stumble.", "At this level, the same thing."],
	},
	{
		id: "summer-heat",
		season: "summer",
		lines: [
			"It's hot enough to cook in here.",
			"Open a window.",
			"The windows are open. That's the heat.",
		],
	},
	{
		id: "summer-water",
		season: "summer",
		lines: [
			"Someone put a cooler by the door.",
			"Water only. I checked twice.",
		],
	},
	{
		id: "newyear-balloons",
		season: "newyear",
		lines: [
			"Someone tied balloons to the door.",
			"It's January. They'll be saggy by February.",
			"So will the resolutions. Keep lifting.",
		],
	},
	{
		id: "newyear-crowd",
		season: "newyear",
		lines: [
			"It's busy in here for a Tuesday.",
			"New year. Give it three weeks.",
			"Be nice. We all started somewhere.",
		],
	},
	{
		id: "valentine-hearts",
		season: "valentine",
		lines: [
			"Hearts on the door again.",
			"I counted six. One is a barbell.",
			"That one is the real romance.",
		],
	},
	{
		id: "valentine-gift",
		season: "valentine",
		lines: [
			"Did you get anything for Valentine's.",
			"A rest day. From me, to me.",
			"Romantic. Do one more set.",
		],
	},
	{
		id: "clover-pots",
		season: "clover",
		lines: [
			"There are clovers by the door.",
			"Four leaves, supposedly.",
			"Three. I counted. Still lucky.",
		],
	},
	{
		id: "clover-luck",
		season: "clover",
		lines: [
			"I'm feeling lucky today.",
			"That's the pre-workout talking.",
			"Lucky enough for one more set.",
		],
	},
	{
		id: "spring-pots",
		season: "spring",
		lines: [
			"Someone put flowers by the door.",
			"They're real. I checked.",
			"You checked by pulling one.",
		],
	},
	{
		id: "spring-rain",
		season: "spring",
		lines: [
			"It rained all morning.",
			"Good. Nobody has an excuse to run outside.",
		],
	},
	{
		id: "harvest-basket",
		season: "harvest",
		lines: [
			"Someone left a basket of apples by the door.",
			"Is it a gift or a trap.",
			"Both, usually.",
		],
	},
	{
		id: "harvest-hay",
		season: "harvest",
		lines: [
			"There's hay in the lobby.",
			"It's atmosphere.",
			"It's in my shoe.",
		],
	},
	{
		id: "harvest-thanks",
		season: "harvest",
		lines: [
			"Grateful for the new rack, honestly.",
			"Grateful nobody's using the squat rack as a coat hook.",
		],
	},
	{
		id: "winter-tree",
		season: "winter",
		lines: [
			"They put up a tree. Next to the dumbbells.",
			"It's the only thing here that's not heavy.",
		],
	},
	{
		id: "winter-lights",
		season: "winter",
		lines: [
			"The lights blink out of time with my sets.",
			"Your sets are out of time with each other.",
		],
	},
	{
		id: "winter-resolution",
		season: "winter",
		lines: [
			"Everyone's already planning January.",
			"January is a long way off.",
			"That's the plan, yes.",
		],
	},
	{
		id: "room-dnd-die",
		arc: "dnd",
		lines: [
			"Why is Marcus carrying a twenty-sided die?",
			"He says it's for scheduling.",
			"Nobody has scheduled anything in a week.",
		],
	},
	{
		id: "room-dnd-whistle",
		arc: "dnd",
		lines: [
			"Rivera blew the whistle and said 'cleric moves first'.",
			"Moves first where?",
			"Nobody knows. We all moved.",
		],
	},
	{
		id: "room-dnd-closet",
		arc: "dnd",
		lines: [
			"Is there a mimic in the supply closet?",
			"Dr. Kim says only on Tuesdays.",
		],
	},
	{
		id: "room-lost-gloves",
		arc: "lost",
		lines: [
			"The lost-and-found box has three gloves now.",
			"That's not how gloves work.",
		],
	},
	{
		id: "room-lost-cooler",
		arc: "lost",
		lines: [
			"Jordan is interviewing the water cooler.",
			"Did it talk?",
			"It gurgled. He's treating that as a yes.",
		],
	},
	{
		id: "room-fad-bucket",
		arc: "fad",
		lines: [
			"Why is there a bucket in the staff room?",
			"Premium recovery. Jordan put a sticker on it.",
		],
	},
	{
		id: "room-fad-breath",
		arc: "fad",
		lines: [
			"Rivera is breathing very deliberately.",
			"Is that the fad?",
			"That's the fad. Don't speak. Exhale.",
		],
	},
	{
		id: "room-karaoke-rests",
		arc: "karaoke",
		lines: [
			"Someone's singing in the staff room.",
			"That's Marcus. He's practising the rests.",
			"I can hear the rests from here.",
		],
	},
	{
		id: "room-karaoke-derek",
		arc: "karaoke",
		lines: [
			"Derek signed up for karaoke.",
			"What's he singing?",
			"One word. We're all nervous.",
		],
	},
	{
		id: "room-smoothie-fridge",
		arc: "smoothie",
		lines: [
			"Don't touch the staff fridge.",
			"Is there a body in it?",
			"Worse. A smoothie with a smudged label.",
		],
	},
	{
		id: "room-smoothie-case",
		arc: "smoothie",
		lines: [
			"Dr. Kim is running an investigation.",
			"Into what?",
			"A smoothie. It's very serious.",
		],
	},
	{
		id: "room-meeting-days",
		arc: "meeting",
		lines: [
			"The staff meeting started on Monday.",
			"It's Wednesday.",
			"They're on item twenty-two. The thermostat.",
		],
	},
	{
		id: "room-meeting-minutes",
		arc: "meeting",
		lines: [
			"Is Alex still in that meeting?",
			"He's taking the minutes of the minutes.",
		],
	},
	{
		id: "maxout-promo-sign",
		when: "maxout",
		lines: [
			"MaxOut has a fifty percent off sign up.",
			"Fifty percent off of what, exactly.",
			"The contract, probably. Not the fine print.",
		],
	},
	{
		id: "maxout-promo-loyal",
		when: "maxout",
		lines: [
			"Half the street is queuing at MaxOut today.",
			"I'm staying. The lockers here close properly.",
		],
	},
	{
		id: "maxout-promo-tempted",
		when: "maxout",
		lines: [
			"I looked at the MaxOut promo for a full minute.",
			"And?",
			"Then I came back here and did my sets.",
		],
	},
	{
		id: "no-pool",
		missingRoom: "pool",
		lines: [
			"No lap pool. In this economy.",
			"I did ask. They said 'we have a treadmill'.",
		],
	},
	{
		id: "maxout-pool",
		missingRoom: "pool",
		lines: [
			"MaxOut across the street has a pool.",
			"MaxOut also has a contract nobody can read.",
		],
	},
	{
		id: "maxout-sauna",
		missingRoom: "recovery",
		lines: [
			"MaxOut has a sauna.",
			"Then go to MaxOut.",
			"Their towels are rented.",
		],
	},
	{
		id: "no-sauna",
		missingRoom: "recovery",
		lines: [
			"Where do I sit and think about my deadlift?",
			"Nowhere. That's the problem.",
		],
	},
	{
		id: "no-juice",
		missingRoom: "juice",
		lines: [
			"There's no juice bar.",
			"There's a water cooler.",
			"That's what I said.",
		],
	},
	{
		id: "no-ring",
		missingRoom: "boxing",
		lines: ["I'd box, but there's nowhere to box.", "You'd lose anyway."],
	},
	{
		id: "no-court",
		missingRoom: "court",
		lines: [
			"Zero hoops. I brought my own ball.",
			"You brought it to a gym with no hoop.",
			"It's a principle thing.",
		],
	},
	{
		id: "no-olympic",
		missingGear: "weights_olympic",
		lines: [
			"No Olympic platform. I'm doing my cleans on vibes.",
			"Your cleans are mostly vibes already.",
		],
	},
	{
		id: "no-cable",
		missingGear: "weights_cable",
		lines: [
			"A cable crossover would really round the place out.",
			"You've said 'round the place out' three times this week.",
		],
	},
	{
		id: "no-megaformer",
		missingGear: "lagree_megaformer",
		lines: [
			"A proper gym has a megaformer.",
			"Do you know what a megaformer does?",
			"Costs money, I think.",
		],
	},
	{
		id: "crowded-1",
		crowded: true,
		lines: ["Busy in here.", "Everyone has the same new year's resolution."],
	},
	{
		id: "crowded-2",
		crowded: true,
		lines: ["Are you using that?", "I'm resting.", "That's using it."],
	},
	{
		id: "event-1",
		when: "event",
		lines: [
			"Is that the event by the door?",
			"It's always the event by the door.",
			"I'm only here for the free water.",
		],
	},
	{
		id: "event-2",
		when: "event",
		lines: ["I'm not signing up.", "Nobody asked you to."],
	},
	{
		id: "class-1",
		when: "classes",
		lines: [
			"They're doing a class in there.",
			"Sounds painful.",
			"Sounds like a lot of counting.",
		],
	},
	{
		id: "class-2",
		when: "classes",
		lines: ["Class is full, isn't it.", "It's full of people who can bend."],
	},
	{
		id: "upgrade-1",
		when: "upgraded",
		lines: ["New gear.", "Smells like it too.", "Smells like money, mostly."],
	},
	{
		id: "upgrade-2",
		when: "upgraded",
		lines: [
			"Someone's been upgrading things.",
			"About time. The old one squeaked.",
		],
	},
	{
		id: "plain-1",
		lines: ["Third set?", "Second. The third one's a rumour."],
	},
	{
		id: "plain-2",
		lines: [
			"You've been on that a while.",
			"I'm in a flow state.",
			"You're scrolling.",
		],
	},
	{
		id: "plain-3",
		lines: ["Leg day tomorrow.", "You said that yesterday."],
	},
	{
		id: "plain-4",
		lines: [
			"I read protein timing doesn't matter.",
			"Then why are you holding a shaker at 10 am.",
		],
	},
]

/** Exchanges that fit `ctx` (specific ones first in the pool; the plain
 * ones are only a fallback so the gym's real gaps get talked about). */
export function banterFor(
	ctx: BanterContext,
	extra: readonly Banter[] = [],
): Banter[] {
	const fits = (b: Banter): boolean => {
		if (b.id.startsWith("maxout") && (ctx.campaign ?? 1) > 1) return false
		if (b.missingRoom && ctx.rooms.includes(b.missingRoom)) return false
		if (b.missingGear && ctx.gear.includes(b.missingGear)) return false
		if (b.crowded && !ctx.crowded) return false
		if (b.when && !ctx[b.when]) return false
		if (b.playIn && !ctx.playing?.includes(b.playIn)) return false
		if (b.season && b.season !== ctx.season) return false
		if (b.arc && b.arc !== ctx.roomArc) return false
		return true
	}
	const all = [...BANTER, ...extra].filter(fits)
	const specific = all.filter(
		(b) => b.missingRoom || b.missingGear || b.crowded || b.when || b.playIn,
	)
	return specific.length ? specific : all
}

/** One exchange for the gym as it is, not one of the `recent` ids when
 * another fits; null when nothing fits. */
export function pickBanter(
	ctx: BanterContext,
	recent: readonly string[],
	rng: Rng,
	extra: readonly Banter[] = [],
): Banter | null {
	const pool = banterFor(ctx, extra)
	if (!pool.length) return null
	const fresh = pool.filter((b) => !recent.includes(b.id))
	const from = fresh.length ? fresh : pool
	return from[Math.floor(rng() * from.length) % from.length]
}

/** What a member says on starting a set on upgraded gear (tier 2 or 3). */
export const GEAR_LINES: Readonly<Record<2 | 3, readonly string[]>> = {
	2: [
		"This one has a screen now.",
		"The new console is a step up.",
		"Better than the old one, honestly.",
	],
	3: [
		"Gold screen. Fancy.",
		"Okay, this one's actually nice.",
		"Speakers on a machine. Nobody asked, and thank you.",
	],
}

export function gearLine(tier: number, rng: Rng): string | null {
	const pool = GEAR_LINES[Math.min(3, tier) as 2 | 3]
	if (tier < 2 || !pool) return null
	return pool[Math.floor(rng() * pool.length) % pool.length]
}
