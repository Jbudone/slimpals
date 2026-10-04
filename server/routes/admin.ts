import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, asc, count, desc, eq, like, sql } from "drizzle-orm"
import { Router } from "express"
import { catalogChallenge } from "../../shared/challenges/catalog.js"
import { tierGoals } from "../../shared/challenges/tiers.js"
import { BURGER_SOURCE } from "../../shared/gym3d/burger.js"
import { CAMPAIGN_FALLBACK_LEVEL } from "../../shared/gym3d/campaign.js"
import { cosmeticOf } from "../../shared/gym3d/cosmetics.js"
import { themeOf, trackSteps } from "../../shared/gym3d/rewardTrack.js"
import { STAFF, STAFF_MAX_LEVEL, staffDef } from "../../shared/gym3d/staff.js"
import { storyFinaleOf } from "../../shared/gym3d/story.js"
import { db } from "../db/index.js"
import {
	accounts,
	badges,
	challenges,
	dailyCheckins,
	foodLogs,
	gymCosmetics,
	gymHires,
	gymNpcDailyState,
	gymNpcs,
	gymOpenWalls,
	gymPieces,
	gymRewards,
	gymStaff,
	gymUpgradesCatalog,
	reactions,
	sessions,
	socialPosts,
	sprints,
	tournamentParticipants,
	tournaments,
	userBadges,
	userChallenges,
	userGymNpcRelationships,
	userGyms,
	userGymUpgrades,
	users,
	weightEntries,
} from "../db/schema.js"
import { IMPERSONATOR_COOKIE, parseCookies } from "../lib/cookies.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type {
	AIService,
	ChallengeGoal,
	GymEventData,
	SprintTask,
} from "../services/ai/index.js"
import {
	createCatalogChallenge,
	generateChallengeForMonth,
} from "../services/challenges/index.js"
import { activeGymOf } from "../services/gym/activeGym.js"
import { BuildError } from "../services/gym/build3d.js"
import { grantCosmetic } from "../services/gym/cosmetics.js"
import {
	deriveRelationshipFromDays,
	generateDialogBatch,
	getCurrentDialogBatch,
	getOrCreateRelationship,
	getRelationshipStage,
	getStageLabel,
	type RelationshipStage,
} from "../services/gym/dialog.js"
import {
	deriveProgressionFromDays,
	getOrCreateGym,
} from "../services/gym/index.js"
import { UPGRADE_LAYOUT } from "../services/gym/layout.js"
import { resetGymLayout } from "../services/gym/layout3dStore.js"
import { dayKey } from "../services/gym/rewards.js"
import { setTrackStep } from "../services/gym/rewardTrack.js"
import {
	clearTrackOverride,
	loadTrackOverride,
	MONTH_RE,
	saveTrackOverride,
} from "../services/gym/rewardTrackOverride.js"
import type { ActivityStep } from "../services/gym/simulation.js"
import { staffCards } from "../services/gym/staff.js"
import type { Scheduler } from "../services/scheduler/index.js"
import { isSchedulerEnabled } from "../services/scheduler/schedule.js"
import {
	generateSprintForUser,
	generateSprintsForAllUsers,
} from "../services/sprints/index.js"
import {
	computeScore,
	resolveTournament,
	type TournamentType,
} from "../services/tournaments/index.js"
import { fetchUserStats } from "./gym.js"

function startOfToday(): Date {
	const d = new Date()
	d.setHours(0, 0, 0, 0)
	return d
}

function isValidGoalSequence(value: unknown): value is ActivityStep[] {
	if (!Array.isArray(value)) return false
	return value.every(
		(step) =>
			typeof step === "object" &&
			step !== null &&
			["warmup", "main", "cooldown"].includes(
				(step as { type?: unknown }).type as string,
			) &&
			typeof (step as { durationMin?: unknown }).durationMin === "number" &&
			(step as { durationMin: number }).durationMin > 0 &&
			typeof (step as { equipmentCategory?: unknown }).equipmentCategory ===
				"string",
	)
}

async function createSessionCookie(userId: string): Promise<string> {
	const token = randomBytes(32).toString("hex")
	const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-please-change"

	await db.insert(sessions).values({
		id: randomUUID(),
		token,
		userId,
		expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	})

	const signature = createHmac("sha256", secret).update(token).digest("base64")
	const cookieValue = encodeURIComponent(`${token}.${signature}`)
	return `better-auth.session_token=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
}

function getMondayOfWeek(d: Date = new Date()): Date {
	const date = new Date(d)
	date.setUTCHours(0, 0, 0, 0)
	const day = date.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	date.setUTCDate(date.getUTCDate() - diff)
	return date
}

export function createAdminRouter(aiService: AIService, scheduler: Scheduler) {
	const adminRouter = Router()
	adminRouter.use(requireAdmin)

	// Scheduled jobs (gh-122): last run + next due per job, and "Run now".
	adminRouter.get("/admin/scheduler", async (_req, res) => {
		res.json({
			enabled: isSchedulerEnabled(),
			running: scheduler.running,
			jobs: await scheduler.status(),
		})
	})

	adminRouter.post("/admin/scheduler/:job/run", async (req, res) => {
		const key = String(req.params.job)
		if (!scheduler.jobs.some((j) => j.key === key)) {
			res.status(404).json({ error: "Unknown job" })
			return
		}
		const run = await scheduler.runNow(key)
		if (run.status === "busy") {
			res.status(409).json({ error: "That job is already running" })
			return
		}
		res.json(run)
	})

	adminRouter.get("/admin/users", async (_req, res) => {
		const rows = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				isAdmin: users.isAdmin,
				createdAt: users.createdAt,
			})
			.from(users)
			.orderBy(asc(users.createdAt))
		res.json(rows)
	})

	adminRouter.post("/admin/users", async (req, res) => {
		const {
			name,
			email,
			password = "TestPass1!",
		} = req.body as { name?: string; email?: string; password?: string }

		const ts = Date.now()
		const resolvedEmail = email ?? `test-${ts}@slimpals.test`
		const resolvedName = name ?? `Test User ${ts}`

		const userId = randomUUID()
		const accountId = randomUUID()
		const hashedPassword = await hashPassword(password)

		await db
			.insert(users)
			.values({ id: userId, email: resolvedEmail, name: resolvedName })
		await db.insert(accounts).values({
			id: accountId,
			accountId: userId,
			providerId: "credential",
			userId,
			password: hashedPassword,
		})

		res
			.status(201)
			.json({ id: userId, name: resolvedName, email: resolvedEmail, password })
	})

	adminRouter.delete("/admin/users/:id", async (req, res) => {
		await db.delete(users).where(eq(users.id, req.params.id))
		res.json({ success: true })
	})

	adminRouter.post("/admin/impersonate/:id", async (req, res) => {
		const { id } = req.params
		const [user] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, id))
		if (!user) {
			res.status(404).json({ error: "User not found" })
			return
		}

		// If already impersonating (e.g. switching target from inside the
		// impersonated session), keep chaining back to the original admin
		// rather than the currently-impersonated user.
		const adminId =
			parseCookies(req.headers.cookie)[IMPERSONATOR_COOKIE] ??
			(req as unknown as AuthRequest).user.id
		const sessionCookie = await createSessionCookie(id)

		res.setHeader("Set-Cookie", [
			sessionCookie,
			`${IMPERSONATOR_COOKIE}=${adminId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
		])
		res.json({ success: true })
	})

	adminRouter.post("/admin/seed/:id/checkins", async (req, res) => {
		const { id } = req.params
		const { days = 7 } = req.body as { days?: number }

		await db.delete(dailyCheckins).where(eq(dailyCheckins.userId, id))

		const now = new Date()
		const inserts = []
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(now)
			d.setUTCHours(0, 0, 0, 0)
			d.setUTCDate(d.getUTCDate() - i)
			inserts.push({ userId: id, date: d, streakCount: days - i })
		}
		await db.insert(dailyCheckins).values(inserts)
		res.json({ seeded: days })
	})

	adminRouter.post("/admin/seed/:id/weight", async (req, res) => {
		const { id } = req.params
		const {
			count = 5,
			startKg = 90,
			endKg = 85,
		} = req.body as { count?: number; startKg?: number; endKg?: number }

		const inserts = []
		for (let i = 0; i < count; i++) {
			const fraction = count === 1 ? 0 : i / (count - 1)
			const weightKg = startKg + (endKg - startKg) * fraction
			const d = new Date()
			d.setUTCDate(d.getUTCDate() - (count - 1 - i))
			inserts.push({
				userId: id,
				weightKg: Math.round(weightKg * 10),
				recordedAt: d,
			})
		}
		await db.insert(weightEntries).values(inserts)
		res.json({ seeded: count })
	})

	adminRouter.post("/admin/seed/:id/badges", async (req, res) => {
		const { id } = req.params
		const { keys = [] } = req.body as { keys?: string[] }

		if (keys.length === 0) {
			res.json({ awarded: 0 })
			return
		}

		const badgeRows = await db
			.select({ id: badges.id, key: badges.key })
			.from(badges)
		const keyToId = new Map(badgeRows.map((b) => [b.key, b.id]))

		const earned = await db
			.select({ badgeId: userBadges.badgeId })
			.from(userBadges)
			.where(eq(userBadges.userId, id))
		const earnedIds = new Set(earned.map((e) => e.badgeId))

		const toInsert = keys
			.map((k) => keyToId.get(k))
			.filter(
				(badgeId): badgeId is number =>
					badgeId !== undefined && !earnedIds.has(badgeId),
			)
			.map((badgeId) => ({ userId: id, badgeId }))

		if (toInsert.length > 0) {
			await db.insert(userBadges).values(toInsert)
		}
		res.json({ awarded: toInsert.length })
	})

	adminRouter.post("/admin/seed/:id/food", async (req, res) => {
		const { id } = req.params
		const { count = 3 } = req.body as { count?: number }

		const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const
		const inserts = []
		for (let i = 0; i < count; i++) {
			const d = new Date()
			d.setUTCDate(d.getUTCDate() - (count - 1 - i))
			inserts.push({
				userId: id,
				photoUrl: "/uploads/admin-seed-food.jpg",
				aiAnalysis: {
					foods: ["chicken", "broccoli"],
					macros: { calories: 420, protein: 40, carbs: 28, fat: 14 },
					coachMessage: "Solid macros!",
					alternatives: [],
				},
				mealType: mealTypes[i % mealTypes.length],
				loggedAt: d,
			})
		}
		await db.insert(foodLogs).values(inserts)
		res.json({ seeded: count })
	})

	adminRouter.get("/admin/users/:id/challenge", async (req, res) => {
		const { id } = req.params
		const now = new Date()
		const month = now.getUTCMonth() + 1
		const year = now.getUTCFullYear()

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, month), eq(challenges.year, year)))
			.limit(1)

		if (!challenge) {
			res.json({
				challenge: null,
				joined: false,
				completedTasks: null,
				completedAt: null,
				goalsCompleted: 0,
				totalGoals: 0,
			})
			return
		}

		const [userChallenge] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, id),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
			.limit(1)

		const goals = tierGoals(
			challenge.tasks as ChallengeGoal[],
			userChallenge?.tier ?? "silver",
		)
		const completedTasks = userChallenge
			? (userChallenge.completedTasks as Record<string, number>)
			: null
		const goalsCompleted = completedTasks
			? goals.filter((g) => (completedTasks[g.id] ?? 0) >= g.target).length
			: 0

		res.json({
			challenge: {
				id: challenge.id,
				title: challenge.title,
				description: challenge.description,
				theme: challenge.theme,
				month: challenge.month,
				year: challenge.year,
				goals,
			},
			joined: !!userChallenge,
			tier: userChallenge?.tier ?? null,
			completedTasks,
			completedAt: userChallenge?.completedAt ?? null,
			goalsCompleted,
			totalGoals: goals.length,
		})
	})

	adminRouter.delete("/admin/users/:id/challenge", async (req, res) => {
		const { id } = req.params
		const [result] = await db
			.delete(userChallenges)
			.where(eq(userChallenges.userId, id))
		res.json({ deleted: result.affectedRows })
	})

	adminRouter.get("/admin/users/:id/sprint", async (req, res) => {
		const { id } = req.params
		const monday = getMondayOfWeek()

		const [sprint] = await db
			.select()
			.from(sprints)
			.where(and(eq(sprints.userId, id), eq(sprints.weekStart, monday)))
			.limit(1)

		if (!sprint) {
			res.json({
				sprint: null,
				completedTasks: null,
				completedAt: null,
				progress: 0,
			})
			return
		}

		const tasks = sprint.tasks as SprintTask[]
		const completedTasks = (sprint.completedTasks ?? []) as string[]

		res.json({
			sprint: {
				id: sprint.id,
				title: sprint.title,
				weekStart: sprint.weekStart,
				tasks,
			},
			completedTasks,
			completedAt: sprint.completedAt,
			progress:
				tasks.length > 0
					? Math.round((completedTasks.length / tasks.length) * 100)
					: 0,
		})
	})

	adminRouter.delete("/admin/users/:id/sprint", async (req, res) => {
		const { id } = req.params
		const [result] = await db.delete(sprints).where(eq(sprints.userId, id))
		res.json({ deleted: result.affectedRows })
	})

	adminRouter.get("/admin/users/:id/weight", async (req, res) => {
		const { id } = req.params
		const rows = await db
			.select()
			.from(weightEntries)
			.where(eq(weightEntries.userId, id))
			.orderBy(desc(weightEntries.recordedAt))

		res.json(
			rows.map((row) => ({
				id: row.id,
				weightKg: row.weightKg / 10,
				note: row.note,
				recordedAt: row.recordedAt,
				source: row.source,
			})),
		)
	})

	adminRouter.get("/admin/users/:id/food", async (req, res) => {
		const { id } = req.params
		const rows = await db
			.select()
			.from(foodLogs)
			.where(eq(foodLogs.userId, id))
			.orderBy(desc(foodLogs.loggedAt))

		res.json(
			rows.map((row) => ({
				id: row.id,
				photoUrl: row.photoUrl,
				aiAnalysis: row.aiAnalysis,
				mealType: row.mealType,
				loggedAt: row.loggedAt,
				isShared: row.isShared,
			})),
		)
	})

	adminRouter.patch("/admin/weight/:id", async (req, res) => {
		const entryId = Number(req.params.id)
		if (Number.isNaN(entryId)) {
			res.status(400).json({ error: "Invalid entry ID" })
			return
		}

		const { weightKg, note, recordedAt } = req.body as {
			weightKg?: number
			note?: string | null
			recordedAt?: string
		}

		if (
			weightKg !== undefined &&
			(typeof weightKg !== "number" || weightKg <= 0)
		) {
			res.status(400).json({ error: "weightKg must be a positive number" })
			return
		}

		const [existing] = await db
			.select({ id: weightEntries.id })
			.from(weightEntries)
			.where(eq(weightEntries.id, entryId))

		if (!existing) {
			res.status(404).json({ error: "Weight entry not found" })
			return
		}

		const updates: Partial<typeof weightEntries.$inferInsert> = {}
		if (weightKg !== undefined) updates.weightKg = Math.round(weightKg * 10)
		if (note !== undefined) updates.note = note
		if (recordedAt !== undefined) updates.recordedAt = new Date(recordedAt)

		if (Object.keys(updates).length > 0) {
			await db
				.update(weightEntries)
				.set(updates)
				.where(eq(weightEntries.id, entryId))
		}

		const [row] = await db
			.select()
			.from(weightEntries)
			.where(eq(weightEntries.id, entryId))

		res.json({
			id: row.id,
			weightKg: row.weightKg / 10,
			note: row.note,
			recordedAt: row.recordedAt,
			source: row.source,
		})
	})

	adminRouter.delete("/admin/weight/:id", async (req, res) => {
		const entryId = Number(req.params.id)
		if (Number.isNaN(entryId)) {
			res.status(400).json({ error: "Invalid entry ID" })
			return
		}

		const [existing] = await db
			.select({ id: weightEntries.id })
			.from(weightEntries)
			.where(eq(weightEntries.id, entryId))

		if (!existing) {
			res.status(404).json({ error: "Weight entry not found" })
			return
		}

		await db.delete(weightEntries).where(eq(weightEntries.id, entryId))

		res.json({ success: true })
	})

	const VALID_MEAL_TYPES: (typeof foodLogs.$inferInsert)["mealType"][] = [
		"breakfast",
		"lunch",
		"dinner",
		"snack",
	]

	adminRouter.patch("/admin/food/:id", async (req, res) => {
		const entryId = Number(req.params.id)
		if (Number.isNaN(entryId)) {
			res.status(400).json({ error: "Invalid entry ID" })
			return
		}

		const { mealType, loggedAt } = req.body as {
			mealType?: string
			loggedAt?: string
		}

		if (
			mealType !== undefined &&
			!VALID_MEAL_TYPES.includes(
				mealType as (typeof foodLogs.$inferInsert)["mealType"],
			)
		) {
			res.status(400).json({
				error: `mealType must be one of: ${VALID_MEAL_TYPES.join(", ")}`,
			})
			return
		}

		const [existing] = await db
			.select({ id: foodLogs.id })
			.from(foodLogs)
			.where(eq(foodLogs.id, entryId))

		if (!existing) {
			res.status(404).json({ error: "Food log not found" })
			return
		}

		const updates: Partial<typeof foodLogs.$inferInsert> = {}
		if (mealType !== undefined) {
			updates.mealType = mealType as (typeof foodLogs.$inferInsert)["mealType"]
		}
		if (loggedAt !== undefined) updates.loggedAt = new Date(loggedAt)

		if (Object.keys(updates).length > 0) {
			await db.update(foodLogs).set(updates).where(eq(foodLogs.id, entryId))
		}

		const [row] = await db
			.select()
			.from(foodLogs)
			.where(eq(foodLogs.id, entryId))

		res.json({
			id: row.id,
			photoUrl: row.photoUrl,
			aiAnalysis: row.aiAnalysis,
			mealType: row.mealType,
			loggedAt: row.loggedAt,
			isShared: row.isShared,
		})
	})

	adminRouter.delete("/admin/food/:id", async (req, res) => {
		const entryId = Number(req.params.id)
		if (Number.isNaN(entryId)) {
			res.status(400).json({ error: "Invalid entry ID" })
			return
		}

		const [existing] = await db
			.select({ id: foodLogs.id })
			.from(foodLogs)
			.where(eq(foodLogs.id, entryId))

		if (!existing) {
			res.status(404).json({ error: "Food log not found" })
			return
		}

		await db.delete(foodLogs).where(eq(foodLogs.id, entryId))

		res.json({ success: true })
	})

	adminRouter.get("/admin/users/:id/gym/npcs", async (req, res) => {
		const { id } = req.params

		const [gym] = await db.select().from(userGyms).where(activeGymOf(id))

		const catalog = await db.select().from(gymNpcs)

		const [relRows, unlockedRows, dailyRows] = gym
			? await Promise.all([
					db
						.select()
						.from(userGymNpcRelationships)
						.where(eq(userGymNpcRelationships.gymId, gym.id)),
					db
						.select()
						.from(userGymUpgrades)
						.where(eq(userGymUpgrades.gymId, gym.id)),
					db
						.select()
						.from(gymNpcDailyState)
						.where(
							and(
								eq(gymNpcDailyState.gymId, gym.id),
								eq(gymNpcDailyState.date, startOfToday()),
							),
						),
				])
			: [[], [], []]

		const unlockedKeys = new Set(unlockedRows.map((r) => r.upgradeKey))

		const npcs = catalog.map((npc) => {
			const rel = relRows.find((r) => r.npcKey === npc.key)
			const daily = dailyRows.find((r) => r.npcKey === npc.key)
			const level = rel?.relationshipLevel ?? 0
			return {
				key: npc.key,
				name: npc.name,
				role: npc.role,
				unlocked:
					!npc.unlockedByUpgradeKey ||
					unlockedKeys.has(npc.unlockedByUpgradeKey),
				relationshipLevel: level,
				relationshipStage: getRelationshipStage(level),
				stageLabel: getStageLabel(getRelationshipStage(level)),
				interactionCount: rel?.interactionCount ?? 0,
				gymDaysActive: rel?.gymDaysActive ?? 0,
				mood: daily?.mood ?? null,
				goalSequence: daily?.goalSequence ?? null,
			}
		})

		res.json({ hasGym: !!gym, npcs })
	})

	adminRouter.patch("/admin/users/:id/gym/npcs/:npcKey", async (req, res) => {
		const { id, npcKey } = req.params
		const { relationshipLevel, mood, goalSequence } = req.body as {
			relationshipLevel?: number
			mood?: number
			goalSequence?: unknown
		}

		const [npc] = await db.select().from(gymNpcs).where(eq(gymNpcs.key, npcKey))

		if (!npc) {
			res.status(404).json({ error: "NPC not found" })
			return
		}

		if (
			relationshipLevel !== undefined &&
			(!Number.isInteger(relationshipLevel) ||
				relationshipLevel < 0 ||
				relationshipLevel > 100)
		) {
			res
				.status(400)
				.json({ error: "relationshipLevel must be an integer 0-100" })
			return
		}

		if (
			mood !== undefined &&
			(!Number.isInteger(mood) || mood < -100 || mood > 100)
		) {
			res.status(400).json({ error: "mood must be an integer -100 to 100" })
			return
		}

		if (goalSequence !== undefined && !isValidGoalSequence(goalSequence)) {
			res.status(400).json({
				error:
					"goalSequence must be an array of { type, durationMin, equipmentCategory }",
			})
			return
		}

		const gym = await getOrCreateGym(id, db)
		const rel = await getOrCreateRelationship(gym.id, npcKey, db)

		if (relationshipLevel !== undefined) {
			await db
				.update(userGymNpcRelationships)
				.set({ relationshipLevel })
				.where(eq(userGymNpcRelationships.id, rel.id))
		}

		if (mood !== undefined || goalSequence !== undefined) {
			const dateStart = startOfToday()
			const [existingDaily] = await db
				.select()
				.from(gymNpcDailyState)
				.where(
					and(
						eq(gymNpcDailyState.gymId, gym.id),
						eq(gymNpcDailyState.npcKey, npcKey),
						eq(gymNpcDailyState.date, dateStart),
					),
				)

			if (existingDaily) {
				const updates: Partial<typeof gymNpcDailyState.$inferInsert> = {}
				if (mood !== undefined) updates.mood = mood
				if (goalSequence !== undefined)
					updates.goalSequence = goalSequence as ActivityStep[]
				await db
					.update(gymNpcDailyState)
					.set(updates)
					.where(eq(gymNpcDailyState.id, existingDaily.id))
			} else {
				const profile = npc.personalityProfile as { moodBaseline?: number }
				await db.insert(gymNpcDailyState).values({
					gymId: gym.id,
					npcKey,
					date: dateStart,
					mood: mood ?? profile.moodBaseline ?? 0,
					goalSequence: (goalSequence as ActivityStep[]) ?? [],
				})
			}
		}

		const [updatedRel] = await db
			.select()
			.from(userGymNpcRelationships)
			.where(eq(userGymNpcRelationships.id, rel.id))
		const [updatedDaily] = await db
			.select()
			.from(gymNpcDailyState)
			.where(
				and(
					eq(gymNpcDailyState.gymId, gym.id),
					eq(gymNpcDailyState.npcKey, npcKey),
					eq(gymNpcDailyState.date, startOfToday()),
				),
			)
		const unlockedRows2 = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))
		const unlockedKeys = new Set(unlockedRows2.map((r) => r.upgradeKey))

		res.json({
			key: npc.key,
			name: npc.name,
			role: npc.role,
			unlocked:
				!npc.unlockedByUpgradeKey || unlockedKeys.has(npc.unlockedByUpgradeKey),
			relationshipLevel: updatedRel.relationshipLevel,
			relationshipStage: getRelationshipStage(updatedRel.relationshipLevel),
			stageLabel: getStageLabel(
				getRelationshipStage(updatedRel.relationshipLevel),
			),
			interactionCount: updatedRel.interactionCount,
			gymDaysActive: updatedRel.gymDaysActive,
			mood: updatedDaily?.mood ?? null,
			goalSequence: updatedDaily?.goalSequence ?? null,
		})
	})

	adminRouter.get("/admin/users/:id/gym/hour-override", async (req, res) => {
		const { id } = req.params
		const [gym] = await db
			.select({ simulatedHourOverride: userGyms.simulatedHourOverride })
			.from(userGyms)
			.where(activeGymOf(id))

		res.json({
			hasGym: !!gym,
			hourOverride: gym?.simulatedHourOverride ?? null,
			currentHour: new Date().getHours(),
		})
	})

	adminRouter.patch("/admin/users/:id/gym/hour-override", async (req, res) => {
		const { id } = req.params
		const { hour } = req.body as { hour?: number | null }

		if (
			hour !== null &&
			hour !== undefined &&
			(!Number.isInteger(hour) || hour < 0 || hour > 23)
		) {
			res.status(400).json({ error: "hour must be an integer 0-23, or null" })
			return
		}

		const gym = await getOrCreateGym(id, db)
		await db
			.update(userGyms)
			.set({ simulatedHourOverride: hour ?? null })
			.where(eq(userGyms.id, gym.id))

		res.json({ hourOverride: hour ?? null })
	})

	// Sets (or clears, with { event: null }) the gym's event of the day, for
	// testing the in-gym event visuals without waiting for the AI content job.
	adminRouter.post("/admin/users/:id/gym/today-event", async (req, res) => {
		const { id } = req.params
		const { event } = req.body as { event?: unknown }
		if (event !== null) {
			const e = event as Partial<GymEventData> | undefined
			const types = [
				"competition",
				"class",
				"delivery",
				"special_guest",
				"maintenance",
			]
			const hours = e?.activeHours
			if (
				!e ||
				!types.includes(e.type as string) ||
				typeof e.title !== "string" ||
				!e.title.trim() ||
				!Array.isArray(hours) ||
				hours.length !== 2 ||
				!hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 24) ||
				hours[0] >= hours[1] ||
				(e.npcKey != null && typeof e.npcKey !== "string")
			) {
				res.status(400).json({
					error:
						"event needs type, title and activeHours [start, end] (0-24), or null",
				})
				return
			}
		}
		const gym = await getOrCreateGym(id, db)
		const e = event as GymEventData | null
		const data: GymEventData | null = e
			? {
					type: e.type,
					title: e.title.trim().slice(0, 80),
					description: String(e.description ?? "").slice(0, 200),
					npcKey: e.npcKey ?? null,
					activeHours: [e.activeHours[0], e.activeHours[1]],
					effects: {
						allNpcMoodBonus: Number(e.effects?.allNpcMoodBonus) || 0,
						xpMultiplier: Number(e.effects?.xpMultiplier) || 1,
					},
				}
			: null
		await db
			.update(userGyms)
			.set({ todayEventData: data })
			.where(eq(userGyms.id, gym.id))
		res.json({ todayEvent: data })
	})

	adminRouter.get(
		"/admin/users/:id/gym/npcs/:npcKey/dialogs",
		async (req, res) => {
			const { id, npcKey } = req.params
			const stageRaw = Number(req.query.stage)
			const regenerate = req.query.regenerate === "true"

			if (![0, 1, 2, 3].includes(stageRaw)) {
				res.status(400).json({ error: "stage must be an integer 0-3" })
				return
			}
			const stage = stageRaw as RelationshipStage

			const [npc] = await db
				.select()
				.from(gymNpcs)
				.where(eq(gymNpcs.key, npcKey))
			if (!npc) {
				res.status(404).json({ error: "NPC not found" })
				return
			}

			const gym = await getOrCreateGym(id, db)

			let dialogs = regenerate
				? null
				: await getCurrentDialogBatch(gym.id, npcKey, stage, db)

			if (!dialogs) {
				const userStats = await fetchUserStats(id)
				dialogs = await generateDialogBatch(
					gym.id,
					npcKey,
					stage,
					aiService,
					db,
					userStats,
				)
			}

			res.json({
				npcKey,
				stage,
				stageLabel: getStageLabel(stage),
				dialogs,
			})
		},
	)

	adminRouter.get("/admin/users/:id/gym/upgrades", async (req, res) => {
		const { id } = req.params

		const [gym] = await db.select().from(userGyms).where(activeGymOf(id))

		const catalog = await db
			.select()
			.from(gymUpgradesCatalog)
			.orderBy(asc(gymUpgradesCatalog.sortOrder))

		if (!gym) {
			res.json({
				hasGym: false,
				gym: null,
				upgrades: catalog.map((entry) => ({
					key: entry.key,
					name: entry.name,
					category: entry.category,
					requiredXp: entry.requiredXp,
					unlocksNpcKey: entry.unlocksNpcKey,
					status: "locked" as const,
					unlockedAt: null,
					placementData: null,
				})),
			})
			return
		}

		const claimedRows = await db
			.select()
			.from(userGymUpgrades)
			.where(eq(userGymUpgrades.gymId, gym.id))
		const claimedByKey = new Map(claimedRows.map((r) => [r.upgradeKey, r]))
		const pendingKeys = new Set(gym.pendingUpgradeKeys as string[])

		const upgrades = catalog.map((entry) => {
			const claimed = claimedByKey.get(entry.key)
			const status = claimed
				? ("claimed" as const)
				: pendingKeys.has(entry.key)
					? ("pending" as const)
					: ("locked" as const)
			return {
				key: entry.key,
				name: entry.name,
				category: entry.category,
				requiredXp: entry.requiredXp,
				unlocksNpcKey: entry.unlocksNpcKey,
				status,
				unlockedAt: claimed?.unlockedAt ?? null,
				placementData: claimed?.placementData ?? null,
			}
		})

		res.json({
			hasGym: true,
			gym: {
				level: gym.level,
				xp: gym.xp,
				coins: gym.coins,
				sweat: gym.sweat,
				greens: gym.greens,
				pendingUpgradeKeys: gym.pendingUpgradeKeys,
			},
			upgrades,
		})
	})

	adminRouter.post("/admin/users/:id/gym/progression", async (req, res) => {
		const { id } = req.params
		const { daysElapsed } = req.body as { daysElapsed?: number }

		if (
			daysElapsed === undefined ||
			!Number.isInteger(daysElapsed) ||
			daysElapsed < 0
		) {
			res
				.status(400)
				.json({ error: "daysElapsed must be a non-negative integer" })
			return
		}

		const gym = await getOrCreateGym(id, db)
		const catalog = await db
			.select({
				key: gymUpgradesCatalog.key,
				requiredXp: gymUpgradesCatalog.requiredXp,
			})
			.from(gymUpgradesCatalog)

		const progression = deriveProgressionFromDays(daysElapsed, catalog)
		const relationship = deriveRelationshipFromDays(daysElapsed)

		// Replace (not accumulate) gym-level state: every unlocked upgrade is
		// auto-claimed so the scrubbed gym reads as already populated, rather
		// than sitting behind an unclaimed-pending queue.
		await db
			.update(userGyms)
			.set({
				xp: progression.xp,
				level: progression.level,
				pendingUpgradeKeys: [],
			})
			.where(eq(userGyms.id, gym.id))

		await db.delete(userGymUpgrades).where(eq(userGymUpgrades.gymId, gym.id))
		if (progression.unlockedUpgradeKeys.length > 0) {
			await db.insert(userGymUpgrades).values(
				progression.unlockedUpgradeKeys.map((upgradeKey) => ({
					gymId: gym.id,
					upgradeKey,
					placementData: UPGRADE_LAYOUT[upgradeKey] ?? null,
				})),
			)
		}

		// Replace every NPC's relationshipLevel/gymDaysActive uniformly —
		// v1 ramp is the same for all NPCs (gh-110).
		const npcs = await db.select({ key: gymNpcs.key }).from(gymNpcs)
		for (const npc of npcs) {
			await getOrCreateRelationship(gym.id, npc.key, db)
			await db
				.update(userGymNpcRelationships)
				.set({
					relationshipLevel: relationship.relationshipLevel,
					gymDaysActive: relationship.gymDaysActive,
				})
				.where(
					and(
						eq(userGymNpcRelationships.gymId, gym.id),
						eq(userGymNpcRelationships.npcKey, npc.key),
					),
				)
		}

		// The 3D layout was seeded from the old unlocks; drop it so the next
		// GET /gym/layout seeds it again from the scrubbed set.
		await resetGymLayout(gym.id, db)

		res.json({
			daysElapsed: progression.daysElapsed,
			xp: progression.xp,
			level: progression.level,
			unlockedUpgradeKeys: progression.unlockedUpgradeKeys,
			relationshipLevel: relationship.relationshipLevel,
			gymDaysActive: relationship.gymDaysActive,
		})
	})

	// 3D gym (gym3d slice 1): wipe a user's stored layout; the next
	// GET /gym/layout seeds it again from their claimed upgrades.
	adminRouter.post("/admin/users/:id/gym/layout/reset", async (req, res) => {
		const [gym] = await db
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(activeGymOf(req.params.id))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		await resetGymLayout(gym.id, db)
		res.json({ success: true })
	})

	// 3D gym currencies: grant (or, negative, take back) coins (slice 2),
	// Sweat or Greens (gym home); a balance never drops below 0. Each answers
	// { coins | sweat | greens: <new balance> }.
	const COLS = {
		coins: userGyms.coins,
		sweat: userGyms.sweat,
		greens: userGyms.greens,
	} as const
	for (const what of ["coins", "sweat", "greens"] as const) {
		adminRouter.post(`/admin/users/:id/gym/${what}`, async (req, res) => {
			const amount = Number((req.body as { amount?: unknown })?.amount)
			if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1e6) {
				res.status(400).json({ error: "amount must be a non-zero integer" })
				return
			}
			const [gym] = await db
				.select({ id: userGyms.id })
				.from(userGyms)
				.where(activeGymOf(String(req.params.id)))
			if (!gym) {
				res.status(404).json({ error: "User has no gym" })
				return
			}
			const col = COLS[what]
			await db
				.update(userGyms)
				.set({ [what]: sql`GREATEST(0, ${col} + ${amount})` })
				.where(eq(userGyms.id, gym.id))
			const [row] = await db
				.select({ n: col })
				.from(userGyms)
				.where(eq(userGyms.id, gym.id))
			res.json({ [what]: row?.n ?? 0 })
		})
	}

	// Test tool (gym home): sets a staff member's level (1..5) so the effect of
	// training can be seen at once. `npcKey` is a named staff key, `hire:<id>`
	// or "all" (every named staff member). Answers the gym's staff cards.
	adminRouter.post("/admin/users/:id/gym/staff-level", async (req, res) => {
		const body = (req.body ?? {}) as { npcKey?: unknown; level?: unknown }
		const level = Number(body.level)
		if (!Number.isInteger(level) || level < 1 || level > STAFF_MAX_LEVEL) {
			res.status(400).json({
				error: `level must be a whole number from 1 to ${STAFF_MAX_LEVEL}`,
			})
			return
		}
		const [gym] = await db
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(activeGymOf(String(req.params.id)))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		const key = String(body.npcKey ?? "")
		const hireId = /^hire:(\d+)$/.exec(key)?.[1]
		if (hireId) {
			const [hire] = await db
				.select({ id: gymHires.id })
				.from(gymHires)
				.where(and(eq(gymHires.id, Number(hireId)), eq(gymHires.gymId, gym.id)))
			if (!hire) {
				res.status(404).json({ error: "No such hire" })
				return
			}
			await db.update(gymHires).set({ level }).where(eq(gymHires.id, hire.id))
		} else {
			const keys = key === "all" ? STAFF.map((s) => s.key) : [key]
			if (!keys.every((k) => staffDef(k))) {
				res.status(404).json({ error: "Unknown staff member" })
				return
			}
			for (const k of keys)
				await db
					.insert(gymStaff)
					.values({ gymId: gym.id, npcKey: k, level })
					.onDuplicateKeyUpdate({ set: { level } })
		}
		res.json({ staff: await staffCards(db, gym.id) })
	})

	// Test tool (gym home): wipes one of the newer gym systems for a user so it
	// can be tried from scratch: trained staff levels, hires, open walls, or
	// today's tap-to-hustle bonuses. Answers { removed }.
	adminRouter.post("/admin/users/:id/gym/reset-extras", async (req, res) => {
		const what = String((req.body as { what?: unknown })?.what ?? "")
		const [gym] = await db
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(activeGymOf(String(req.params.id)))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		let removed = 0
		if (what === "staff")
			removed = (await db.delete(gymStaff).where(eq(gymStaff.gymId, gym.id)))[0]
				.affectedRows
		else if (what === "hires")
			removed = (await db.delete(gymHires).where(eq(gymHires.gymId, gym.id)))[0]
				.affectedRows
		else if (what === "walls")
			removed = (
				await db.delete(gymOpenWalls).where(eq(gymOpenWalls.gymId, gym.id))
			)[0].affectedRows
		else if (what === "hustle")
			removed = (
				await db
					.delete(gymRewards)
					.where(
						and(
							eq(gymRewards.gymId, gym.id),
							like(gymRewards.source, `hustle:${dayKey()}:%`),
						),
					)
			)[0].affectedRows
		else if (what === "burger")
			removed = (
				await db
					.delete(gymRewards)
					.where(
						and(
							eq(gymRewards.gymId, gym.id),
							eq(gymRewards.source, BURGER_SOURCE),
						),
					)
			)[0].affectedRows
		else if (what === "milestones")
			removed = (
				await db
					.delete(gymRewards)
					.where(
						and(
							eq(gymRewards.gymId, gym.id),
							like(gymRewards.source, "challenge:%:m%"),
						),
					)
			)[0].affectedRows
		else if (what === "story")
			removed = (
				await db
					.delete(gymRewards)
					.where(
						and(
							eq(gymRewards.gymId, gym.id),
							like(gymRewards.source, "story:%"),
						),
					)
			)[0].affectedRows
		else if (what === "cosmetics") {
			// the cosmetics themselves and the decor pieces they put on show
			await db
				.delete(gymPieces)
				.where(
					and(
						eq(gymPieces.gymId, gym.id),
						like(gymPieces.upgradeKey, "cosmetic:%"),
					),
				)
			removed = (
				await db.delete(gymCosmetics).where(eq(gymCosmetics.gymId, gym.id))
			)[0].affectedRows
		} else {
			res.status(400).json({
				error:
					"what must be staff, hires, walls, hustle, burger, milestones, story or cosmetics",
			})
			return
		}
		res.json({ removed })
	})

	// Test tool (campaigns): marks the gym's story as finished, so the next
	// campaign can be begun without playing through all of it.
	adminRouter.post("/admin/users/:id/gym/finish-story", async (req, res) => {
		const [gym] = await db
			.select({ id: userGyms.id, campaign: userGyms.campaign })
			.from(userGyms)
			.where(activeGymOf(String(req.params.id)))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		const finale = storyFinaleOf(gym.campaign)
		if (!finale) {
			res.status(409).json({
				error: `This campaign has no story: it can be finished from gym level ${CAMPAIGN_FALLBACK_LEVEL}`,
			})
			return
		}
		await db
			.insert(gymRewards)
			.ignore()
			.values({
				gymId: gym.id,
				source: `story:${finale}`,
				sweat: 0,
				greens: 0,
			})
		res.json({ ok: true })
	})

	// Test tool (cosmetics): gives the user's gym a cosmetic by key. Answers
	// { granted } with its name, or null when they already had it.
	adminRouter.post("/admin/users/:id/gym/cosmetic", async (req, res) => {
		const key = String((req.body as { key?: unknown })?.key ?? "")
		if (!cosmeticOf(key)) {
			res.status(400).json({ error: "Unknown cosmetic" })
			return
		}
		const [gym] = await db
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(activeGymOf(String(req.params.id)))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		res.json({ granted: await grantCosmetic(db, gym.id, key, "admin") })
	})

	// Test tool (reward track): makes this month's track stand at `step`
	// steps claimed (0 resets it) without paying, and frees today's claim.
	adminRouter.post("/admin/users/:id/gym/track-step", async (req, res) => {
		const step = Number((req.body as { step?: unknown })?.step)
		if (!Number.isInteger(step) || step < 0) {
			res.status(400).json({ error: "step must be a whole number, 0 or more" })
			return
		}
		const [gym] = await db
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(activeGymOf(String(req.params.id)))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		res.json(await setTrackStep(db, gym.id, String(req.params.id), step))
	})

	// Authoring (reward track, #126): a month's theme and per-step payouts.
	// GET answers the override (null when none) and the effective steps.
	adminRouter.get("/admin/reward-track/:month", async (req, res) => {
		const month = String(req.params.month)
		if (!MONTH_RE.test(month)) {
			res.status(400).json({ error: "month must be YYYY-MM" })
			return
		}
		const override = await loadTrackOverride(db, month)
		res.json({
			month,
			theme: themeOf(month, override),
			override,
			steps: trackSteps(month, override),
		})
	})

	adminRouter.put("/admin/reward-track/:month", async (req, res) => {
		const month = String(req.params.month)
		try {
			const override = await saveTrackOverride(db, month, req.body)
			res.json({
				month,
				theme: themeOf(month, override),
				override,
				steps: trackSteps(month, override),
			})
		} catch (e) {
			if (e instanceof BuildError) {
				res.status(e.status).json({ error: e.message })
				return
			}
			throw e
		}
	})

	adminRouter.delete("/admin/reward-track/:month", async (req, res) => {
		const month = String(req.params.month)
		if (!MONTH_RE.test(month)) {
			res.status(400).json({ error: "month must be YYYY-MM" })
			return
		}
		await clearTrackOverride(db, month)
		res.json({ month, override: null, steps: trackSteps(month) })
	})

	// Test tool (gym home): moves the gym's idle-income clocks and its last
	// open back by `hours`, as if the player had been away that long. Coin
	// bubbles fill (up to their caps), the next open shows "Welcome back",
	// and a running rush hour ends that much sooner. Answers { hours }.
	adminRouter.post("/admin/users/:id/gym/away", async (req, res) => {
		const hours = Number((req.body as { hours?: unknown })?.hours)
		if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
			res.status(400).json({ error: "hours must be between 0 and 720" })
			return
		}
		const [gym] = await db
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(activeGymOf(String(req.params.id)))
		if (!gym) {
			res.status(404).json({ error: "User has no gym" })
			return
		}
		const secs = Math.round(hours * 3600)
		const back = (col: unknown) =>
			sql`DATE_SUB(${col}, INTERVAL ${secs} SECOND)`
		await db
			.update(userGyms)
			.set({
				deskCollectedAt: back(
					sql`COALESCE(${userGyms.deskCollectedAt}, ${userGyms.createdAt})`,
				),
				kitchenCollectedAt: back(
					sql`COALESCE(${userGyms.kitchenCollectedAt}, ${userGyms.createdAt})`,
				),
				lastOpenAt: back(sql`COALESCE(${userGyms.lastOpenAt}, NOW())`),
				kitchenRushEndsAt: back(userGyms.kitchenRushEndsAt),
			})
			.where(eq(userGyms.id, gym.id))
		await db
			.update(gymPieces)
			.set({
				collectedAt: back(
					sql`COALESCE(${gymPieces.collectedAt}, ${gymPieces.createdAt})`,
				),
			})
			.where(eq(gymPieces.gymId, gym.id))
		res.json({ hours })
	})

	adminRouter.get("/admin/tournaments", async (_req, res) => {
		const rows = await db
			.select()
			.from(tournaments)
			.orderBy(desc(tournaments.startDate))

		const participantCounts = await db
			.select({
				tournamentId: tournamentParticipants.tournamentId,
				count: count(),
			})
			.from(tournamentParticipants)
			.groupBy(tournamentParticipants.tournamentId)

		const countMap = new Map(
			participantCounts.map((p) => [p.tournamentId, p.count]),
		)

		res.json(
			rows.map((t) => ({
				id: t.id,
				name: t.name,
				creatorId: t.creatorId,
				featured: t.systemKey !== null,
				startDate: t.startDate,
				endDate: t.endDate,
				type: t.type,
				goalValue: t.goalValue,
				rewardDescription: t.rewardDescription,
				winnerId: t.winnerId,
				victoryMessage: t.victoryMessage,
				resolvedAt: t.resolvedAt,
				participantCount: countMap.get(t.id) ?? 0,
			})),
		)
	})

	adminRouter.get("/admin/tournaments/:id", async (req, res) => {
		const tournamentId = Number(req.params.id)
		if (Number.isNaN(tournamentId)) {
			res.status(400).json({ error: "Invalid tournament ID" })
			return
		}

		const [tournament] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		if (!tournament) {
			res.status(404).json({ error: "Tournament not found" })
			return
		}

		const participants = await db
			.select({
				userId: tournamentParticipants.userId,
				userName: users.name,
				joinedAt: tournamentParticipants.joinedAt,
				completed: tournamentParticipants.completed,
			})
			.from(tournamentParticipants)
			.innerJoin(users, eq(tournamentParticipants.userId, users.id))
			.where(eq(tournamentParticipants.tournamentId, tournamentId))

		const withScores = await Promise.all(
			participants.map(async (p) => ({
				...p,
				score: await computeScore(
					p.userId,
					tournament.type as TournamentType,
					tournament.startDate,
					tournament.endDate,
				),
			})),
		)
		withScores.sort((a, b) => b.score - a.score)

		res.json({
			tournament: {
				id: tournament.id,
				name: tournament.name,
				creatorId: tournament.creatorId,
				startDate: tournament.startDate,
				endDate: tournament.endDate,
				type: tournament.type,
				goalValue: tournament.goalValue,
				rewardDescription: tournament.rewardDescription,
				winnerId: tournament.winnerId,
				victoryMessage: tournament.victoryMessage,
				resolvedAt: tournament.resolvedAt,
			},
			participants: withScores,
		})
	})

	const VALID_TOURNAMENT_TYPES: TournamentType[] = [
		"weight_loss",
		"step_count",
		"streak",
		"food_challenge",
	]

	adminRouter.post("/admin/tournaments/seed", async (req, res) => {
		const {
			creatorId,
			name,
			type,
			startDate,
			endDate,
			participantIds = [],
			goalValue,
			rewardDescription,
		} = req.body as {
			creatorId?: string
			name?: string
			type?: string
			startDate?: string
			endDate?: string
			participantIds?: string[]
			goalValue?: number
			rewardDescription?: string
		}

		if (!creatorId || !type) {
			res.status(400).json({ error: "creatorId and type are required" })
			return
		}

		if (!VALID_TOURNAMENT_TYPES.includes(type as TournamentType)) {
			res.status(400).json({
				error: `type must be one of: ${VALID_TOURNAMENT_TYPES.join(", ")}`,
			})
			return
		}

		const [creator] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, creatorId))
			.limit(1)

		if (!creator) {
			res.status(404).json({ error: "creatorId not found" })
			return
		}

		const start = startDate
			? new Date(startDate)
			: new Date(Date.now() - 7 * 86_400_000)
		const end = endDate
			? new Date(endDate)
			: new Date(Date.now() + 1 * 86_400_000)

		const [inserted] = await db
			.insert(tournaments)
			.values({
				name: name ?? `Seeded ${type} Tournament`,
				creatorId,
				startDate: start,
				endDate: end,
				type: type as TournamentType,
				goalValue: goalValue ?? null,
				rewardDescription: rewardDescription ?? null,
			})
			.$returningId()

		const uniqueParticipantIds = Array.from(
			new Set([creatorId, ...participantIds]),
		)
		await db.insert(tournamentParticipants).values(
			uniqueParticipantIds.map((userId) => ({
				tournamentId: inserted.id,
				userId,
			})),
		)

		const [tournament] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, inserted.id))

		res.status(201).json({
			tournament: {
				id: tournament.id,
				name: tournament.name,
				creatorId: tournament.creatorId,
				startDate: tournament.startDate,
				endDate: tournament.endDate,
				type: tournament.type,
				goalValue: tournament.goalValue,
				rewardDescription: tournament.rewardDescription,
				winnerId: tournament.winnerId,
				victoryMessage: tournament.victoryMessage,
				resolvedAt: tournament.resolvedAt,
			},
			participantIds: uniqueParticipantIds,
		})
	})

	adminRouter.post("/admin/tournaments/:id/resolve", async (req, res) => {
		const tournamentId = Number(req.params.id)
		if (Number.isNaN(tournamentId)) {
			res.status(400).json({ error: "Invalid tournament ID" })
			return
		}

		const [tournament] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		if (!tournament) {
			res.status(404).json({ error: "Tournament not found" })
			return
		}

		if (tournament.resolvedAt) {
			res.status(409).json({ error: "Tournament is already resolved" })
			return
		}

		await resolveTournament(tournamentId, aiService)

		const [updated] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		res.json({
			tournament: {
				id: updated.id,
				name: updated.name,
				creatorId: updated.creatorId,
				startDate: updated.startDate,
				endDate: updated.endDate,
				type: updated.type,
				goalValue: updated.goalValue,
				rewardDescription: updated.rewardDescription,
				winnerId: updated.winnerId,
				victoryMessage: updated.victoryMessage,
				resolvedAt: updated.resolvedAt,
			},
		})
	})

	adminRouter.delete("/admin/tournaments/:id", async (req, res) => {
		const tournamentId = Number(req.params.id)
		if (Number.isNaN(tournamentId)) {
			res.status(400).json({ error: "Invalid tournament ID" })
			return
		}

		const [tournament] = await db
			.select({ id: tournaments.id })
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		if (!tournament) {
			res.status(404).json({ error: "Tournament not found" })
			return
		}

		await db
			.delete(tournamentParticipants)
			.where(eq(tournamentParticipants.tournamentId, tournamentId))
		await db.delete(tournaments).where(eq(tournaments.id, tournamentId))

		res.json({ success: true })
	})

	adminRouter.get("/admin/social/posts", async (_req, res) => {
		const posts = await db
			.select({
				id: socialPosts.id,
				userId: socialPosts.userId,
				userName: sql<string>`coalesce(${users.name}, 'SlimPals')`,
				type: socialPosts.type,
				content: socialPosts.content,
				createdAt: socialPosts.createdAt,
			})
			.from(socialPosts)
			.leftJoin(users, eq(socialPosts.userId, users.id))
			.orderBy(desc(socialPosts.createdAt))

		if (posts.length === 0) {
			res.json([])
			return
		}

		const reactionCounts = await db
			.select({ postId: reactions.postId, count: count() })
			.from(reactions)
			.groupBy(reactions.postId)

		const countMap = new Map(reactionCounts.map((r) => [r.postId, r.count]))

		res.json(
			posts.map((p) => ({
				...p,
				reactionCount: countMap.get(p.id) ?? 0,
			})),
		)
	})

	const VALID_SOCIAL_POST_TYPES: (typeof socialPosts.$inferInsert)["type"][] = [
		"food_photo",
		"ai_message",
		"milestone",
		"weight_update",
		"challenge_completion",
	]

	adminRouter.post("/admin/social/posts", async (req, res) => {
		const { userId, type, content } = req.body as {
			userId?: string
			type?: string
			content?: unknown
		}

		if (!userId || !type) {
			res.status(400).json({ error: "userId and type are required" })
			return
		}

		if (
			!VALID_SOCIAL_POST_TYPES.includes(
				type as (typeof socialPosts.$inferInsert)["type"],
			)
		) {
			res.status(400).json({
				error: `type must be one of: ${VALID_SOCIAL_POST_TYPES.join(", ")}`,
			})
			return
		}

		if (
			typeof content !== "object" ||
			content === null ||
			Array.isArray(content)
		) {
			res.status(400).json({ error: "content must be an object" })
			return
		}

		const [user] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1)

		if (!user) {
			res.status(404).json({ error: "userId not found" })
			return
		}

		const [inserted] = await db
			.insert(socialPosts)
			.values({
				userId,
				type: type as (typeof socialPosts.$inferInsert)["type"],
				content,
			})
			.$returningId()

		const [post] = await db
			.select({
				id: socialPosts.id,
				userId: socialPosts.userId,
				userName: users.name,
				type: socialPosts.type,
				content: socialPosts.content,
				createdAt: socialPosts.createdAt,
			})
			.from(socialPosts)
			.innerJoin(users, eq(socialPosts.userId, users.id))
			.where(eq(socialPosts.id, inserted.id))

		res.status(201).json(post)
	})

	adminRouter.delete("/admin/social/posts/:id", async (req, res) => {
		const postId = Number(req.params.id)
		if (Number.isNaN(postId)) {
			res.status(400).json({ error: "Invalid post ID" })
			return
		}

		const [post] = await db
			.select({ id: socialPosts.id })
			.from(socialPosts)
			.where(eq(socialPosts.id, postId))

		if (!post) {
			res.status(404).json({ error: "Post not found" })
			return
		}

		await db.delete(reactions).where(eq(reactions.postId, postId))
		await db.delete(socialPosts).where(eq(socialPosts.id, postId))

		res.json({ success: true })
	})

	const DEFAULT_SEED_TASKS: SprintTask[] = [
		{ id: "task_1", title: "Log 3 meals" },
		{ id: "task_2", title: "Log a weight entry" },
		{ id: "task_3", title: "Complete a daily check-in" },
	]

	function computeSeedCompletion(
		taskIds: string[],
		completion: "none" | "partial" | "near_complete" | "complete",
	): string[] {
		if (completion === "none") return []
		if (completion === "complete") return taskIds
		if (completion === "near_complete") return taskIds.slice(0, -1)
		return taskIds.slice(0, Math.floor(taskIds.length / 2))
	}

	adminRouter.post("/admin/seed/:id/sprint", async (req, res) => {
		const { id } = req.params
		const {
			weekStart,
			completion = "complete",
			tasks: providedTasks,
		} = req.body as {
			weekStart?: string
			completion?: "none" | "partial" | "near_complete" | "complete"
			tasks?: SprintTask[]
		}

		const monday = getMondayOfWeek(weekStart ? new Date(weekStart) : undefined)

		let [sprint] = await db
			.select()
			.from(sprints)
			.where(and(eq(sprints.userId, id), eq(sprints.weekStart, monday)))
			.limit(1)

		if (!sprint) {
			const [inserted] = await db
				.insert(sprints)
				.values({
					userId: id,
					weekStart: monday,
					title: `Seeded Sprint ${monday.toISOString().slice(0, 10)}`,
					tasks: providedTasks ?? DEFAULT_SEED_TASKS,
				})
				.$returningId()
			;[sprint] = await db
				.select()
				.from(sprints)
				.where(eq(sprints.id, inserted.id))
		}

		const tasks = sprint.tasks as SprintTask[]
		const completedTasks = computeSeedCompletion(
			tasks.map((t) => t.id),
			completion,
		)

		await db
			.update(sprints)
			.set({
				completedTasks,
				completedAt: completion === "complete" ? new Date() : null,
			})
			.where(eq(sprints.id, sprint.id))

		res.status(201).json({
			sprint: {
				id: sprint.id,
				title: sprint.title,
				weekStart: sprint.weekStart,
				tasks,
			},
			completedTasks,
			completedAt: completion === "complete" ? new Date() : null,
			progress:
				tasks.length > 0
					? Math.round((completedTasks.length / tasks.length) * 100)
					: 0,
		})
	})

	adminRouter.post("/admin/sprints/generate", async (req, res) => {
		const { userId } = req.body as { userId?: string }

		if (userId) {
			const [user] = await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)

			if (!user) {
				res.status(404).json({ error: "User not found" })
				return
			}

			const result = await generateSprintForUser(aiService, user, db)
			if (result.status === "exists") {
				res
					.status(409)
					.json({ error: "Sprint already exists for this user this week" })
				return
			}

			res.status(201).json({ generated: 1, sprint: result.sprint })
			return
		}

		const { generated, weekStart } = await generateSprintsForAllUsers(
			aiService,
			db,
		)
		res.status(201).json({ generated, weekStart: weekStart.toISOString() })
	})

	const DEFAULT_SEED_GOALS: ChallengeGoal[] = [
		{
			id: "goal_1",
			title: "60 Glasses of Water",
			description: "Stay hydrated.",
			target: 60,
			unit: "glasses",
			dailyAmount: 6,
			dailyPrompt: "Did you drink 6 glasses today?",
		},
		{
			id: "goal_2",
			title: "200 Minutes of Movement",
			description: "Get moving.",
			target: 200,
			unit: "minutes",
			dailyAmount: 20,
			dailyPrompt: "Did you move for 20 minutes today?",
		},
	]

	type SeedCompletion = "none" | "partial" | "near_complete" | "complete"

	adminRouter.post("/admin/seed/:id/challenge", async (req, res) => {
		const { id } = req.params
		const now = new Date()
		const {
			month = now.getUTCMonth() + 1,
			year = now.getUTCFullYear(),
			completion = "complete",
			goals,
		} = req.body as {
			month?: number
			year?: number
			completion?: SeedCompletion
			goals?: ChallengeGoal[]
		}

		let [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, month), eq(challenges.year, year)))
			.limit(1)

		if (!challenge) {
			const [inserted] = await db
				.insert(challenges)
				.values({
					title: `Seeded Challenge ${month}/${year}`,
					description: "Seeded via admin panel for testing",
					month,
					year,
					theme: "seeded",
					aiGenerated: false,
					tasks: goals ?? DEFAULT_SEED_GOALS,
				})
				.$returningId()
			;[challenge] = await db
				.select()
				.from(challenges)
				.where(eq(challenges.id, inserted.id))
		}

		const challengeGoals = challenge.tasks as ChallengeGoal[]

		await db
			.delete(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, id),
					eq(userChallenges.challengeId, challenge.id),
				),
			)

		if (completion !== "none") {
			const completedTasks: Record<string, number> = {}
			challengeGoals.forEach((g, i) => {
				if (completion === "complete") {
					completedTasks[g.id] = g.target
				} else if (completion === "near_complete") {
					const isLast = i === challengeGoals.length - 1
					completedTasks[g.id] = isLast ? Math.max(0, g.target - 1) : g.target
				} else {
					completedTasks[g.id] = Math.max(0, Math.floor(g.target / 2))
				}
			})

			await db.insert(userChallenges).values({
				userId: id,
				challengeId: challenge.id,
				completedTasks,
				completedAt: completion === "complete" ? new Date() : null,
			})
		}

		const [userChallenge] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, id),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
			.limit(1)

		res.status(201).json({
			challenge: {
				id: challenge.id,
				title: challenge.title,
				month: challenge.month,
				year: challenge.year,
				goals: challengeGoals,
			},
			joined: !!userChallenge,
			completedTasks: userChallenge
				? (userChallenge.completedTasks as Record<string, number>)
				: null,
			completedAt: userChallenge?.completedAt ?? null,
		})
	})

	// Puts a curated card (shared/challenges/catalog.ts) in a month (default:
	// this one); 409 when the month already has a challenge.
	adminRouter.post("/admin/challenges/catalog", async (req, res) => {
		const now = new Date()
		const {
			key,
			month = now.getUTCMonth() + 1,
			year = now.getUTCFullYear(),
		} = req.body as { key?: string; month?: number; year?: number }
		const card = catalogChallenge(String(key ?? ""))
		if (!card) {
			res.status(400).json({ error: "Unknown catalog challenge" })
			return
		}
		if (!Number.isInteger(month) || month < 1 || month > 12) {
			res.status(400).json({ error: "month must be 1-12" })
			return
		}
		const result = await createCatalogChallenge(db, card, month, year)
		if (result.status === "conflict") {
			res.status(409).json({ error: "That month already has a challenge" })
			return
		}
		res.status(201).json({
			id: result.challenge.id,
			title: result.challenge.title,
			month,
			year,
		})
	})

	adminRouter.post("/admin/challenges/generate", async (_req, res) => {
		const now = new Date()
		const month = now.getUTCMonth() + 1
		const year = now.getUTCFullYear()

		const result = await generateChallengeForMonth(aiService, month, year, db)

		if (result.status === "conflict") {
			res.status(409).json({ error: "Challenge already exists for this month" })
			return
		}

		const { challenge } = result
		res.status(201).json({
			id: challenge.id,
			title: challenge.title,
			description: challenge.description,
			theme: challenge.theme,
			month: challenge.month,
			year: challenge.year,
			goals: challenge.tasks,
		})
	})

	return adminRouter
}

/**
 * Separate from createAdminRouter (which requires isAdmin) because the
 * caller here is whoever is currently impersonated — often a non-admin
 * user — trying to get back to their own admin account.
 */
export function createImpersonationRouter() {
	const router = Router()

	router.post("/admin/stop-impersonating", async (req, res) => {
		const cookies = parseCookies(req.headers.cookie)
		const adminId = cookies[IMPERSONATOR_COOKIE]
		if (!adminId) {
			res.status(400).json({ error: "Not currently impersonating" })
			return
		}

		const [admin] = await db
			.select({ id: users.id, isAdmin: users.isAdmin })
			.from(users)
			.where(eq(users.id, adminId))
		if (!admin?.isAdmin) {
			res.status(400).json({ error: "Original admin account not found" })
			return
		}

		const sessionCookie = await createSessionCookie(admin.id)
		res.setHeader("Set-Cookie", [
			sessionCookie,
			`${IMPERSONATOR_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
		])
		res.json({ success: true })
	})

	return router
}
