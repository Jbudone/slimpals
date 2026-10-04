// The coach's speech bubble on the gym home (#125): a line in the voice of the
// chosen personality that fits what is going on (new gear, tasks left, all
// done, a streak milestone). Pure: the client passes what it knows and the
// ids of the lines it said recently, and gets a line it did not just say.
// Voices stay on the player's side: the roaster teases the habit, never the
// body, and nobody mentions weight.
import type { CoachPersonality } from "../types.js"
import type { Rng } from "./npcLines.js"
import type { Season } from "./season.js"

export type CoachVoice = CoachPersonality

export const COACH_NAMES: Record<CoachVoice, string> = {
	friendly: "Coach Sam",
	drill_sergeant: "Sarge",
	roaster: "The Roaster",
	anime_sensei: "Sensei",
	bro: "Bro",
}

/** A small seeded random source: the same seed always gives the same line, so
 * a bubble or card holds still until something changes. */
export function seededRng(seed: number): Rng {
	let x = (seed * 7919 + 13) >>> 0
	return () => {
		x = (Math.imul(x, 1664525) + 1013904223) >>> 0
		return x / 2 ** 32
	}
}

/** Where the player stands in this month's challenge. */
export type ChallengeStanding = {
	/** Day of the month, 1-based. */
	day: number
	/** Days in the month. */
	days: number
	/** Average completion of the goals, 0-1. */
	done: number
	/** The challenge is finished (nothing to nag about). */
	complete?: boolean
}

export type CoachContext = {
	/** The season dressing the gym: its lines now and then replace the task count. */
	season?: Season | null
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
	/** A joined challenge: its lines now and then replace the task count. */
	challenge?: ChallengeStanding
	/** Coins waiting in the gym's bubbles: a pile now and then gets a nudge. */
	coinsWaiting?: number
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
	| "coins"

/** Seasonal remarks, a couple per voice and season (no placeholders). */
const SEASON_LINES: Record<CoachVoice, Record<Season, readonly Variant[]>> = {
	friendly: {
		spring: [
			["Flowers by the door.", "A good month to start something small."],
			["April showers.", "Indoor sets are still sets."],
		],
		halloween: [
			["Spooky season.", "The ghost by the lobby is on our side. Mostly."],
			["Love the pumpkins.", "Let's earn some treats today."],
		],
		harvest: [
			["Harvest time.", "Good month to collect what you planted all year."],
			["Hay in the lobby.", "Cosy. Now, a few sets?"],
		],
		winter: [
			["The tree is up.", "Keep the streak going through the holidays."],
			["Lights are on.", "Warm up well, it's cold out there."],
		],
	},
	drill_sergeant: {
		spring: [
			["Spring is not a reason to loosen up.", "Tighten up."],
			["Flowers at the door.", "Do not stop to smell them. Move."],
		],
		halloween: [
			["Ghosts don't skip leg day.", "Neither do you."],
			["Pumpkins at the door.", "Orange is the colour of effort. Move."],
		],
		harvest: [
			["Harvest month.", "You reap what you rep. Get going."],
			["Hay bales are not seats.", "On your feet."],
		],
		winter: [
			["Holiday lights are not an excuse.", "Rest day is not a season."],
			["Cold out.", "Warm up longer and stay longer."],
		],
	},
	roaster: {
		spring: [
			["Flowers by the door.", "Prettier than your plank. Fix that."],
			["Spring cleaning.", "Start with the excuses."],
		],
		halloween: [
			["Nothing is scarier than your skipped streak.", "Fix it."],
			["A witch hat.", "Bold. Your form is still the scarier look."],
		],
		harvest: [
			["Hay and pumpkins.", "Your dedication is the only thing out of season."],
			["Thankful month.", "I'm thankful for your attendance. Let's keep it."],
		],
		winter: [
			[
				"Fairy lights on the dumbbells.",
				"They shine more than your effort. For now.",
			],
			["Resolutions in January.", "Why not start with a set today."],
		],
	},
	anime_sensei: {
		spring: [
			["The first blossoms open.", "Small starts bloom into habits."],
			["Rain on the roof.", "A calm mind finishes the set."],
		],
		halloween: [
			["The spirits visit.", "Even they train in silence."],
			["The lantern glows.", "Light the habit, not the fear."],
		],
		harvest: [
			["The leaves fall.", "The wise let go of excuses."],
			["Autumn is patient.", "So is progress."],
		],
		winter: [
			["Snow settles slowly.", "So does strength. Continue."],
			["Lights in the dark.", "A small habit is one too."],
		],
	},
	bro: {
		spring: [
			["Flowers at the door, bro.", "Fresh start, fresh sets."],
			["Spring vibes.", "Lighter layers, same effort. Let's go."],
		],
		halloween: [
			["Spooky szn, dude.", "Pumpkin shake after your sets."],
			["Ghost in the lobby.", "He spots better than Jordan."],
		],
		harvest: [
			["Harvest vibes.", "Hay bale, apples, gains. Perfect."],
			["Cosy season.", "Cosy sets. Let's go."],
		],
		winter: [
			["Tree's up, bro.", "Cocoa protein after, you earned it."],
			["Holiday lights.", "Keep the pump going, dude."],
		],
	},
}

/** A pile worth a nudge: from this many waiting coins the coach mentions them. */
export const COINS_PILE = 150

/** {n} = tasks left (with its noun), {gear} = the gear's name, {s} = the streak. */
const LINES: Record<CoachVoice, Record<Situation, readonly Variant[]>> = {
	friendly: {
		coins: [
			[
				"Your coins are piling up.",
				"There's {c} waiting in the gym. Collect them before they sit any longer.",
			],
			[
				"The till is full.",
				"{c} coins are waiting. A quick sweep and they're yours.",
			],
			[
				"Money's on the floor.",
				"{c} coins from the machines. Tap Collect all.",
			],
		],
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
		coins: [
			["Coins are idle, soldier.", "{c} sitting there. Collect them. Now."],
			["Unclaimed pay.", "{c} coins on the books. Go and collect your wages."],
			["Idle cash is wasted cash.", "{c} waiting. Move."],
		],
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
		coins: [
			[
				"Your gym earned {c} coins.",
				"It's been waiting. Like most of your promises. Collect it.",
			],
			[
				"{c} coins, uncollected.",
				"The machines work harder than you do. Pick it up.",
			],
			["Free money.", "{c} of it, and you walked past. Tap Collect all."],
		],
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
		coins: [
			[
				"The coins gather like leaves.",
				"{c} wait upon the floor. Gather them, and be at peace.",
			],
			[
				"Patience has paid you.",
				"{c} coins have ripened. Collect what the gym has grown.",
			],
			["A quiet harvest.", "{c} coins rest unclaimed. Bring them in."],
		],
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
		coins: [
			[
				"Bro, your gym's stacking.",
				"{c} coins just chilling. Collect all, easy.",
			],
			[
				"Coins are piling up, my guy.",
				"{c} waiting. Grab them before the next lift.",
			],
			[
				"That's {c} coins on the table.",
				"You're rich and you don't even know it. Tap Collect all.",
			],
		],
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
		.replace("{c}", (c.coinsWaiting ?? 0).toLocaleString("en-US"))
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
	// once in a while, when nothing urgent is up, the challenge gets the floor
	const chance = rng()
	if (
		c.challenge &&
		!c.challenge.complete &&
		(sit === "morning" || sit === "day" || sit === "evening") &&
		chance < 0.4
	)
		return challengeLineFor(voice, c.challenge, rng, recent)
	// the season, now and then, when nothing urgent is up
	if (
		c.season &&
		(sit === "morning" || sit === "day" || sit === "evening") &&
		rng() < 0.2
	) {
		const pool = SEASON_LINES[voice][c.season]
		const id = (i: number) => `${voice}:season-${c.season}:${i}`
		const fresh = pool
			.map((v, i) => ({ v, i }))
			.filter((x) => !recent.includes(id(x.i)))
		const from = fresh.length ? fresh : pool.map((v, i) => ({ v, i }))
		const pick = from[Math.floor(rng() * from.length) % from.length]
		return { id: id(pick.i), lead: pick.v[0], rest: pick.v[1] }
	}
	// a pile of waiting coins gets a nudge now and then, when nothing urgent is up
	const nudge =
		(c.coinsWaiting ?? 0) >= COINS_PILE &&
		sit !== "gear" &&
		sit !== "loading" &&
		rng() < 0.4
	const pool = LINES[voice][nudge ? "coins" : sit]
	const lineSit = nudge ? "coins" : sit
	const fresh = pool
		.map((v, i) => ({ v, id: `${voice}:${lineSit}:${i}` }))
		.filter((x) => !recent.includes(x.id))
	const from = fresh.length
		? fresh
		: pool.map((v, i) => ({ v, id: `${voice}:${lineSit}:${i}` }))
	const pick = from[Math.floor(rng() * from.length) % from.length]
	return {
		id: pick.id,
		lead: fill(pick.v[0], c),
		rest: fill(pick.v[1], c),
	}
}

/** Every line template, for tests and the content tuning page. */
export function allCoachLines(): { id: string; lead: string; rest: string }[] {
	return COACH_VOICES.flatMap((voice) => [
		...(Object.keys(LINES[voice]) as Situation[]).flatMap((sit) =>
			LINES[voice][sit].map((v, i) => ({
				id: `${voice}:${sit}:${i}`,
				lead: v[0],
				rest: v[1],
			})),
		),
		...(Object.keys(SEASON_LINES[voice]) as Season[]).flatMap((se) =>
			SEASON_LINES[voice][se].map((v, i) => ({
				id: `${voice}:season-${se}:${i}`,
				lead: v[0],
				rest: v[1],
			})),
		),
	])
}

// ── challenge commentary ───────────────────────────────────────────────────

export type ChallengeStage = "start" | "ahead" | "on" | "behind" | "finale"

/** Where the standing falls: the first and last days get their own lines,
 * otherwise ahead / on track / behind the month's pace. */
export function challengeStage(c: ChallengeStanding): ChallengeStage {
	if (c.day <= 2) return "start"
	if (c.days - c.day <= 2) return "finale"
	const elapsed = c.day / c.days
	if (c.done >= elapsed + 0.1) return "ahead"
	if (c.done < elapsed - 0.15) return "behind"
	return "on"
}

/** {d} = days left in the month. */
const CHALLENGE_LINES: Record<
	CoachVoice,
	Record<ChallengeStage, readonly Variant[]>
> = {
	friendly: {
		start: [
			["A fresh challenge.", "{d} days to go. Small steps add up."],
			["Here we go.", "One day at a time and you'll get there."],
		],
		ahead: [
			["You're ahead of pace.", "Keep it easy and steady. {d} days left."],
			["Look at you go.", "Ahead of the month already."],
		],
		on: [
			["Right on track.", "Keep doing what you're doing. {d} days left."],
			["Steady progress.", "The challenge is going well."],
		],
		behind: [
			[
				"A little behind, no stress.",
				"A good day catches you up. {d} days left.",
			],
			["Still plenty of time.", "Pick one goal and do that today."],
		],
		finale: [
			["Final stretch.", "{d} days left. You've got this."],
			["Almost there.", "Finish strong, I'm cheering for you."],
		],
	},
	drill_sergeant: {
		start: [
			["New challenge, recruit.", "{d} days. Make them count."],
			["Day one.", "Set the pace now."],
		],
		ahead: [
			["Ahead of schedule.", "Don't ease off. {d} days left."],
			["Good pace.", "Hold it."],
		],
		on: [
			["On schedule.", "Maintain. {d} days left."],
			["Holding steady.", "Keep your head down and work."],
		],
		behind: [
			["You're behind.", "Close the gap today. {d} days left."],
			["Falling short of pace.", "Fix it. One goal, right now."],
		],
		finale: [
			["Final days.", "{d} left. Leave nothing on the table."],
			["Last push.", "Finish the mission."],
		],
	},
	roaster: {
		start: [
			["A brand-new challenge.", "Bold of you to join. {d} days, no pressure."],
			[
				"Day one of a month of effort.",
				"Let's see how long the motivation lasts.",
			],
		],
		ahead: [
			["Ahead of pace?", "Who gave you permission. {d} days left."],
			["Overachiever.", "Save some effort for the rest of us."],
		],
		on: [
			["Right on pace.", "Aggressively average. I mean that nicely."],
			["Holding steady.", "Quietly doing fine. Suspicious."],
		],
		behind: [
			[
				"Little behind, huh.",
				"{d} days left. The goals are not going anywhere.",
			],
			["The challenge misses you.", "Do one thing today. Anything."],
		],
		finale: [
			["Deadline energy.", "{d} days left. This is your moment."],
			["The final stretch.", "Procrastinators do their best work now."],
		],
	},
	anime_sensei: {
		start: [
			["A new trial begins.", "{d} days lie ahead. Walk them well."],
			["The first step.", "Every master began here."],
		],
		ahead: [
			["You walk ahead of the path.", "Do not rush. {d} days remain."],
			["Swift, but steady.", "Your discipline shows."],
		],
		on: [
			["Your pace is true.", "Continue. {d} days remain."],
			["Steady as the river.", "The challenge bends to patience."],
		],
		behind: [
			[
				"The path winds behind you.",
				"A single good day returns you to it. {d} remain.",
			],
			["Do not despair.", "Begin again today."],
		],
		finale: [
			["The final days.", "{d} remain. Show what you have learned."],
			["The summit is near.", "Finish what you began."],
		],
	},
	bro: {
		start: [
			["New challenge, let's go.", "{d} days. We're getting this done."],
			["Day one, bro.", "Strong start, strong month."],
		],
		ahead: [
			["Ahead of pace, nice.", "Keep cooking. {d} days left."],
			["Crushing it.", "You're ahead of the month."],
		],
		on: [
			["Right on pace.", "Solid. {d} days left."],
			["Steady gains.", "Keep stacking days."],
		],
		behind: [
			["Little behind, no biggie.", "One good day and you're back. {d} left."],
			["Time to catch up.", "Pick one goal and smash it today."],
		],
		finale: [
			["Final stretch, bro.", "{d} days. Finish strong."],
			["Home stretch.", "Don't coast now."],
		],
	},
}

/** The coach's remark on the monthly challenge. `rng` picks among a stage's
 * lines; the Challenges page seeds it by day so the line holds all day. */
export function challengeLineFor(
	voice: CoachVoice,
	c: ChallengeStanding,
	rng: Rng,
	recent: readonly string[] = [],
): CoachSay {
	const stage = challengeStage(c)
	const pool = CHALLENGE_LINES[voice][stage].map((v, i) => ({
		v,
		id: `${voice}:challenge-${stage}:${i}`,
	}))
	const fresh = pool.filter((x) => !recent.includes(x.id))
	const from = fresh.length ? fresh : pool
	const pick = from[Math.floor(rng() * from.length) % from.length]
	const left = String(Math.max(0, c.days - c.day))
	const f = (t: string) => t.replace("{d}", left)
	return { id: pick.id, lead: f(pick.v[0]), rest: f(pick.v[1]) }
}

export function allChallengeLines(): {
	id: string
	lead: string
	rest: string
}[] {
	return COACH_VOICES.flatMap((voice) =>
		(Object.keys(CHALLENGE_LINES[voice]) as ChallengeStage[]).flatMap((st) =>
			CHALLENGE_LINES[voice][st].map((v, i) => ({
				id: `${voice}:challenge-${st}:${i}`,
				lead: v[0],
				rest: v[1],
			})),
		),
	)
}
