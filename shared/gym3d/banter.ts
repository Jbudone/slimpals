// Ambient banter: short scripted exchanges (2-3 lines) between two people
// standing near each other. Pure: the client picks one that fits the gym as
// it is now (a missing room or machine, a crowd) and plays it as alternating
// bubbles. Style: understated, specific, dry; no exclamation marks.
import type { Rng } from "./npcLines.js"

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
}

export type BanterWhen = "event" | "classes" | "upgraded"

export type Banter = {
	id: string
	/** Only when this room type does not exist yet. */
	missingRoom?: string
	/** Only when this gear is not placed anywhere. */
	missingGear?: string
	/** Only when the gym is busy. */
	crowded?: boolean
	/** Only while this is going on (an event, a class, a fresh upgrade). */
	when?: BanterWhen
	/** Lines in turn: the first person speaks first. */
	lines: readonly [string, string] | readonly [string, string, string]
}

export const BANTER: readonly Banter[] = [
	{
		id: "no-pool",
		missingRoom: "pool",
		lines: [
			"No lap pool. In this economy.",
			"I did ask. They said 'we have a treadmill'.",
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
export function banterFor(ctx: BanterContext): Banter[] {
	const fits = (b: Banter): boolean => {
		if (b.missingRoom && ctx.rooms.includes(b.missingRoom)) return false
		if (b.missingGear && ctx.gear.includes(b.missingGear)) return false
		if (b.crowded && !ctx.crowded) return false
		if (b.when && !ctx[b.when]) return false
		return true
	}
	const all = BANTER.filter(fits)
	const specific = all.filter(
		(b) => b.missingRoom || b.missingGear || b.crowded || b.when,
	)
	return specific.length ? specific : all
}

/** One exchange for the gym as it is, not one of the `recent` ids when
 * another fits; null when nothing fits. */
export function pickBanter(
	ctx: BanterContext,
	recent: readonly string[],
	rng: Rng,
): Banter | null {
	const pool = banterFor(ctx)
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
