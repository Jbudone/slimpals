import { and, count, eq } from "drizzle-orm"
import { Router } from "express"
import { isTier, tierGoals } from "../../shared/challenges/tiers.js"
import { db } from "../db/index.js"
import {
	challengeCoachLines,
	challenges,
	userChallenges,
	users,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { requireCronSecret } from "../middleware/requireCronSecret.js"
import type { AIService, ChallengeGoal } from "../services/ai/index.js"
import { storeChallengeCoachLines } from "../services/challenges/coachLines.js"
import { generateChallengeForMonth } from "../services/challenges/index.js"
import {
	addChallengeProgress,
	rewardOf,
} from "../services/challenges/progress.js"

type GoalProgress = Record<string, number>
type DailyLog = Record<string, string[]>

function _todayIso(): string {
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

		// the coach's line for today, if one was written when the player joined
		let coachToday: string | null = null
		if (userChallenge) {
			const [row] = await db
				.select({ line: challengeCoachLines.line })
				.from(challengeCoachLines)
				.where(
					and(
						eq(challengeCoachLines.userChallengeId, userChallenge.id),
						eq(challengeCoachLines.day, now.getUTCDate()),
					),
				)
				.limit(1)
			coachToday = row?.line ?? null
		}

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
			coachToday,
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

		const [created] = await db
			.insert(userChallenges)
			.values({
				userId,
				challengeId,
				completedTasks: {},
				tier,
			})
			.$returningId()

		// the coach writes a line for every day of the month in their own time:
		// joining does not wait for it, and the scripted lines cover any gap
		void (async () => {
			const [u] = await db
				.select({ coachPersonality: users.coachPersonality })
				.from(users)
				.where(eq(users.id, userId))
			await storeChallengeCoachLines(db, aiService, {
				userChallengeId: created.id,
				personality: u?.coachPersonality ?? "friendly",
				title: challenge.title,
				days: new Date(
					Date.UTC(challenge.year, challenge.month, 0),
				).getUTCDate(),
			})
		})().catch((err) => console.error("[challenges] coach lines:", err))

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

		const result = await addChallengeProgress(
			db,
			userId,
			challengeId,
			dailyProgress,
		)
		if (!result.ok) {
			res.status(result.status).json({ error: result.error })
			return
		}
		res.json(result.body)
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
