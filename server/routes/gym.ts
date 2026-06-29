import { and, asc, desc, eq, gte } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	badges,
	dailyCheckins,
	gymNpcs,
	gymUpgradesCatalog,
	userBadges,
	userGymNpcRelationships,
	userGyms,
	userGymUpgrades,
	weightEntries,
} from "../db/schema.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService } from "../services/ai/index.js"
import {
	appendMemoryEvent,
	generateContentForUser,
	processContentBatch,
} from "../services/gym/content.js"
import {
	computeRelationshipGain,
	type DialogEntry,
	generateDialogBatch,
	getCurrentDialogBatch,
	getOrCreateRelationship,
	getRelationshipStage,
	getStageLabel,
} from "../services/gym/dialog.js"
import {
	claimUpgrade,
	computeLevel,
	getOrCreateGym,
} from "../services/gym/index.js"
import {
	computeGymSimState,
	type GymNpc,
	type NpcRelationship,
} from "../services/gym/simulation.js"

async function fetchUserStats(userId: string) {
	const checkins = await db
		.select()
		.from(dailyCheckins)
		.where(eq(dailyCheckins.userId, userId))
	const streak =
		checkins.length > 0 ? Math.max(...checkins.map((c) => c.streakCount)) : 0

	const [latestWeight] = await db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(desc(weightEntries.recordedAt))
		.limit(1)

	const recentBadgeRows = await db
		.select({ name: badges.name })
		.from(userBadges)
		.innerJoin(badges, eq(userBadges.badgeId, badges.id))
		.where(eq(userBadges.userId, userId))
		.orderBy(desc(userBadges.earnedAt))
		.limit(5)

	return {
		streak,
		latestWeightKg: latestWeight?.weightKg ?? null,
		recentBadges: recentBadgeRows.map((r) => r.name),
	}
}

function getStagePortraitUrl(
	baseUrl: string | null,
	stage: number,
): string | null {
	if (!baseUrl || stage < 2) return baseUrl
	const stagePath = baseUrl.replace(".png", `_stage${stage}.png`)
	return stagePath
}

export function createGymRouter(aiService: AIService) {
	const router = Router()

	router.get("/gym", async (req, res) => {
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
			todayEvent: gym.todayEventData ?? null,
		})
	})

	router.post("/gym/claim-upgrade", async (req, res) => {
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

	router.get("/gym/catalog", async (_req, res) => {
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

	router.get("/gym/sim-state", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const gym = await getOrCreateGym(userId, db)

		const allNpcs = await db.select().from(gymNpcs)

		const unlockedRows = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))

		const unlockedKeys = unlockedRows.map((r) => r.upgradeKey)

		const relRows = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.gymId, gym.id))

		const relationships: NpcRelationship[] = relRows.map((r) => ({
			npcKey: r.npcKey,
			relationshipLevel: r.relationshipLevel,
		}))

		const npcData: GymNpc[] = allNpcs.map((n) => ({
			key: n.key,
			name: n.name,
			role: n.role,
			personalityProfile: n.personalityProfile,
			defaultSchedule: n.defaultSchedule,
			spriteKey: n.spriteKey,
			unlockedByUpgradeKey: n.unlockedByUpgradeKey,
		})) as GymNpc[]

		const gymRow = await db
			.select({ todayEventData: userGyms.todayEventData })
			.from(userGyms)
			.where(eq(userGyms.id, gym.id))
			.then((rows) => rows[0])

		const todayEvent = gymRow?.todayEventData as {
			npcKey: string | null
			activeHours: [number, number]
			effects?: { allNpcMoodBonus?: number }
		} | null

		const npcs = await computeGymSimState(
			gym.id,
			npcData,
			unlockedKeys,
			relationships,
			db,
			undefined,
			todayEvent,
		)

		res.json({
			simTime: new Date().toISOString(),
			npcs,
			gymId: gym.id,
			todayEvent: gymRow?.todayEventData ?? null,
		})
	})

	router.get("/gym/npcs", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const gym = await getOrCreateGym(userId, db)

		const allNpcs = await db.select().from(gymNpcs)

		const relRows = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.gymId, gym.id))

		const unlockedRows = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))

		const unlockedKeys = new Set(unlockedRows.map((r) => r.upgradeKey))

		const visibleNpcs = allNpcs.filter(
			(n) =>
				!n.unlockedByUpgradeKey || unlockedKeys.has(n.unlockedByUpgradeKey),
		)

		const result = visibleNpcs.map((npc) => {
			const rel = relRows.find((r) => r.npcKey === npc.key)
			return {
				key: npc.key,
				name: npc.name,
				role: npc.role,
				spriteKey: npc.spriteKey,
				relationshipLevel: rel?.relationshipLevel ?? 0,
				interactionCount: rel?.interactionCount ?? 0,
				lastInteractedAt: rel?.lastInteractedAt ?? null,
			}
		})

		res.json(result)
	})

	router.get("/gym/npc/:key", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const gym = await getOrCreateGym(userId, db)
		const npcKey = req.params.key

		const [npc] = await db.select().from(gymNpcs).where(eq(gymNpcs.key, npcKey))

		if (!npc) {
			res.status(404).json({ error: "NPC not found" })
			return
		}

		const rel = await getOrCreateRelationship(gym.id, npcKey, db)
		const stage = getRelationshipStage(rel.relationshipLevel)

		let dialogs = await getCurrentDialogBatch(gym.id, npcKey, stage, db)
		if (!dialogs) {
			const userStats = await fetchUserStats(userId)
			dialogs = await generateDialogBatch(
				gym.id,
				npcKey,
				stage,
				aiService,
				db,
				userStats,
			)
		}

		const prompts = dialogs.map((d: DialogEntry, i: number) => ({
			index: i,
			promptText: d.promptText,
		}))

		const portraitUrl = getStagePortraitUrl(
			npc.portraitUrl,
			getRelationshipStage(rel.relationshipLevel),
		)

		res.json({
			npc: {
				key: npc.key,
				name: npc.name,
				role: npc.role,
				portraitUrl,
			},
			relationship: {
				level: rel.relationshipLevel,
				stage,
				stageLabel: getStageLabel(stage),
				interactionCount: rel.interactionCount,
			},
			prompts,
		})
	})

	router.post("/gym/npc/interact", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const { npcKey, promptIndex } = req.body as {
			npcKey?: string
			promptIndex?: number
		}

		if (!npcKey || promptIndex === undefined || promptIndex === null) {
			res.status(400).json({ error: "npcKey and promptIndex are required" })
			return
		}

		if (typeof promptIndex !== "number" || promptIndex < 0) {
			res
				.status(400)
				.json({ error: "promptIndex must be a non-negative number" })
			return
		}

		const gym = await getOrCreateGym(userId, db)
		const rel = await getOrCreateRelationship(gym.id, npcKey, db)
		const oldStage = getRelationshipStage(rel.relationshipLevel)

		const dialogs = await getCurrentDialogBatch(gym.id, npcKey, oldStage, db)
		if (!dialogs || promptIndex >= dialogs.length) {
			res.status(400).json({ error: "No dialog available at that index" })
			return
		}

		const dialog = dialogs[promptIndex]
		const gain = computeRelationshipGain(oldStage)
		const newLevel = Math.min(100, rel.relationshipLevel + gain)
		const newStage = getRelationshipStage(newLevel)
		const stageAdvanced = newStage > oldStage

		const notes = (rel.personalityNotes as string[]) ?? []
		if (
			dialog.personalityTagAdded &&
			!notes.includes(dialog.personalityTagAdded)
		) {
			notes.push(dialog.personalityTagAdded)
		}

		await db
			.update(userGymNpcRelationships)
			.set({
				relationshipLevel: newLevel,
				personalityNotes: notes,
				interactionCount: rel.interactionCount + 1,
				lastInteractedAt: new Date(),
			})
			.where(
				and(
					eq(userGymNpcRelationships.gymId, gym.id),
					eq(userGymNpcRelationships.npcKey, npcKey),
				),
			)

		res.json({
			dialog: {
				promptText: dialog.promptText,
				response: dialog.response,
				portraitVariant: dialog.portraitVariant,
			},
			relationship: {
				level: newLevel,
				stage: newStage,
				stageLabel: getStageLabel(newStage),
				gain,
			},
			stageAdvanced,
			newStage: stageAdvanced ? newStage : undefined,
		})
	})

	// Admin: generate content for a single user
	router.post("/gym/generate-content", requireAdmin, async (req, res) => {
		const { userId } = req.body as { userId?: string }
		if (!userId) {
			res.status(400).json({ error: "userId is required" })
			return
		}
		const result = await generateContentForUser(userId, aiService, db)
		res.json(result)
	})

	// Cron: generate content for all active users (protected by CRON_SECRET header)
	router.post("/gym/cron/generate-content", async (req, res) => {
		const cronSecret = process.env.CRON_SECRET
		if (!cronSecret || req.headers["x-cron-secret"] !== cronSecret) {
			res.status(401).json({ error: "Unauthorized" })
			return
		}

		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
		const activeGyms = await db
			.select({ userId: userGyms.userId })
			.from(userGyms)
			.where(gte(userGyms.createdAt, sevenDaysAgo))

		const userIds = activeGyms.map((g) => g.userId)
		const result = await processContentBatch(userIds, aiService, db)
		res.json({ ...result, total: userIds.length })
	})

	// Internal: append a memory event for all NPCs with relationship >= 25
	router.post("/gym/memory-event", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const { eventType, metadata = {} } = req.body as {
			eventType?: string
			metadata?: Record<string, unknown>
		}

		if (!eventType) {
			res.status(400).json({ error: "eventType is required" })
			return
		}

		const gym = await getOrCreateGym(userId, db)
		await appendMemoryEvent(gym.id, eventType, metadata, db)
		res.json({ success: true })
	})

	router.post("/gym/generate-dialogs", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const gym = await getOrCreateGym(userId, db)
		const userStats = await fetchUserStats(userId)

		const allNpcs = await db.select().from(gymNpcs)
		const generated: string[] = []

		for (const npc of allNpcs) {
			const rel = await getOrCreateRelationship(gym.id, npc.key, db)
			const stage = getRelationshipStage(rel.relationshipLevel)
			const existing = await getCurrentDialogBatch(gym.id, npc.key, stage, db)
			if (existing) continue

			await generateDialogBatch(
				gym.id,
				npc.key,
				stage,
				aiService,
				db,
				userStats,
			)
			generated.push(npc.key)
		}

		res.json({ generated, count: generated.length })
	})

	return router
}
