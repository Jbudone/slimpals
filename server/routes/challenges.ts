import { and, count, eq } from "drizzle-orm"
import { Router } from "express"
import { challengeFraction } from "../../shared/challenges/milestones.js"
import { isTier, tierGoals } from "../../shared/challenges/tiers.js"
import { cosmeticOf } from "../../shared/gym3d/cosmetics.js"
import { db } from "../db/index.js"
import { challenges, userChallenges } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { requireCronSecret } from "../middleware/requireCronSecret.js"
import type { AIService, ChallengeGoal } from "../services/ai/index.js"
import { checkAndAward, shareBadges } from "../services/badges/index.js"
import { shareChallengeCompletion } from "../services/challenges/feed.js"
import { generateChallengeForMonth } from "../services/challenges/index.js"
import { payChallengeMilestones } from "../services/challenges/milestones.js"
import { grantCosmetic } from "../services/gym/cosmetics.js"
import { awardGymXp, getOrCreateGym } from "../services/gym/index.js"

type GoalProgress = Record<string, number>
type DailyLog = Record<string, string[]>

/** The decor a curated challenge gives for finishing it. */
function rewardOf(key: string | null): { key: string; name: string } | null {
	const def = key ? cosmeticOf(key) : null
	return def ? { key: def.key, name: def.name } : null
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10)
}

export function createChallengesRouter(aiService: AIService) {
	const router = Router()

	router.get("/challenges/current", async (req, res) => {
		const userId = (req as unknown as AuthRequest).user.id
		const now = new Date()
		const month = now.getUTCMonth() + 1
		const year = now.getUTCFullYear()

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, month), eq(challenges.year, year)))
			.limit(1)

		if (!challenge) {
			res.json(null)
			return
		}

		const [userChallenge] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, userId),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
			.limit(1)

		const tier = userChallenge?.tier ?? "silver"
		const goals = tierGoals(challenge.tasks as ChallengeGoal[], tier)
		const progress = (userChallenge?.completedTasks ?? {}) as GoalProgress
		const dailyLog = (userChallenge?.dailyLog ?? {}) as DailyLog
		const goalsCompleted = goals.filter(
			(g) => (progress[g.id] ?? 0) >= g.target,
		).length

		res.json({
			id: challenge.id,
			title: challenge.title,
			description: challenge.description,
			theme: challenge.theme,
			tagline: challenge.tagline,
			coachIntro: challenge.coachIntro,
			reward: rewardOf(challenge.rewardCosmetic),
			month: challenge.month,
			year: challenge.year,
			goals,
			joined: !!userChallenge,
			tier,
			progress,
			dailyLog,
			completedAt: userChallenge?.completedAt ?? null,
			goalsCompleted,
			totalGoals: goals.length,
			overallProgress:
				goals.length > 0
					? Math.round((goalsCompleted / goals.length) * 100)
					: 0,
		})
	})

	router.post("/challenges/:id/join", async (req, res) => {
		const userId = (req as unknown as AuthRequest).user.id
		const challengeId = Number.parseInt(req.params.id, 10)

		if (Number.isNaN(challengeId)) {
			res.status(400).json({ error: "Invalid challenge ID" })
			return
		}

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(eq(challenges.id, challengeId))
			.limit(1)

		if (!challenge) {
			res.status(404).json({ error: "Challenge not found" })
			return
		}

		const [existing] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, userId),
					eq(userChallenges.challengeId, challengeId),
				),
			)
			.limit(1)

		if (existing) {
			res.status(409).json({ error: "Already joined this challenge" })
			return
		}

		const tier = (req.body as { tier?: unknown } | undefined)?.tier ?? "silver"
		if (!isTier(tier)) {
			res.status(400).json({ error: "tier must be bronze, silver or gold" })
			return
		}

		await db.insert(userChallenges).values({
			userId,
			challengeId,
			completedTasks: {},
			tier,
		})

		res.status(201).json({ joined: true, tier })
	})

	router.patch("/challenges/:id/progress", async (req, res) => {
		const userId = (req as unknown as AuthRequest).user.id
		const challengeId = Number.parseInt(req.params.id, 10)

		if (Number.isNaN(challengeId)) {
			res.status(400).json({ error: "Invalid challenge ID" })
			return
		}

		const { dailyProgress } = req.body as {
			dailyProgress?: Record<string, number>
		}

		if (
			!dailyProgress ||
			typeof dailyProgress !== "object" ||
			Array.isArray(dailyProgress)
		) {
			res
				.status(400)
				.json({ error: "dailyProgress must be an object of goalId: value" })
			return
		}

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(eq(challenges.id, challengeId))
			.limit(1)

		if (!challenge) {
			res.status(404).json({ error: "Challenge not found" })
			return
		}

		const [userChallenge] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, userId),
					eq(userChallenges.challengeId, challengeId),
				),
			)
			.limit(1)

		if (!userChallenge) {
			res.status(400).json({ error: "You must join the challenge first" })
			return
		}

		if (userChallenge.completedAt) {
			res.status(400).json({ error: "Challenge already completed" })
			return
		}

		const goals = tierGoals(
			challenge.tasks as ChallengeGoal[],
			userChallenge.tier,
		)
		const validIds = new Set(goals.map((g) => g.id))
		const current = (userChallenge.completedTasks ?? {}) as GoalProgress
		const dailyLog = (userChallenge.dailyLog ?? {}) as DailyLog
		const today = todayIso()

		for (const [goalId, value] of Object.entries(dailyProgress)) {
			if (!validIds.has(goalId)) continue
			if (typeof value !== "number" || value < 0) continue
			current[goalId] = (current[goalId] ?? 0) + value

			const loggedDays = dailyLog[goalId] ?? []
			if (!loggedDays.includes(today)) {
				dailyLog[goalId] = [...loggedDays, today]
			}
		}

		const goalsCompleted = goals.filter(
			(g) => (current[g.id] ?? 0) >= g.target,
		).length
		const isComplete = goalsCompleted >= goals.length

		const updates: Partial<typeof userChallenges.$inferInsert> = {
			completedTasks: current,
			dailyLog,
		}
		if (isComplete) {
			updates.completedAt = new Date()
		}

		await db
			.update(userChallenges)
			.set(updates)
			.where(eq(userChallenges.id, userChallenge.id))

		let newBadges: Awaited<ReturnType<typeof checkAndAward>> = []
		let gymXpAwarded = 0
		let cosmeticAwarded: string | null = null
		let rewardAwarded: string | null = null

		if (isComplete) {
			const [{ value: totalCompleted }] = await db
				.select({ value: count() })
				.from(userChallenges)
				.where(and(eq(userChallenges.userId, userId)))

			newBadges = await checkAndAward(
				userId,
				{ type: "challenge_complete", totalCompleted },
				db,
			)
			await shareBadges(userId, newBadges, db)
			await shareChallengeCompletion(db, userId, {
				challengeName: challenge.title,
				tier: userChallenge.tier,
				reward: rewardOf(challenge.rewardCosmetic)?.name,
			})

			gymXpAwarded = 200
			await awardGymXp(userId, gymXpAwarded, "challenge_complete", db)
			// the first finished challenge puts a trophy in the gym's inventory
			cosmeticAwarded = await grantCosmetic(
				db,
				(await getOrCreateGym(userId, db)).id,
				"challenge_trophy",
				`challenge:${userChallenge.challengeId}`,
			)
			// a curated challenge also gives its own decor
			if (challenge.rewardCosmetic)
				rewardAwarded = await grantCosmetic(
					db,
					(await getOrCreateGym(userId, db)).id,
					challenge.rewardCosmetic,
					`challenge:${userChallenge.challengeId}`,
				)
		}

		const milestonesPaid = await payChallengeMilestones(
			db,
			userId,
			challengeId,
			challengeFraction(goals, current),
			userChallenge.tier,
		)

		res.json({
			progress: current,
			dailyLog,
			milestonesPaid,
			goalsCompleted,
			totalGoals: goals.length,
			overallProgress:
				goals.length > 0
					? Math.round((goalsCompleted / goals.length) * 100)
					: 0,
			completed: isComplete,
			newBadges,
			gymXpAwarded: isComplete ? gymXpAwarded : 0,
			cosmeticAwarded,
			rewardAwarded,
		})
	})

	router.get("/challenges/next", async (_req, res) => {
		const now = new Date()
		const thisMonth = now.getUTCMonth() + 1
		const thisYear = now.getUTCFullYear()
		const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1
		const nextYear = thisMonth === 12 ? thisYear + 1 : thisYear

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(
				and(eq(challenges.month, nextMonth), eq(challenges.year, nextYear)),
			)
			.limit(1)

		if (!challenge) {
			res.json(null)
			return
		}

		const [{ value: participantCount }] = await db
			.select({ value: count() })
			.from(userChallenges)
			.where(eq(userChallenges.challengeId, challenge.id))

		res.json({
			id: challenge.id,
			title: challenge.title,
			month: challenge.month,
			year: challenge.year,
			opensAt: new Date(Date.UTC(challenge.year, challenge.month - 1, 1)),
			participantCount,
		})
	})

	// Cron-style (open route, X-Cron-Secret); the scheduler calls the service.
	router.post("/challenges/generate", requireCronSecret, async (_req, res) => {
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

	return router
}
