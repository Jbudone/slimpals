// The 3D gym's economy in one config object, so balancing is a one-file
// change. Pure: the server charges and pays with these functions and the
// client shows the same numbers.
//
// Three currencies (gym3d home):
// - Coins: the gym's own idle income. Busy machines, the reception desk
//   (per member arrival) and the Slim Kitchen fill coin bubbles over time;
//   the player taps them to collect. Coins buy plots, gear upgrades and
//   kitchen nothing (Greens do that). Computed lazily on the server from
//   the time since the last collect, capped per source.
// - Sweat: earned only by exercise tasks. 1 Sweat takes 1h off a build job;
//   finishing a job costs ceil(remaining hours) Sweat.
// - Greens: earned only by diet tasks. They unlock Slim Kitchen menu items
//   (more coins per hour) and start its rush hour.
//
// Where Sweat and Greens come from (see REWARDS and `taskReward`):
// - A daily mission of kind "exercise" pays Sweat, of kind "diet" pays
//   Greens, by difficulty: easy 1, medium 2, hard 3. Weekly missions pay
//   double (2 / 4 / 6). Missions of kind "other" pay XP only. A mission's
//   kind is picked by the player (the form guesses it from the title, see
//   `guessMissionKind`); existing missions were backfilled the same way.
// - Snapping a meal (food photo) pays 1 Green, once per meal type per day
//   (breakfast, lunch, dinner, snack: at most 4 a day).
// - Logging your weight pays 1 Green, once per day.
// - Water, a calorie target, steps and workouts are tracked as missions
//   (the Today list suggests them), so they pay through the mission rule.
// - The daily check-in pays XP and the streak only.
// Every payout is recorded once per activity (table gym_rewards, unique per
// gym + source such as `mission:12:2026-09-28`), so un-ticking and ticking
// again never pays twice, and un-ticking takes nothing back.
import { LV_TH } from "./rooms.js"

export type LotShape = "normal" | "wide" | "L" | "big"
export type TaskKind = "exercise" | "diet" | "other"
export type Difficulty = "easy" | "medium" | "hard"

/** Slim Kitchen menu, in bit order (bit i of user_gyms.kitchen_menu). */
export const KITCHEN_MENU = [
	{ key: "green", name: "Green smoothie", rate: 8, cost: 0 },
	{ key: "protein", name: "Protein shake", rate: 6, cost: 2 },
	{ key: "acai", name: "Açaí bowl", rate: 9, cost: 4 },
	{ key: "salad", name: "Power salad", rate: 12, cost: 6 },
] as const

export type KitchenItemKey = (typeof KITCHEN_MENU)[number]["key"]

export const ECONOMY = {
	/** One-time grant when a gym's 3D layout is first read. */
	starterCoins: 1500,
	starterSweat: 3,
	starterGreens: 2,
	rewards: {
		/** Sweat (exercise) or Greens (diet) per mission, by difficulty. */
		daily: { easy: 1, medium: 2, hard: 3 },
		weekly: { easy: 2, medium: 4, hard: 6 },
		/** Greens per meal photo (once per meal type and day). */
		mealGreens: 1,
		/** Greens for logging your weight (once per day). */
		weightGreens: 1,
	},
	sweat: {
		/** Hours one Sweat takes off a job. */
		hoursPerSweat: 1,
	},
	income: {
		/** A placed, working machine: coins per hour and bubble cap by tier. */
		machine: {
			rate: { 1: 4, 2: 6, 3: 9 } as Readonly<Record<number, number>>,
			cap: { 1: 32, 2: 48, 3: 72 } as Readonly<Record<number, number>>,
		},
		/** The reception desk: every member who arrives pays at the desk.
		 * Arrivals per hour grow with the finished rooms. */
		desk: {
			coinsPerMember: 2,
			membersPerHour: 3,
			membersPerRoom: 1,
			cap: 100,
		},
		kitchen: {
			cap: 120,
			/** Coins a sale brings on average ("smoothies sold"). */
			coinsPerSale: 3,
			rush: { greens: 1, hours: 2, mult: 2 },
		},
		/** A "Welcome back" card when the gym was last opened this long ago. */
		welcomeBackHours: 4,
	},
	plot: {
		/** Price of the first plot; each plot bought adds `step`. */
		base: 1200,
		step: 700,
		roundTo: 50,
		shapes: {
			normal: { mult: 1, hours: 4 },
			wide: { mult: 1.7, hours: 4 },
			L: { mult: 2.2, hours: 4 },
			big: { mult: 2.8, hours: 5 },
		} satisfies Record<LotShape, { mult: number; hours: number }>,
	},
	upgrade: {
		maxTier: 3,
		roundTo: 10,
		/** Cost = gear value x factor; build time in hours. */
		tiers: {
			2: { factor: 0.6, hours: 3 },
			3: { factor: 1.0, hours: 6 },
		} as Readonly<Record<number, { factor: number; hours: number }>>,
		/** Gear values from the Build Lab's catalog prices. */
		gearValue: {
			cardio_treadmill: 300,
			cardio_bikes: 380,
			cardio_rowing: 340,
			cardio_stairs: 420,
			cardio_cinema: 650,
			lagree_megaformer: 700,
			weights_dumbbells: 280,
			weights_barbell: 320,
			weights_smith: 560,
			weights_olympic: 520,
			weights_cable: 600,
			punching_bags_heavy_bag_row: 380,
			punching_bags_double_end: 240,
			boxing_mitts_station: 300,
			boxing_ring: 1400,
			hero_spotlight_stage: 900,
			swimming_lap_pool: 1800,
			swimming_poolside_loungers: 220,
			amenity_sauna: 950,
			amenity_showers: 420,
			amenity_juice: 600,
			amenity_water: 90,
			staff_massage: 680,
			staff_physio: 720,
			staff_nutrition: 480,
			staff_trainer: 650,
			staff_ownership_suite: 1200,
		} as Readonly<Record<string, number>>,
		defaultGearValue: 400,
	},
} as const

const HOUR = 3_600_000

export function plotPrice(shape: LotShape, plotsBought: number): number {
	const p = ECONOMY.plot
	const raw =
		(p.base + p.step * Math.max(0, plotsBought)) * p.shapes[shape].mult
	return Math.round(raw / p.roundTo) * p.roundTo
}

export function plotHours(shape: LotShape): number {
	return ECONOMY.plot.shapes[shape].hours
}

/** Cost and build time of upgrading a piece from `tier` to tier + 1, or
 * null at max tier. */
export function upgradeInfo(
	itemKey: string,
	tier: number,
): { toTier: number; cost: number; hours: number } | null {
	const u = ECONOMY.upgrade
	const toTier = tier + 1
	const t = u.tiers[toTier]
	if (!t || tier < 1 || toTier > u.maxTier) return null
	const value = u.gearValue[itemKey] ?? u.defaultGearValue
	return {
		toTier,
		cost: Math.round((value * t.factor) / u.roundTo) * u.roundTo,
		hours: t.hours,
	}
}

/** Sweat to finish a job now: one per remaining hour, rounded up. */
export function finishCost(remainingMs: number): number {
	if (remainingMs <= 0) return 0
	// a second of rounding never costs a whole extra Sweat
	const h =
		Math.max(0, remainingMs - 1000) / (HOUR * ECONOMY.sweat.hoursPerSweat)
	return Math.max(1, Math.ceil(h))
}

export function hoursMs(h: number): number {
	return h * HOUR
}

/** Room points: every piece on a spot scores its tier. */
export function roomPoints(tiers: Iterable<number>): number {
	let n = 0
	for (const t of tiers) n += t
	return n
}

/** Room level (1..5) reached with `points` (the prototype's LV_TH). */
export function levelFromPoints(points: number): number {
	let lv = 1
	for (let k = 2; k <= 5; k++) if (points >= (LV_TH[k] ?? Infinity)) lv = k
	return lv
}

/** Progress towards the next level, for the room badge. */
export function levelProgress(
	level: number,
	points: number,
): { next: number | null; prev: number; k: number } {
	const next = LV_TH[level + 1] ?? null
	const prev = LV_TH[level] ?? 0
	if (next == null) return { next: null, prev, k: 1 }
	return {
		next,
		prev,
		k: Math.max(0, Math.min(1, (points - prev) / Math.max(1, next - prev))),
	}
}

// Paint palettes (the prototype's WALLS / FSTYLES / FTINTS). The room-type
// defaults in PAINT are allowed too, so a repaint can always go back.
export const WALL_COLORS: readonly string[] = [
	"#f4c9a0",
	"#9fd3cf",
	"#bfe3f0",
	"#e6d6f0",
	"#f7d38a",
	"#f2a98f",
	"#cfd6c4",
	"#fff1e0",
	"#5a6a8a",
]
export const FLOOR_TINTS: readonly string[] = [
	"#f3e3cc",
	"#c98b56",
	"#4a5060",
	"#d6eef4",
	"#f6e6c8",
	"#6a3a3f",
	"#cfe3c4",
]

// ── Sweat and Greens ─────────────────────────────────────────────────────────

/** What a mission pays on top of its XP. */
export function taskReward(
	kind: TaskKind,
	cadence: "daily" | "weekly",
	difficulty: Difficulty,
): { sweat: number; greens: number } {
	const n = ECONOMY.rewards[cadence][difficulty] ?? 0
	if (kind === "exercise") return { sweat: n, greens: 0 }
	if (kind === "diet") return { sweat: 0, greens: n }
	return { sweat: 0, greens: 0 }
}

// Word starts (so "breakfast" is not "fast", "grow" is not "row"). The
// migration 0021 backfill uses the same lists.
export const EXERCISE_WORDS = [
	"workout",
	"work out",
	"run",
	"jog",
	"walk",
	"step",
	"gym",
	"lift",
	"squat",
	"push",
	"pull",
	"plank",
	"yoga",
	"pilates",
	"swim",
	"bike",
	"cycl",
	"cardio",
	"hike",
	"stretch",
	"train",
	"exercis",
	"sport",
	"danc",
	"rowing",
	"box",
	"hiit",
	"strength",
	"sweat",
] as const
export const DIET_WORDS = [
	"meal",
	"eat",
	"food",
	"water",
	"drink",
	"calor",
	"kcal",
	"protein",
	"veg",
	"fruit",
	"salad",
	"sugar",
	"snack",
	"breakfast",
	"lunch",
	"dinner",
	"cook",
	"diet",
	"weigh",
	"soda",
	"alcohol",
	"fast",
	"fiber",
	"fibre",
	"smoothie",
	"juice",
] as const

function hasWordStart(text: string, words: readonly string[]): boolean {
	const t = ` ${text.toLowerCase()}`
	return words.some((w) => {
		let i = t.indexOf(w)
		while (i > 0) {
			if (!/[a-z]/.test(t[i - 1])) return true
			i = t.indexOf(w, i + 1)
		}
		return false
	})
}

/** A first guess at a mission's kind from its title (the player can
 * change it). Exercise words win over diet words. */
export function guessMissionKind(title: string): TaskKind {
	if (hasWordStart(title, EXERCISE_WORDS)) return "exercise"
	if (hasWordStart(title, DIET_WORDS)) return "diet"
	return "other"
}

// ── Idle income ──────────────────────────────────────────────────────────────

export function machineRate(tier: number): number {
	const m = ECONOMY.income.machine
	return m.rate[tier] ?? m.rate[1]
}

export function machineCap(tier: number): number {
	const m = ECONOMY.income.machine
	return m.cap[tier] ?? m.cap[1]
}

/** Members arriving per hour at a gym with `rooms` finished rooms. */
export function deskMembersPerHour(rooms: number): number {
	const d = ECONOMY.income.desk
	return d.membersPerHour + d.membersPerRoom * Math.max(0, rooms)
}

export function deskRate(rooms: number): number {
	return deskMembersPerHour(rooms) * ECONOMY.income.desk.coinsPerMember
}

/** The menu items that are on, from the stored bitmask (the first item is
 * always on). */
export function kitchenItemsOn(mask: number): KitchenItemKey[] {
	return KITCHEN_MENU.filter((_, i) => i === 0 || (mask & (1 << i)) !== 0).map(
		(m) => m.key,
	)
}

export function kitchenMaskWith(mask: number, key: KitchenItemKey): number {
	const i = KITCHEN_MENU.findIndex((m) => m.key === key)
	return i < 0 ? mask | 1 : mask | 1 | (1 << i)
}

/** Kitchen coins per hour without rush hour. */
export function kitchenRate(mask: number): number {
	const on = new Set<string>(kitchenItemsOn(mask))
	return KITCHEN_MENU.reduce((a, m) => a + (on.has(m.key) ? m.rate : 0), 0)
}

/** Coins a source earned between `fromMs` and `toMs` at `rate` per hour,
 * whole coins, never above `cap`. `boost` doubles (x mult) the rate inside
 * a window (the kitchen's rush hour). */
export function accrued(
	rate: number,
	cap: number,
	fromMs: number,
	toMs: number,
	boost?: { startMs: number; endMs: number; mult: number } | null,
): number {
	if (!(toMs > fromMs) || rate <= 0) return 0
	let hours = (toMs - fromMs) / HOUR
	if (boost && boost.mult > 1) {
		const a = Math.max(fromMs, boost.startMs)
		const b = Math.min(toMs, boost.endMs)
		if (b > a) hours += ((b - a) / HOUR) * (boost.mult - 1)
	}
	return Math.max(0, Math.min(cap, Math.floor(rate * hours)))
}
