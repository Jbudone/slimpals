import { and, count, eq, gte, lt } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	dailyCheckins,
	foodLogs,
	userBadges,
	users,
	weeklyInspirations,
	weightEntries,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService, WeeklyStats } from "../services/ai/index.js"

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

async function getUserWeeklyStats(
	userId: string,
	start: Date,
	end: Date,
): Promise<WeeklyStats> {
	const [{ value: checkins }] = await db
		.select({ value: count() })
		.from(dailyCheckins)
		.where(
			and(
				eq(dailyCheckins.userId, userId),
				gte(dailyCheckins.date, start),
				lt(dailyCheckins.date, end),
			),
		)

	const [{ value: foodLogCount }] = await db
		.select({ value: count() })
		.from(foodLogs)
		.where(
			and(
				eq(foodLogs.userId, userId),
				gte(foodLogs.loggedAt, start),
				lt(foodLogs.loggedAt, end),
			),
		)

	const [{ value: badgesEarned }] = await db
		.select({ value: count() })
		.from(userBadges)
		.where(
			and(
				eq(userBadges.userId, userId),
				gte(userBadges.earnedAt, start),
				lt(userBadges.earnedAt, end),
			),
		)

	const weekWeights = await db
		.select({ weightKg: weightEntries.weightKg })
		.from(weightEntries)
		.where(
			and(
				eq(weightEntries.userId, userId),
				gte(weightEntries.recordedAt, start),
				lt(weightEntries.recordedAt, end),
			),
		)

	let weightDeltaKg: number | null = null
	if (weekWeights.length >= 2) {
		const first = weekWeights[0].weightKg
		const last = weekWeights[weekWeights.length - 1].weightKg
		weightDeltaKg = (last - first) / 10
	}

	return {
		checkins,
		weightDeltaKg,
		foodLogs: foodLogCount,
		badgesEarned,
	}
}

export function createInspirationRouter(aiService: AIService) {
	const router = Router()

	router.post("/inspiration/generate", async (_req, res) => {
		const thisMonday = getMondayOfWeek()
		const { start, end } = getPreviousWeekRange()

		const allUsers = await db
			.select({
				id: users.id,
				name: users.name,
				coachPersonality: users.coachPersonality,
			})
			.from(users)

		let generated = 0

		for (const user of allUsers) {
			const [existing] = await db
				.select({ id: weeklyInspirations.id })
				.from(weeklyInspirations)
				.where(
					and(
						eq(weeklyInspirations.userId, user.id),
						eq(weeklyInspirations.weekStart, thisMonday),
					),
				)
				.limit(1)

			if (existing) continue

			const stats = await getUserWeeklyStats(user.id, start, end)

			const message = await aiService.generateWeeklyInspiration(
				user.name,
				stats,
				user.coachPersonality,
			)

			await db.insert(weeklyInspirations).values({
				userId: user.id,
				weekStart: thisMonday,
				message,
			})

			generated++
		}

		res.json({ generated, weekStart: thisMonday.toISOString() })
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
