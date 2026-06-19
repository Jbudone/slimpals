import { and, count, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { challenges, userChallenges } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService, ChallengeGoal } from "../services/ai/index.js"
import { checkAndAward } from "../services/badges/index.js"
import { awardGymXp } from "../services/gym/index.js"

type GoalProgress = Record<string, number>

export function createChallengesRouter(aiService: AIService) {
	const router = Router()

	router.get("/challenges/current", async (req, res) => {
		const userId = (req as AuthRequest).user.id
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

		const goals = challenge.tasks as ChallengeGoal[]
		const progress = (userChallenge?.completedTasks ?? {}) as GoalProgress
		const goalsCompleted = goals.filter(
			(g) => (progress[g.id] ?? 0) >= g.target,
		).length

		res.json({
			id: challenge.id,
			title: challenge.title,
			description: challenge.description,
			theme: challenge.theme,
			month: challenge.month,
			year: challenge.year,
			goals,
			joined: !!userChallenge,
			progress,
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
		const userId = (req as AuthRequest).user.id
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

		await db.insert(userChallenges).values({
			userId,
			challengeId,
			completedTasks: {},
		})

		res.status(201).json({ joined: true })
	})

	router.patch("/challenges/:id/progress", async (req, res) => {
		const userId = (req as AuthRequest).user.id
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

		const goals = challenge.tasks as ChallengeGoal[]
		const validIds = new Set(goals.map((g) => g.id))
		const current = (userChallenge.completedTasks ?? {}) as GoalProgress

		for (const [goalId, value] of Object.entries(dailyProgress)) {
			if (!validIds.has(goalId)) continue
			if (typeof value !== "number" || value < 0) continue
			current[goalId] = (current[goalId] ?? 0) + value
		}

		const goalsCompleted = goals.filter(
			(g) => (current[g.id] ?? 0) >= g.target,
		).length
		const isComplete = goalsCompleted >= goals.length

		const updates: Partial<typeof userChallenges.$inferInsert> = {
			completedTasks: current,
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

			gymXpAwarded = 200
			await awardGymXp(userId, gymXpAwarded, "challenge_complete", db)
		}

		res.json({
			progress: current,
			goalsCompleted,
			totalGoals: goals.length,
			overallProgress:
				goals.length > 0
					? Math.round((goalsCompleted / goals.length) * 100)
					: 0,
			completed: isComplete,
			newBadges,
			gymXpAwarded: isComplete ? gymXpAwarded : 0,
		})
	})

	router.post("/challenges/generate", async (_req, res) => {
		const now = new Date()
		const month = now.getUTCMonth() + 1
		const year = now.getUTCFullYear()

		const [existing] = await db
			.select({ id: challenges.id })
			.from(challenges)
			.where(and(eq(challenges.month, month), eq(challenges.year, year)))
			.limit(1)

		if (existing) {
			res.status(409).json({ error: "Challenge already exists for this month" })
			return
		}

		const generated = await aiService.generateMonthlyChallenge(month, year)

		const [inserted] = await db
			.insert(challenges)
			.values({
				title: generated.title,
				description: generated.description,
				month,
				year,
				theme: generated.theme,
				aiGenerated: true,
				tasks: generated.goals,
			})
			.$returningId()

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(eq(challenges.id, inserted.id))

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
