import { asc, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { gymUpgradesCatalog, userGymUpgrades } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import {
	claimUpgrade,
	computeLevel,
	getOrCreateGym,
} from "../services/gym/index.js"

export const gymRouter = Router()

gymRouter.get("/gym", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const gym = await getOrCreateGym(userId, db)

	const catalog = await db
		.select()
		.from(gymUpgradesCatalog)
		.orderBy(asc(gymUpgradesCatalog.sortOrder))

	const unlockedRows = await db
		.select()
		.from(userGymUpgrades)
		.where(eq(userGymUpgrades.gymId, gym.id))

	const unlockedKeys = new Set(unlockedRows.map((r) => r.upgradeKey))
	const pendingKeys = new Set(gym.pendingUpgradeKeys)

	const unlocked = catalog
		.filter((c) => unlockedKeys.has(c.key))
		.map((c) => {
			const row = unlockedRows.find((r) => r.upgradeKey === c.key)
			return {
				key: c.key,
				name: c.name,
				description: c.description,
				category: c.category,
				unlockedAt: row?.unlockedAt,
				placementData: row?.placementData,
			}
		})

	const pending = catalog
		.filter((c) => pendingKeys.has(c.key))
		.map((c) => ({
			key: c.key,
			name: c.name,
			description: c.description,
			category: c.category,
			requiredXp: c.requiredXp,
		}))

	const locked = catalog
		.filter((c) => !unlockedKeys.has(c.key) && !pendingKeys.has(c.key))
		.map((c) => ({
			key: c.key,
			name: c.name,
			description: c.description,
			category: c.category,
			requiredXp: c.requiredXp,
		}))

	const currentLevel = computeLevel(gym.xp)
	const nextLevelXp = (currentLevel + 1) * (currentLevel + 1) * 50
	const xpToNextLevel = nextLevelXp - gym.xp

	res.json({
		gym: {
			id: gym.id,
			name: gym.name,
			level: gym.level,
			xp: gym.xp,
		},
		upgrades: { unlocked, pending, locked },
		xpToNextLevel,
	})
})

gymRouter.post("/gym/claim-upgrade", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const { key } = req.body as { key?: string }

	if (!key) {
		res.status(400).json({ error: "key is required" })
		return
	}

	const gym = await getOrCreateGym(userId, db)

	if (!(gym.pendingUpgradeKeys as string[]).includes(key)) {
		res.status(400).json({ error: "Upgrade is not pending" })
		return
	}

	await claimUpgrade(gym.id, key, db)

	// Return updated state
	const updatedGym = await getOrCreateGym(userId, db)

	const catalog = await db
		.select()
		.from(gymUpgradesCatalog)
		.orderBy(asc(gymUpgradesCatalog.sortOrder))

	const unlockedRows = await db
		.select()
		.from(userGymUpgrades)
		.where(eq(userGymUpgrades.gymId, updatedGym.id))

	const unlockedKeys = new Set(unlockedRows.map((r) => r.upgradeKey))
	const pendingKeys = new Set(updatedGym.pendingUpgradeKeys)

	const unlocked = catalog
		.filter((c) => unlockedKeys.has(c.key))
		.map((c) => {
			const row = unlockedRows.find((r) => r.upgradeKey === c.key)
			return {
				key: c.key,
				name: c.name,
				description: c.description,
				category: c.category,
				unlockedAt: row?.unlockedAt,
				placementData: row?.placementData,
			}
		})

	const pending = catalog
		.filter((c) => pendingKeys.has(c.key))
		.map((c) => ({
			key: c.key,
			name: c.name,
			description: c.description,
			category: c.category,
			requiredXp: c.requiredXp,
		}))

	const locked = catalog
		.filter((c) => !unlockedKeys.has(c.key) && !pendingKeys.has(c.key))
		.map((c) => ({
			key: c.key,
			name: c.name,
			description: c.description,
			category: c.category,
			requiredXp: c.requiredXp,
		}))

	const currentLevel = computeLevel(updatedGym.xp)
	const nextLevelXp = (currentLevel + 1) * (currentLevel + 1) * 50
	const xpToNextLevel = nextLevelXp - updatedGym.xp

	res.json({
		gym: {
			id: updatedGym.id,
			name: updatedGym.name,
			level: updatedGym.level,
			xp: updatedGym.xp,
		},
		upgrades: { unlocked, pending, locked },
		xpToNextLevel,
	})
})

gymRouter.get("/gym/catalog", async (_req, res) => {
	const catalog = await db
		.select()
		.from(gymUpgradesCatalog)
		.orderBy(asc(gymUpgradesCatalog.sortOrder))

	res.json(
		catalog.map((c) => ({
			key: c.key,
			name: c.name,
			description: c.description,
			category: c.category,
			requiredXp: c.requiredXp,
			sortOrder: c.sortOrder,
			unlocksNpcKey: c.unlocksNpcKey,
		})),
	)
})
