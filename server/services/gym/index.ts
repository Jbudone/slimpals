import { and, eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import {
	gymUpgradesCatalog,
	userGyms,
	userGymUpgrades,
	users,
} from "../../db/schema.js"
import { UPGRADE_LAYOUT } from "./layout.js"

type Db = MySql2Database<typeof schema>

export type Gym = {
	id: number
	userId: string
	name: string
	level: number
	xp: number
	pendingUpgradeKeys: string[]
	todayEventData: unknown
	gymVisitStreak: number
	lastGymVisitDate: Date | null
	createdAt: Date
	simulatedHourOverride: number | null
}

/** The gym's effective "now" for schedule-dependent logic, honoring an
 * admin-forced hour-of-day override (keeps today's real date/day-of-week,
 * only the hour is substituted). */
export function effectiveGymTime(
	gym: Pick<Gym, "simulatedHourOverride">,
	now: Date = new Date(),
): Date {
	if (gym.simulatedHourOverride == null) return now
	const effective = new Date(now)
	effective.setHours(gym.simulatedHourOverride, 0, 0, 0)
	return effective
}

export function computeLevel(xp: number): number {
	return Math.floor(Math.sqrt(xp / 50))
}

export type LevelProgress = {
	level: number
	nextLevelXp: number
	xpToNextLevel: number
	/** XP earned since the start of the current level — the bar's "value". */
	xpIntoLevel: number
	/** Total XP span of the current level — the bar's "max". */
	xpForLevel: number
}

/** Shared by the /gym upgrades payload and the Dashboard's level/XP bar so
 * the level-curve formula (inverse of computeLevel) lives in exactly one
 * place. */
export function getLevelProgress(xp: number): LevelProgress {
	const level = computeLevel(xp)
	const levelStartXp = level * level * 50
	const nextLevelXp = (level + 1) * (level + 1) * 50
	return {
		level,
		nextLevelXp,
		xpToNextLevel: nextLevelXp - xp,
		xpIntoLevel: xp - levelStartXp,
		xpForLevel: nextLevelXp - levelStartXp,
	}
}

export type GymEra = {
	id: string
	name: string
	minXp: number
}

/**
 * Long-term progression tier ladder (gh-65): named eras layered on top of
 * `computeLevel`'s existing sqrt(xp/50) curve — this doesn't replace that
 * formula, it just groups XP ranges into stable, referenceable names for
 * the progression-checkpoint tooling (gh-62) to extend into once it needs
 * more/later checkpoints than its current Day 1/7/30/90 horizon.
 *
 * Thresholds are calibrated against DAILY_XP_RATE (~33.8 xp/day for a
 * consistently-engaged user, defined below) so pacing stays in
 * "months, not weeks" territory even for the first non-starting era, and
 * grows into a genuinely long-term (~1.5-2 year) horizon for the top tier:
 *   Tiny Startup Gym      xp 0      (day 0 — immediate start)
 *   Neighborhood Regular  xp 1,500  (~day 44  / ~1.5 months) — matches the
 *                                    existing 25-item catalog's ceiling
 *   Local Hotspot         xp 3,500  (~day 104 / ~3.4 months)
 *   City Destination      xp 7,500  (~day 222 / ~7.3 months)
 *   Regional Chain        xp 12,500 (~day 370 / ~12.2 months)
 *   Flagship / Landmark   xp 20,000 (~day 592 / ~19.4 months)
 * Sorted ascending by minXp — getEraForXp relies on this ordering.
 */
export const GYM_ERAS: GymEra[] = [
	{ id: "tiny_startup", name: "Tiny Startup Gym", minXp: 0 },
	{ id: "neighborhood_regular", name: "Neighborhood Regular", minXp: 1500 },
	{ id: "local_hotspot", name: "Local Hotspot", minXp: 3500 },
	{ id: "city_destination", name: "City Destination", minXp: 7500 },
	{ id: "regional_chain", name: "Regional Chain", minXp: 12500 },
	{ id: "flagship_landmark", name: "Flagship / Landmark", minXp: 20000 },
]

/** The highest era whose minXp threshold has been reached. GYM_ERAS[0]
 * (minXp: 0) guarantees this always returns a value, even for xp <= 0. */
export function getEraForXp(xp: number): GymEra {
	let current = GYM_ERAS[0]
	for (const era of GYM_ERAS) {
		if (xp >= era.minXp) current = era
		else break
	}
	return current
}

/** Pure threshold check shared by real XP awards (awardGymXp) and synthetic
 * progression previews (deriveProgressionFromDays, gh-109) — the single
 * source of truth for "which upgrades does this much XP unlock," so the two
 * paths can never drift out of sync. */
export function deriveUnlockedUpgradeKeys(
	xp: number,
	catalog: { key: string; requiredXp: number }[],
): string[] {
	return catalog
		.filter((entry) => entry.requiredXp <= xp)
		.map((entry) => entry.key)
}

/**
 * Daily XP rate for synthetic progression previews (gh-109), derived from
 * the real per-activity amounts elsewhere in this file's callers rather
 * than an arbitrary number: a checkin (15 XP/day, checkins.ts — a daily
 * habit), a food log (5 XP/day base, food.ts — a daily habit), a completed
 * sprint (50 XP amortized over its 7-day window, sprints.ts), and a
 * completed challenge (200 XP amortized over its ~30-day window,
 * challenges.ts). Models a consistently-engaged user; badge-bonus XP is
 * intentionally excluded since it isn't guaranteed daily.
 */
export const DAILY_XP_RATE = 15 + 5 + 50 / 7 + 200 / 30

export type ProgressionSnapshot = {
	daysElapsed: number
	xp: number
	level: number
	unlockedUpgradeKeys: string[]
	era: GymEra
}

/**
 * Derives a deterministic, monotonic synthetic progression snapshot for
 * "what would the gym look like after N days of consistent use" (gh-109),
 * without replaying any real history. Same daysElapsed always produces the
 * same xp/level/unlocks; increasing daysElapsed never decreases any of
 * them; unlocks are always backed by enough synthetic XP for their real
 * requiredXp threshold, because they're derived through the exact same
 * deriveUnlockedUpgradeKeys check awardGymXp uses for real XP awards.
 */
export function deriveProgressionFromDays(
	daysElapsed: number,
	catalog: { key: string; requiredXp: number }[],
): ProgressionSnapshot {
	const clampedDays = Math.max(0, Math.floor(daysElapsed))
	const xp = Math.round(clampedDays * DAILY_XP_RATE)
	return {
		daysElapsed: clampedDays,
		xp,
		level: computeLevel(xp),
		unlockedUpgradeKeys: deriveUnlockedUpgradeKeys(xp, catalog),
		era: getEraForXp(xp),
	}
}

export async function getOrCreateGym(userId: string, db: Db): Promise<Gym> {
	const [existing] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, userId))

	if (existing) {
		return {
			...existing,
			pendingUpgradeKeys: existing.pendingUpgradeKeys as string[],
		}
	}

	const [user] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))

	const gymName = `${user?.name ?? "My"}'s Gym`

	let gymId: number
	try {
		const [inserted] = await db
			.insert(userGyms)
			.values({ userId, name: gymName })
			.$returningId()
		gymId = inserted.id
	} catch (err) {
		// Concurrent requests for a brand-new user (e.g. two tabs, or a
		// double-fetch on first page load) can both see no existing row and
		// race to insert one — userId is unique, so the loser hits a
		// duplicate-key error. Treat that as "someone else just created it"
		// rather than a failure.
		const cause = err instanceof Error ? err.cause : undefined
		const isDuplicateKey =
			cause instanceof Error &&
			(cause as NodeJS.ErrnoException).code === "ER_DUP_ENTRY"
		if (!isDuplicateKey) {
			throw err
		}
		const [raceWinner] = await db
			.select()
			.from(userGyms)
			.where(eq(userGyms.userId, userId))
		if (!raceWinner) throw err
		return {
			...raceWinner,
			pendingUpgradeKeys: raceWinner.pendingUpgradeKeys as string[],
		}
	}

	const [row] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))

	return {
		...row,
		pendingUpgradeKeys: row.pendingUpgradeKeys as string[],
	}
}

export async function awardGymXp(
	userId: string,
	amount: number,
	_source: string,
	db: Db,
): Promise<{ newLevel: boolean; newPendingUpgrades: string[] }> {
	const gym = await getOrCreateGym(userId, db)
	const oldLevel = computeLevel(gym.xp)
	const newXp = gym.xp + amount
	const newLevel = computeLevel(newXp)

	const alreadyUnlockedKeys = (
		await db
			.select({ upgradeKey: userGymUpgrades.upgradeKey })
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))
	).map((r) => r.upgradeKey)

	const currentPending = gym.pendingUpgradeKeys
	const alreadyKnown = new Set([...alreadyUnlockedKeys, ...currentPending])

	const catalog = await db
		.select({
			key: gymUpgradesCatalog.key,
			requiredXp: gymUpgradesCatalog.requiredXp,
		})
		.from(gymUpgradesCatalog)

	const unlockedByXp = new Set(deriveUnlockedUpgradeKeys(newXp, catalog))
	const actualNewPending = catalog
		.map((entry) => entry.key)
		.filter((key) => !alreadyKnown.has(key) && unlockedByXp.has(key))

	const updatedPending = [...currentPending, ...actualNewPending]

	await db
		.update(userGyms)
		.set({
			xp: newXp,
			level: newLevel,
			pendingUpgradeKeys: updatedPending,
		})
		.where(eq(userGyms.id, gym.id))

	return {
		newLevel: newLevel > oldLevel,
		newPendingUpgrades: actualNewPending,
	}
}

export async function claimUpgrade(
	gymId: number,
	upgradeKey: string,
	db: Db,
): Promise<void> {
	const [gym] = await db.select().from(userGyms).where(eq(userGyms.id, gymId))

	if (!gym) return

	const pending = gym.pendingUpgradeKeys as string[]
	if (!pending.includes(upgradeKey)) return

	const [existing] = await db
		.select()
		.from(userGymUpgrades)
		.where(
			and(
				eq(userGymUpgrades.gymId, gymId),
				eq(userGymUpgrades.upgradeKey, upgradeKey),
			),
		)

	if (existing) {
		if (!existing.placementData && UPGRADE_LAYOUT[upgradeKey]) {
			await db
				.update(userGymUpgrades)
				.set({ placementData: UPGRADE_LAYOUT[upgradeKey] })
				.where(
					and(
						eq(userGymUpgrades.gymId, gymId),
						eq(userGymUpgrades.upgradeKey, upgradeKey),
					),
				)
		}
	} else {
		await db.insert(userGymUpgrades).values({
			gymId,
			upgradeKey,
			placementData: UPGRADE_LAYOUT[upgradeKey] ?? null,
		})
	}

	const updatedPending = pending.filter((k) => k !== upgradeKey)
	await db
		.update(userGyms)
		.set({ pendingUpgradeKeys: updatedPending })
		.where(eq(userGyms.id, gymId))
}
