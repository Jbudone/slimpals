import { and, asc, desc, eq, exists, gte, or, sql } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import {
	badges,
	dailyCheckins,
	gymNpcs,
	sessions,
	userBadges,
	userGymNpcRelationships,
	userGyms,
	userGymUpgrades,
	weightEntries,
} from "../../db/schema.js"
import type { AIService, GymEventData } from "../ai/index.js"
import { readTuningDoc } from "../contentTuning/fs.js"
import {
	generateDialogBatch,
	getCurrentDialogBatch,
	getOrCreateRelationship,
	getRelationshipStage,
} from "./dialog.js"

type Db = MySql2Database<typeof schema>

export type MemoryEvent = {
	event: string
	date: string
	referenced: boolean
}

async function fetchUserStatsForContent(userId: string, db: Db) {
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

	const checkins = await db
		.select()
		.from(dailyCheckins)
		.where(
			and(
				eq(dailyCheckins.userId, userId),
				gte(dailyCheckins.date, sevenDaysAgo),
			),
		)

	const streak =
		checkins.length > 0 ? Math.max(...checkins.map((c) => c.streakCount)) : 0

	const [latestWeight] = await db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(desc(weightEntries.recordedAt))
		.limit(1)

	const recentBadgeRows = await db
		.select({ name: badges.name, earnedAt: userBadges.earnedAt })
		.from(userBadges)
		.innerJoin(badges, eq(userBadges.badgeId, badges.id))
		.where(
			and(
				eq(userBadges.userId, userId),
				gte(userBadges.earnedAt, sevenDaysAgo),
			),
		)
		.orderBy(desc(userBadges.earnedAt))
		.limit(5)

	return {
		streak,
		latestWeightKg: latestWeight?.weightKg ?? null,
		recentBadges: recentBadgeRows.map((r) => r.name),
		checkinCount: checkins.length,
	}
}

export async function appendMemoryEvent(
	gymId: number,
	eventType: string,
	_metadata: Record<string, unknown>,
	db: Db,
): Promise<void> {
	const rels = await db
		.select()
		.from(userGymNpcRelationships)
		.where(eq(userGymNpcRelationships.gymId, gymId))

	const eligibleRels = rels.filter((r) => r.relationshipLevel >= 25)
	if (eligibleRels.length === 0) return

	const newEvent: MemoryEvent = {
		event: eventType,
		date: new Date().toISOString().split("T")[0],
		referenced: false,
	}

	for (const rel of eligibleRels) {
		const existing = (rel.gymMemoryEvents as MemoryEvent[]) ?? []
		const updated = [...existing, newEvent]
		await db
			.update(userGymNpcRelationships)
			.set({ gymMemoryEvents: updated })
			.where(eq(userGymNpcRelationships.id, rel.id))
	}
}

// The rules block (event types, format, JSON shape) is tunable via
// docs/gym_events.md; the gym-level/upgrades/stats context stays per-call
// dynamic data built by the caller.
export function buildGymEventPrompt(params: {
	level: number
	upgradeList: string
	statsStr: string
}): string {
	const rulesDoc = readTuningDoc(
		"server/services/contentTuning/docs/gym_events.md",
	)
	return `The user's gym level is ${params.level}. Unlocked upgrades: ${params.upgradeList}.
Recent user activity: ${params.statsStr}

${rulesDoc}`
}

async function generateGymEventForUser(
	_gymId: number,
	level: number,
	unlockedKeys: string[],
	userStats: {
		streak: number
		latestWeightKg: number | null
		checkinCount: number
	},
	aiService: AIService,
	_db: Db,
): Promise<GymEventData | null> {
	const upgradeList =
		unlockedKeys.length > 0
			? unlockedKeys.slice(0, 10).join(", ")
			: "basic equipment only"

	const statsStr = `Check-ins last 7 days: ${userStats.checkinCount}. Streak: ${userStats.streak} days. Weight: ${userStats.latestWeightKg ?? "unknown"} kg.`

	const prompt = buildGymEventPrompt({ level, upgradeList, statsStr })

	try {
		return await aiService.generateGymEvent(prompt)
	} catch (err) {
		console.warn(
			"[content] gym event generation failed:",
			(err as Error).message,
		)
		return null
	}
}

export const PORTRAIT_STAGE_DESCRIPTIONS: Record<number, string> = {
	2: "slightly warmer expression, small detail change such as a thumbs up",
	3: "fully personalized portrait with a detail reference to the user's gym upgrades",
}

// The art-style rules (palette, outline, pixel spec) are tunable via
// docs/npc_portraits.md; the character/stage/upgrade context stays
// per-call dynamic data built by the caller.
export function buildPortraitPrompt(params: {
	npcName: string
	stageDescription: string
	upgradeHint: string
}): string {
	const styleDoc = readTuningDoc(
		"server/services/contentTuning/docs/npc_portraits.md",
	)
	return `Pixel art portrait of ${params.npcName}, a gym character. ${params.stageDescription}.${params.upgradeHint} ${styleDoc}`
}

async function refreshStagePortrait(
	npcKey: string,
	npcName: string,
	stage: number,
	gymUpgrades: string[],
	aiService: AIService,
	db: Db,
): Promise<void> {
	if (stage < 2) return

	const upgradeHint =
		stage === 3 && gymUpgrades.length > 0
			? ` Background should subtly reference their gym's latest upgrade: ${gymUpgrades.slice(-1)[0]}.`
			: ""

	const prompt = buildPortraitPrompt({
		npcName,
		stageDescription:
			PORTRAIT_STAGE_DESCRIPTIONS[stage] ?? "neutral expression",
		upgradeHint,
	})

	const outputPath = `public/assets/gym/portraits/${npcKey}_stage${stage}.png`
	await aiService.generateNpcPortrait(prompt, outputPath)

	await db
		.update(gymNpcs)
		.set({ portraitGeneratedAt: new Date() })
		.where(eq(gymNpcs.key, npcKey))
}

export async function generateContentForUser(
	userId: string,
	aiService: AIService,
	db: Db,
): Promise<{
	dialogs: string[]
	event: GymEventData | null
	portraits: string[]
}> {
	const [gymRow] = await db
		.select()
		.from(userGyms)
		.where(eq(userGyms.userId, userId))

	if (!gymRow) return { dialogs: [], event: null, portraits: [] }

	const unlockedRows = await db
		.select()
		.from(userGymUpgrades)
		.where(eq(userGymUpgrades.gymId, gymRow.id))
	const unlockedKeys = unlockedRows.map((r) => r.upgradeKey)

	const allNpcs = await db.select().from(gymNpcs)
	const userStats = await fetchUserStatsForContent(userId, db)

	const generatedDialogs: string[] = []
	const generatedPortraits: string[] = []

	for (const npc of allNpcs) {
		const rel = await getOrCreateRelationship(gymRow.id, npc.key, db)
		const stage = getRelationshipStage(rel.relationshipLevel)
		const existing = await getCurrentDialogBatch(gymRow.id, npc.key, stage, db)

		if (!existing) {
			try {
				await generateDialogBatch(
					gymRow.id,
					npc.key,
					stage,
					aiService,
					db,
					userStats,
				)
				generatedDialogs.push(npc.key)
			} catch (err) {
				console.warn(
					`[content] dialog batch failed for ${npc.key}:`,
					(err as Error).message,
				)
			}
		}

		if (stage >= 2) {
			const portraitPath = await refreshStagePortrait(
				npc.key,
				npc.name,
				stage,
				unlockedKeys,
				aiService,
				db,
			)
				.then(() => `${npc.key}_stage${stage}`)
				.catch(() => null)
			if (portraitPath) generatedPortraits.push(portraitPath)
		}
	}

	const event = await generateGymEventForUser(
		gymRow.id,
		gymRow.level,
		unlockedKeys,
		userStats,
		aiService,
		db,
	)

	if (event) {
		await db
			.update(userGyms)
			.set({ todayEventData: event })
			.where(eq(userGyms.id, gymRow.id))
	}

	return { dialogs: generatedDialogs, event, portraits: generatedPortraits }
}

/** How far back the nightly content job looks for signs of life. */
export const ACTIVE_GYM_WINDOW_DAYS = 7

/**
 * Users whose gym should get fresh nightly content: anyone active in the
 * last `days` days — opened the gym home, visited the gym, checked in or
 * used a login session — plus gyms created in that window. (It used to be
 * only gyms *created* in the last week, so long-time users never got any.)
 */
export async function findActiveGymUserIds(
	db: Db,
	now: Date = new Date(),
	days: number = ACTIVE_GYM_WINDOW_DAYS,
): Promise<string[]> {
	const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
	const rows = await db
		.select({ userId: userGyms.userId })
		.from(userGyms)
		.where(
			or(
				gte(userGyms.createdAt, since),
				gte(userGyms.lastOpenAt, since),
				gte(userGyms.lastGymVisitDate, since),
				exists(
					db
						.select({ one: sql`1` })
						.from(dailyCheckins)
						.where(
							and(
								eq(dailyCheckins.userId, userGyms.userId),
								gte(dailyCheckins.date, since),
							),
						),
				),
				exists(
					db
						.select({ one: sql`1` })
						.from(sessions)
						.where(
							and(
								eq(sessions.userId, userGyms.userId),
								gte(sessions.updatedAt, since),
							),
						),
				),
			),
		)
		.orderBy(asc(userGyms.id))
	return rows.map((r) => r.userId)
}

/**
 * The nightly gym job: dialog batches, today's event and stage portraits for
 * every active gym. Dialog batches skip NPCs that still have an unexpired
 * batch; the scheduler runs this once per UTC day (scheduled_job_runs).
 */
export async function generateNightlyGymContent(
	aiService: AIService,
	db: Db,
	now: Date = new Date(),
): Promise<{ processed: number; skipped: number; total: number }> {
	const userIds = await findActiveGymUserIds(db, now)
	const result = await processContentBatch(userIds, aiService, db)
	return { ...result, total: userIds.length }
}

export async function processContentBatch(
	userIds: string[],
	aiService: AIService,
	db: Db,
): Promise<{ processed: number; skipped: number }> {
	const BATCH_SIZE = 5
	let processed = 0
	let skipped = 0

	for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
		const batch = userIds.slice(i, i + BATCH_SIZE)

		await Promise.all(
			batch.map(async (userId) => {
				try {
					await generateContentForUser(userId, aiService, db)
					processed++
				} catch (err) {
					console.warn(
						`[content] failed for user ${userId}:`,
						(err as Error).message,
					)
					skipped++
				}
			}),
		)

		if (i + BATCH_SIZE < userIds.length) {
			await new Promise((resolve) => setTimeout(resolve, 1000))
		}
	}

	return { processed, skipped }
}
