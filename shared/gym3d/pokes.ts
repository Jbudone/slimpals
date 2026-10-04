// What a person does when the player taps them (the gym's toy, not a menu):
// a hop and now and then a line, escalating if the player keeps poking, and
// on the right machine a goofy stumble. Pure: the 3D side plays the effect.
// A person's stat card is a long press now, so taps can be quick and silly.

export type PokeWho = "treadmill" | "worker" | "staff" | "member" | "ghost"
export type PokeEffect = "hop" | "trip" | "spin"

export type PokeResult = {
	effect: PokeEffect
	/** What they say (null: nothing this time). */
	line: string | null
	/** The poke count starts over (a spin or a stumble settles things). */
	reset: boolean
}

/** Pokes this close together (ms) count as one run. */
export const POKE_GAP_MS = 1400

const GREET: readonly string[] = [
	"Hey there.",
	"Oh, hi.",
	"Yes? I'm listening.",
	"Morning. Or whatever time it is.",
]
const PLAYFUL: readonly string[] = [
	"Was that a poke?",
	"I felt that.",
	"Ticklish. Careful.",
	"We're doing this, then.",
]
const ANNOYED: readonly string[] = [
	"Okay, okay. Hello.",
	"You know I can see you, right?",
	"Any minute now I will ask for a tip.",
	"I have a job, you know.",
]
const DIZZY: readonly string[] = [
	"Whoa. Room's spinning.",
	"I need to sit down for a second.",
	"Stop. I'm getting dizzy.",
]
const STAFF_GREET: readonly string[] = [
	"Need something? I'm right here.",
	"On shift, as ever.",
	"You can long press for my card.",
]
const GHOST: readonly string[] = [
	"Boo.",
	"Careful. I bite. Not really.",
	"Whoooo. That is my name.",
	"I was haunting that spot.",
]
const GHOST_SPIN: readonly string[] = [
	"Wheee. Haunting, but faster.",
	"Spinning is how ghosts nap.",
]
const TREADMILL_TRIP: readonly string[] = [
	"Whoa, whoa, whoa!",
	"The belt moved first, I swear.",
	"That was on purpose. I meant to do that.",
	"Nobody saw that. Nobody.",
]
const WORKER_TRIP: readonly string[] = [
	"Okay, that plate slipped.",
	"My foot is fine. My pride, less so.",
	"Did anyone see that?",
]

const pick = (a: readonly string[], seed: number): string =>
	a[Math.abs(seed) % a.length] as string

/** What the `n`th poke (1-based, within a run) does. `roll` is 0..1 and
 * `seed` any integer, so tests can pin both. */
export function pokeResult(
	who: PokeWho,
	n: number,
	roll: number,
	seed: number,
): PokeResult {
	if (who === "treadmill" || who === "worker") {
		// the third poke or later on a treadmill, the fifth on other gear: a
		// stumble (always at the sixth)
		const at = who === "treadmill" ? 3 : 5
		if (n >= 6 || (n >= at && roll < 0.45))
			return {
				effect: "trip",
				line: pick(who === "treadmill" ? TREADMILL_TRIP : WORKER_TRIP, seed),
				reset: true,
			}
		// below that the hustle lines speak for them
		return { effect: "hop", line: null, reset: false }
	}
	if (who === "ghost") {
		if (n >= 5)
			return { effect: "spin", line: pick(GHOST_SPIN, seed), reset: true }
		return {
			effect: "hop",
			line: n === 1 || roll < 0.6 ? pick(GHOST, seed + n) : null,
			reset: false,
		}
	}
	if (n >= 6) return { effect: "spin", line: pick(DIZZY, seed), reset: true }
	if (n >= 4)
		return { effect: "hop", line: pick(ANNOYED, seed + n), reset: false }
	if (n >= 2)
		return {
			effect: "hop",
			line: roll < 0.7 ? pick(PLAYFUL, seed + n) : null,
			reset: false,
		}
	return {
		effect: "hop",
		line: roll < 0.6 ? pick(who === "staff" ? STAFF_GREET : GREET, seed) : null,
		reset: false,
	}
}

/** Every line, for the tone test. */
export const ALL_POKE_LINES: readonly string[] = [
	...GREET,
	...PLAYFUL,
	...ANNOYED,
	...DIZZY,
	...STAFF_GREET,
	...GHOST,
	...GHOST_SPIN,
	...TREADMILL_TRIP,
	...WORKER_TRIP,
]
