import { and, count, eq, gte, lt } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	dailyCheckins,
	foodLogs,
	sprints,
	userChallenges,
	users,
	weightEntries,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService, SprintTask } from "../services/ai/index.js"
import { awardGymXp } from "../services/gym/index.js"

function getMondayOfWeek(d: Date = new Date()): Date {
	const date = new Date(d)
	date.setUTCHours(0, 0, 0, 0)
	const day = date.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	date.setUTCDate(date.getUTCDate() - diff)
	return date
}

function getPreviousWeekRange(): { start: Date; end: Date } {
	const thisMonday = getMondayOfWeek()
	const lastMonday = new Date(thisMonday)
	lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)
	return { start: lastMonday, end: thisMonday }
}

export function createSprintsRouter(aiService: AIService) {
	const router = Router()

	router.get("/sprints/current", async (req, res) => {
		const userId = (req as unknown as AuthRequest).user.id
		const monday = getMondayOfWeek()

		const [sprint] = await db
			.select()
			.from(sprints)
			.where(and(eq(sprints.userId, userId), eq(sprints.weekStart, monday)))
			.limit(1)

		if (!sprint) {
			res.json(null)
			return
		}

		const tasks = sprint.tasks as SprintTask[]
		const completed = (sprint.completedTasks ?? []) as string[]

		res.json({
			id: sprint.id,
			title: sprint.title,
			weekStart: sprint.weekStart,
			tasks,
			completedTasks: completed,
			completedAt: sprint.completedAt,
			progress:
				tasks.length > 0
					? Math.round((completed.length / tasks.length) * 100)
					: 0,
		})
	})

	router.patch("/sprints/:id/tasks", async (req, res) => {
		const userId = (req as unknown as AuthRequest).user.id
		const sprintId = Number.parseInt(req.params.id, 10)

		if (Number.isNaN(sprintId)) {
			res.status(400).json({ error: "Invalid sprint ID" })
			return
		}

		const { completedTasks } = req.body as { completedTasks?: string[] }

		if (!Array.isArray(completedTasks)) {
			res.status(400).json({ error: "completedTasks must be an array" })
			return
		}

		const [sprint] = await db
			.select()
			.from(sprints)
			.where(and(eq(sprints.id, sprintId), eq(sprints.userId, userId)))
			.limit(1)

		if (!sprint) {
			res.status(404).json({ error: "Sprint not found" })
			return
		}

		if (sprint.completedAt) {
			res.status(400).json({ error: "Sprint already completed" })
			return
		}

		const tasks = sprint.tasks as SprintTask[]
		const validIds = new Set(tasks.map((t) => t.id))
		const filtered = completedTasks.filter((id) => validIds.has(id))
		const isComplete = filtered.length >= tasks.length

		const updates: Partial<typeof sprints.$inferInsert> = {
			completedTasks: filtered,
		}

		let gymXpAwarded = 0
		if (isComplete) {
			updates.completedAt = new Date()
			gymXpAwarded = 50
			await awardGymXp(userId, gymXpAwarded, "sprint_complete", db)
		}

		await db.update(sprints).set(updates).where(eq(sprints.id, sprintId))

		res.json({
			completedTasks: filtered,
			progress:
				tasks.length > 0
					? Math.round((filtered.length / tasks.length) * 100)
					: 0,
			completed: isComplete,
			gymXpAwarded: isComplete ? gymXpAwarded : 0,
		})
	})

	router.post("/sprints/generate", async (_req, res) => {
		const monday = getMondayOfWeek()
		const { start, end } = getPreviousWeekRange()

		const allUsers = await db
			.select({ id: users.id, name: users.name })
			.from(users)

		let generated = 0

		for (const user of allUsers) {
			const [existing] = await db
				.select({ id: sprints.id })
				.from(sprints)
				.where(and(eq(sprints.userId, user.id), eq(sprints.weekStart, monday)))
				.limit(1)

			if (existing) continue

			const [{ value: checkins }] = await db
				.select({ value: count() })
				.from(dailyCheckins)
				.where(
					and(
						eq(dailyCheckins.userId, user.id),
						gte(dailyCheckins.date, start),
						lt(dailyCheckins.date, end),
					),
				)

			const [{ value: foodLogCount }] = await db
				.select({ value: count() })
				.from(foodLogs)
				.where(
					and(
						eq(foodLogs.userId, user.id),
						gte(foodLogs.loggedAt, start),
						lt(foodLogs.loggedAt, end),
					),
				)

			const [{ value: weightCount }] = await db
				.select({ value: count() })
				.from(weightEntries)
				.where(
					and(
						eq(weightEntries.userId, user.id),
						gte(weightEntries.recordedAt, start),
						lt(weightEntries.recordedAt, end),
					),
				)

			const [activeChallenge] = await db
				.select({ id: userChallenges.id })
				.from(userChallenges)
				.where(eq(userChallenges.userId, user.id))
				.limit(1)

			const result = await aiService.generateWeeklySprint(user.name, {
				checkins,
				foodLogs: foodLogCount,
				weightEntries: weightCount,
				hasChallenge: !!activeChallenge,
			})

			await db.insert(sprints).values({
				userId: user.id,
				weekStart: monday,
				title: result.title,
				tasks: result.tasks,
			})

			generated++
		}

		res.json({ generated, weekStart: monday.toISOString() })
	})

	return router
}
