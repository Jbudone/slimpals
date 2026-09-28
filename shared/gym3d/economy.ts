// Coins, prices and build times of the 3D gym (gym3d slice 2), in one
// config object so balancing is a one-file change. Pure: the server charges
// with these functions and the client shows the same numbers.
import { LV_TH } from "./rooms.js"

export type LotShape = "normal" | "wide" | "L" | "big"

export const ECONOMY = {
	/** One-time coins when a gym's 3D layout is first read. */
	starterCoins: 1500,
	/** Coins granted per gym XP point (every awardGymXp call). */
	coinsPerXp: 1,
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
	finishNow: {
		/** Coins per remaining hour of a job, rounded up; never below `min`. */
		coinsPerHour: 40,
		min: 10,
	},
	/** Hours taken off every active job when real activity is logged. */
	activityCutHours: 1,
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

/** Coins to finish a job now, from the time it has left. */
export function finishCost(remainingMs: number): number {
	const f = ECONOMY.finishNow
	if (remainingMs <= 0) return 0
	return Math.max(f.min, Math.ceil((remainingMs / HOUR) * f.coinsPerHour))
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
