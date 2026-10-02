import { and, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { users, weeklyInspirations } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { requireCronSecret } from "../middleware/requireCronSecret.js"
import type { AIService } from "../services/ai/index.js"
import { generateInspirationForAllUsers } from "../services/inspiration/index.js"
import { getMondayOfWeek } from "../services/sprints/index.js"

export function createInspirationRouter(aiService: AIService) {
	const router = Router()

	// Cron-style (open route, X-Cron-Secret). The in-process scheduler calls
	// generateInspirationForAllUsers directly; see server/services/scheduler.
	router.post("/inspiration/generate", requireCronSecret, async (_req, res) => {
		const { generated, weekStart } = await generateInspirationForAllUsers(
			aiService,
			db,
		)
		res.json({ generated, weekStart: weekStart.toISOString() })
	})

	router.get("/inspiration/weekly", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const thisMonday = getMondayOfWeek()

		const [row] = await db
			.select({
				id: weeklyInspirations.id,
				message: weeklyInspirations.message,
				weekStart: weeklyInspirations.weekStart,
				generatedAt: weeklyInspirations.generatedAt,
			})
			.from(weeklyInspirations)
			.where(
				and(
					eq(weeklyInspirations.userId, userId),
					eq(weeklyInspirations.weekStart, thisMonday),
				),
			)
			.limit(1)

		if (!row) {
			res.json(null)
			return
		}

		const [user] = await db
			.select({ coachPersonality: users.coachPersonality })
			.from(users)
			.where(eq(users.id, userId))

		res.json({
			...row,
			coachPersonality: user?.coachPersonality ?? "friendly",
		})
	})

	return router
}
