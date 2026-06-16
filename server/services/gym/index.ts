import { and, eq, notInArray } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import {
	gymUpgradesCatalog,
	userGyms,
	userGymUpgrades,
	users,
} from "../../db/schema.js"

type Db = MySql2Database<typeof schema>

export type Gym = {
	id: number
	userId: string
	name: string
	level: number
	xp: number
	pendingUpgradeKeys: string[]
	createdAt: Date
}

export function computeLevel(xp: number): number {
	return Math.floor(Math.sqrt(xp / 50))
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

	const [inserted] = await db
		.insert(userGyms)
		.values({ userId, name: gymName })
		.$returningId()

	const [row] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.id, inserted.id))

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

	const eligible = await db
		.select({ key: gymUpgradesCatalog.key })
		.from(gymUpgradesCatalog)
		.where(
			alreadyKnown.size > 0
				? and(notInArray(gymUpgradesCatalog.key, [...alreadyKnown]))
				: undefined,
		)

	const newPendingUpgrades = eligible
		.map((r) => r.key)
		.filter((key) => !alreadyKnown.has(key))

	// Filter based on requiredXp
	const eligibleByXp = await db
		.select({
			key: gymUpgradesCatalog.key,
			requiredXp: gymUpgradesCatalog.requiredXp,
		})
		.from(gymUpgradesCatalog)

	const xpMap = new Map(eligibleByXp.map((r) => [r.key, r.requiredXp]))

	const actualNewPending = newPendingUpgrades.filter(
		(key) => (xpMap.get(key) ?? Infinity) <= newXp,
	)

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

	if (existing) return

	await db.insert(userGymUpgrades).values({
		gymId,
		upgradeKey,
	})

	const updatedPending = pending.filter((k) => k !== upgradeKey)
	await db
		.update(userGyms)
		.set({ pendingUpgradeKeys: updatedPending })
		.where(eq(userGyms.id, gymId))
}
