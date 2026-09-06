import { and, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { sprints } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService, SprintTask } from "../services/ai/index.js"
import { awardGymXp } from "../services/gym/index.js"
import {
	generateSprintsForAllUsers,
	getMondayOfWeek,
} from "../services/sprints/index.js"

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
		const { generated, weekStart } = await generateSprintsForAllUsers(
			aiService,
			db,
		)
		res.json({ generated, weekStart: weekStart.toISOString() })
	})

	return router
}
