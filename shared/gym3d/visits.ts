// Little trips people make around the gym: the October ghost haunting someone
// in another room (a prank), and staff walking over to a member who is
// working out (a round). Pure: the 3D side walks them there and plays it.
// Style: dry and kind, no exclamation marks, nothing about bodies.

import type { Rng } from "./npcLines.js"

export type PrankEffect = "hop" | "spin" | "trip"

export type Prank = {
	id: string
	/** What the ghost says. */
	ghost: string
	/** What the victim says back. */
	victim: string
	effect: PrankEffect
	/** Only on a treadmill. */
	treadmill?: boolean
}

export const PRANKS: readonly Prank[] = [
	{
		id: "boo",
		ghost: "Boo.",
		victim: "Who left a draft on my neck.",
		effect: "hop",
	},
	{
		id: "cold",
		ghost: "Cold spot. You are welcome.",
		victim: "Is it me or did it just get chilly.",
		effect: "hop",
	},
	{
		id: "towel",
		ghost: "Borrowing your towel.",
		victim: "My towel just moved. On its own.",
		effect: "hop",
	},
	{
		id: "spin",
		ghost: "Spinning you round.",
		victim: "Okay, the room is spinning.",
		effect: "spin",
	},
	{
		id: "praise",
		ghost: "Lovely form. Whoooo.",
		victim: "Did something just compliment my set.",
		effect: "hop",
	},
	{
		id: "belt",
		ghost: "Mind the belt.",
		victim: "The belt sped up by itself. I swear.",
		effect: "trip",
		treadmill: true,
	},
]

/** A prank that fits the victim, not one of the `recent` ids when another
 * fits. */
export function pickPrank(
	onTreadmill: boolean,
	recent: readonly string[],
	rng: Rng,
): Prank {
	const fits = PRANKS.filter((p) => !p.treadmill || onTreadmill)
	const fresh = fits.filter((p) => !recent.includes(p.id))
	const from = fresh.length ? fresh : fits
	return from[Math.floor(rng() * from.length) % from.length] as Prank
}

/** Seconds between the ghost's trips to someone. */
export const HAUNT_EVERY: readonly [number, number] = [28, 50]
/** Seconds between staff rounds (any one of them). */
export const ROUND_EVERY: readonly [number, number] = [30, 60]
/** Seconds a visitor stays beside the person they came to see. */
export const VISIT_DWELL = 4.5

/** A random delay in `range` seconds. */
export function delayIn(range: readonly [number, number], rng: Rng): number {
	return range[0] + rng() * (range[1] - range[0])
}

export type RoundRole =
	| "coach"
	| "trainer"
	| "nutritionist"
	| "manager"
	| "staff"

/** What a staff member says to the member they stop by, by role. */
export const ROUND_TIPS: Readonly<Record<RoundRole, readonly string[]>> = {
	coach: [
		"Chest up. Good.",
		"Nice and steady. Keep going.",
		"Breathe out on the effort.",
	],
	trainer: [
		"Looking solid. Two more.",
		"Watch your knees. That is it.",
		"Slow on the way down. Perfect.",
	],
	nutritionist: [
		"Water after this one.",
		"Remember to eat something real today.",
		"Good work. Rest is part of it.",
	],
	manager: [
		"Everything alright over here.",
		"Shout if anything needs fixing.",
		"Glad you came in today.",
	],
	staff: [
		"Need anything. Just ask.",
		"Take your time with it.",
		"Looking good. Carry on.",
	],
}

/** What the member says back. */
export const ROUND_REPLIES: readonly string[] = [
	"Thanks.",
	"Will do.",
	"Appreciated.",
	"On it.",
]

/** The role a named person plays on a round (by their NPC key or title). */
export function roundRoleOf(
	npcKey: string | null,
	role: string | null,
): RoundRole {
	const k = `${npcKey ?? ""} ${role ?? ""}`.toLowerCase()
	if (k.includes("coach")) return "coach"
	if (k.includes("nutrition") || k.includes("kim")) return "nutritionist"
	if (k.includes("manager") || k.includes("alex")) return "manager"
	if (k.includes("trainer")) return "trainer"
	return "staff"
}

export function roundTip(role: RoundRole, rng: Rng): string {
	const a = ROUND_TIPS[role]
	return a[Math.floor(rng() * a.length) % a.length] as string
}

export function roundReply(rng: Rng): string {
	return ROUND_REPLIES[
		Math.floor(rng() * ROUND_REPLIES.length) % ROUND_REPLIES.length
	] as string
}

/** Every line, for the tone test. */
export const ALL_VISIT_LINES: readonly string[] = [
	...PRANKS.flatMap((p) => [p.ghost, p.victim]),
	...Object.values(ROUND_TIPS).flat(),
	...ROUND_REPLIES,
]
