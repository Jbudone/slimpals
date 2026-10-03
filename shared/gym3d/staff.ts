// Staff growth in the 3D gym: each staff NPC has a level (1..5) the player
// trains with coins, three stats shown on the staff card, and a small bonus
// to the coins the staff member's own area earns. Pure: the server charges
// and applies it, the client shows the same numbers.
//
// What staff do (level 1 earns no bonus, so a fresh gym earns what it
// always did):
// - every level above 1 adds `BONUS_PER_LEVEL` to the coins per hour of
//   their area (a room type's machines, the front desk or the Slim Kitchen);
// - the manager looks after every machine, at half the rate.
// Hiring new staff is a later step; today the staff are the named cast.

export type StaffArea =
	| "cardio"
	| "weights"
	| "boxing"
	| "recovery"
	| "desk"
	| "kitchen"
	| "all"

export type StaffStats = {
	friendliness: number
	expertise: number
	speed: number
}

export type StaffDef = {
	/** NPC key (gym_npcs.key). */
	key: string
	/** What they look after. */
	area: StaffArea
	/** Level 1 stats; each level adds 1 to all three. */
	stats: StaffStats
	/** The upgrade that brings them to the gym (null: always there). */
	unlockedBy: string | null
	/** One line for the staff card: what their level does. */
	perk: string
}

export const STAFF: readonly StaffDef[] = [
	{
		key: "trainer_marcus",
		area: "weights",
		stats: { friendliness: 5, expertise: 7, speed: 4 },
		unlockedBy: null,
		perk: "Weights machines earn more",
	},
	{
		key: "receptionist_lisa",
		area: "desk",
		stats: { friendliness: 8, expertise: 4, speed: 6 },
		unlockedBy: null,
		perk: "The front desk earns more",
	},
	{
		key: "specialist_coach",
		area: "cardio",
		stats: { friendliness: 5, expertise: 8, speed: 5 },
		unlockedBy: "staff_trainer",
		perk: "Cardio machines earn more",
	},
	{
		key: "specialist_nutritionist",
		area: "kitchen",
		stats: { friendliness: 7, expertise: 8, speed: 3 },
		unlockedBy: "staff_nutrition",
		perk: "The Slim Kitchen earns more",
	},
	{
		key: "trainer_jordan",
		area: "boxing",
		stats: { friendliness: 6, expertise: 5, speed: 7 },
		unlockedBy: "staff_assistant_trainer",
		perk: "Boxing machines earn more",
	},
	{
		key: "manager_alex",
		area: "all",
		stats: { friendliness: 6, expertise: 6, speed: 6 },
		unlockedBy: "staff_manager_office",
		perk: "Every machine earns a little more",
	},
]

export const STAFF_MAX_LEVEL = 5
/** Coin bonus per level above 1 (the manager gets half). */
export const BONUS_PER_LEVEL = 0.03

/** Coins to train from `level` to the next, null at the top level. */
const TRAIN_COSTS: Readonly<Record<number, number>> = {
	1: 250,
	2: 500,
	3: 900,
	4: 1400,
}

export function staffDef(npcKey: string): StaffDef | null {
	return STAFF.find((s) => s.key === npcKey) ?? null
}

export function trainCost(level: number): number | null {
	if (level < 1 || level >= STAFF_MAX_LEVEL) return null
	return TRAIN_COSTS[level] ?? null
}

export function clampLevel(level: number): number {
	return Math.max(1, Math.min(STAFF_MAX_LEVEL, Math.floor(level) || 1))
}

export function staffStats(def: StaffDef, level: number): StaffStats {
	const up = clampLevel(level) - 1
	return {
		friendliness: def.stats.friendliness + up,
		expertise: def.stats.expertise + up,
		speed: def.stats.speed + up,
	}
}

/** The coin bonus (0.06 = +6%) one staff member gives their area. */
export function staffBonus(def: StaffDef, level: number): number {
	const per = def.area === "all" ? BONUS_PER_LEVEL / 2 : BONUS_PER_LEVEL
	return (clampLevel(level) - 1) * per
}

/** Multiplier on a coin source's rate from the staff at `levels` (npc key
 * to level; staff not in the map count as level 1). `area` is the room type
 * of a machine, or "desk" / "kitchen". */
export function areaMultiplier(
	area: string,
	levels: ReadonlyMap<string, number>,
): number {
	let bonus = 0
	for (const s of STAFF) {
		if (s.area !== area && s.area !== "all") continue
		// the manager only looks after machines, not the desk or the kitchen
		if (s.area === "all" && (area === "desk" || area === "kitchen")) continue
		bonus += staffBonus(s, levels.get(s.key) ?? 1)
	}
	return 1 + bonus
}
