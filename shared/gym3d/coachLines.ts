// The coach's speech bubble on the gym home (#125): a line in the voice of the
// chosen personality that fits what is going on (new gear, tasks left, all
// done, a streak milestone). Pure: the client passes what it knows and the
// ids of the lines it said recently, and gets a line it did not just say.
// Voices stay on the player's side: the roaster teases the habit, never the
// body, and nobody mentions weight.
import type { CoachPersonality } from "../types.js"
import type { Rng } from "./npcLines.js"

export type CoachVoice = CoachPersonality

export type CoachContext = {
	/** Tasks left today (check-in included). */
	left: number
	/** Today's tasks in all. */
	total: number
	/** Today's missions and counts have loaded. */
	loaded: boolean
	/** Name of unlocked gear waiting to be placed. */
	pendingGear?: string
	/** Current check-in streak in days. */
	streak?: number
	/** Local hour 0-23. */
	hour: number
}

export type CoachSay = { id: string; lead: string; rest: string }

type Variant = readonly [lead: string, rest: string]
type Situation =
	| "gear"
	| "loading"
	| "done"
	| "streak"
	| "morning"
	| "day"
	| "evening"

/** {n} = tasks left (with its noun), {gear} = the gear's name, {s} = the streak. */
const LINES: Record<CoachVoice, Record<Situation, readonly Variant[]>> = {
	friendly: {
		gear: [
			["New gear!", "{gear} is unlocked. Tap Place it and the crew builds it."],
			["Look what you earned.", "{gear} is ready to place."],
			["The crew is excited.", "{gear} is waiting for a spot."],
		],
		loading: [
			["Hey!", "Your gym is open. Let's get moving."],
			["Welcome back.", "Everything is where you left it."],
		],
		done: [
			[
				"All done today.",
				"Your gym is buzzing. Tap the coin bubbles to collect.",
			],
			["That's the day.", "Nicely done. The coins will keep piling up."],
			["Everything ticked.", "Go enjoy the rest of your day."],
		],
		streak: [
			["{s} days in a row.", "That is a real habit now. Proud of you."],
			["{s}-day streak.", "Look at you showing up."],
		],
		morning: [
			[
				"Morning!",
				"{n} left today. Every one you tick makes the gym stronger.",
			],
			["Good morning.", "{n} to go. Start with the easy one."],
		],
		day: [
			["Hey!", "{n} left today. Every one you tick makes the gym stronger."],
			["Afternoon.", "{n} still open. A small one counts."],
		],
		evening: [
			["Evening!", "{n} left today. There is still time."],
			["Hey you.", "{n} left before the day ends. One at a time."],
		],
	},
	drill_sergeant: {
		gear: [
			["New equipment, recruit.", "{gear} is unlocked. Place it. Now."],
			["Gear's in.", "{gear}. Assign it a spot."],
			["Supply drop.", "{gear} is ready. Put it to work."],
		],
		loading: [
			["On your feet.", "The gym is open. Report in."],
			["Roll call.", "Let's see what you've got today."],
		],
		done: [
			["Day complete.", "Dismissed. Collect your coins."],
			["Mission accomplished.", "Good work. Rest, then do it again tomorrow."],
			["All tasks done.", "That is how it's done. At ease."],
		],
		streak: [
			["{s} days straight.", "That is discipline. Keep it up."],
			["{s}-day streak.", "Don't you dare break it now."],
		],
		morning: [
			["Up and at it.", "{n} on the board. Move."],
			["Reveille.", "{n} left. Clock's running."],
		],
		day: [
			["Midday check.", "{n} still open. No excuses."],
			["Status report.", "{n} left. Get after it."],
		],
		evening: [
			["Last light.", "{n} left. Finish what you started."],
			["Evening inspection.", "{n} outstanding. Close them out."],
		],
	},
	roaster: {
		gear: [
			[
				"Oh, new gear.",
				"{gear} is unlocked. Try to use it for more than a photo.",
			],
			[
				"Fancy.",
				"{gear} is here. Place it before it gets jealous of the old stuff.",
			],
			["Look at you earning things.", "{gear} is waiting for a home."],
		],
		loading: [
			["Oh, you're here.", "Gym's open. Try not to look surprised."],
			["Back again.", "I had a bet you'd show up. I lost, happily."],
		],
		done: [
			["All done?", "Suspiciously responsible of you. Go collect your coins."],
			["Wow, finished.", "I have nothing to tease you about. It's unsettling."],
			["Day cleared.", "Fine. You win this one."],
		],
		streak: [
			[
				"{s} days in a row.",
				"Who are you and what did you do with the couch person?",
			],
			["{s}-day streak.", "Okay, okay. I'm a little impressed."],
		],
		morning: [
			["Morning, champ.", "{n} left. They won't tick themselves."],
			["Early bird.", "{n} to go. Don't let it go to your head."],
		],
		day: [
			["Hey, remember me?", "{n} left today. Just a gentle nudge."],
			["Still here?", "{n} open. The gym is looking at you."],
		],
		evening: [
			["Evening.", "{n} left. Procrastination is a lifestyle, I see."],
			["Cutting it fine.", "{n} left before midnight. Bold strategy."],
		],
	},
	anime_sensei: {
		gear: [
			["A new tool appears.", "{gear} has awakened. Place it, young one."],
			["The forge has spoken.", "{gear} awaits its place."],
			["Your training bears fruit.", "{gear} is yours. Use it wisely."],
		],
		loading: [
			["Welcome, student.", "The dojo is open. Begin."],
			["A new day dawns.", "Your gym awaits."],
		],
		done: [
			["The day's training is complete.", "Rest. Collect your coins."],
			["Well done, student.", "Balance achieved today."],
			["Every task fulfilled.", "The path continues tomorrow."],
		],
		streak: [
			["{s} days without fail.", "Your resolve is becoming your strength."],
			["{s}-day streak.", "The river carves the canyon one day at a time."],
		],
		morning: [
			["The sun rises.", "{n} left today. Begin with a calm mind."],
			["A morning for the disciplined.", "{n} remain."],
		],
		day: [
			["The day is half spent.", "{n} remain. Move with purpose."],
			["Steady, student.", "{n} left. One step at a time."],
		],
		evening: [
			["Dusk approaches.", "{n} remain. Finish before the light fades."],
			["The day winds down.", "{n} left. There is still time."],
		],
	},
	bro: {
		gear: [
			["Yo, new gear!", "{gear} just dropped. Place it, let's go."],
			["Dude.", "{gear} is unlocked. That's sick."],
			["New toy alert.", "{gear} is ready. Pick a spot."],
		],
		loading: [
			["Yooo.", "Gym's open. Let's get after it."],
			["There he is.", "Ready when you are, bro."],
		],
		done: [
			["Day crushed.", "Go grab those coins, you earned it."],
			["That's what I'm talking about.", "All done. Legend behavior."],
			["Total beast.", "Everything ticked. Chill out now."],
		],
		streak: [
			["{s} days straight, bro.", "That's the real gains."],
			["{s}-day streak.", "Keep stacking those days, dude."],
		],
		morning: [
			["Morning, bro.", "{n} left. Let's get this bread."],
			["Rise and grind.", "{n} to go. Easy work."],
		],
		day: [
			["Sup.", "{n} left today. Quick ones, let's go."],
			["Hey hey.", "{n} left. You got this."],
		],
		evening: [
			["Evening, bro.", "{n} left. Finish strong."],
			["Almost there.", "{n} left. Tick 'em off, dude."],
		],
	},
}

/** Streaks worth a comment (a day count that is exactly one of these). */
export const STREAK_MILESTONES: readonly number[] = [
	3, 7, 14, 21, 30, 50, 60, 100, 200, 365,
]

export const COACH_VOICES = Object.keys(LINES) as CoachVoice[]

export function isCoachVoice(v: string | undefined): v is CoachVoice {
	return !!v && v in LINES
}

function situationOf(c: CoachContext): Situation {
	if (c.pendingGear) return "gear"
	if (!c.loaded) return "loading"
	if (c.left <= 0) return "done"
	if (c.streak && STREAK_MILESTONES.includes(c.streak)) return "streak"
	return c.hour < 12 ? "morning" : c.hour < 18 ? "day" : "evening"
}

function fill(text: string, c: CoachContext): string {
	return text
		.replace("{n}", `${c.left} task${c.left === 1 ? "" : "s"}`)
		.replace("{gear}", c.pendingGear ?? "New gear")
		.replace("{s}", String(c.streak ?? 0))
}

/** A line for the situation that is not one of the `recent` ids when it can
 * avoid it. The id names voice, situation and variant. */
export function coachLineFor(
	voice: CoachVoice,
	c: CoachContext,
	recent: readonly string[],
	rng: Rng,
): CoachSay {
	const sit = situationOf(c)
	const pool = LINES[voice][sit]
	const fresh = pool
		.map((v, i) => ({ v, id: `${voice}:${sit}:${i}` }))
		.filter((x) => !recent.includes(x.id))
	const from = fresh.length
		? fresh
		: pool.map((v, i) => ({ v, id: `${voice}:${sit}:${i}` }))
	const pick = from[Math.floor(rng() * from.length) % from.length]
	return {
		id: pick.id,
		lead: fill(pick.v[0], c),
		rest: fill(pick.v[1], c),
	}
}

/** Every line template, for tests and the content tuning page. */
export function allCoachLines(): { id: string; lead: string; rest: string }[] {
	return COACH_VOICES.flatMap((voice) =>
		(Object.keys(LINES[voice]) as Situation[]).flatMap((sit) =>
			LINES[voice][sit].map((v, i) => ({
				id: `${voice}:${sit}:${i}`,
				lead: v[0],
				rest: v[1],
			})),
		),
	)
}
