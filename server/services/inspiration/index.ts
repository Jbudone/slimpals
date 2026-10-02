import { and, count, eq, gte, lt } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import {
	dailyCheckins,
	foodLogs,
	userBadges,
	users,
	weeklyInspirations,
	weightEntries,
} from "../../db/schema.js"
import type { AIService, WeeklyStats } from "../ai/index.js"
import { getMondayOfWeek } from "../sprints/index.js"

type Db = MySql2Database<typeof schema>

async function getUserWeeklyStats(
	userId: string,
	start: Date,
	end: Date,
	db: Db,
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

/**
 * Writes this week's inspiration message for every user who has none yet
 * (one row per user per week, so re-running only fills the gaps).
 */
export async function generateInspirationForAllUsers(
	aiService: AIService,
	db: Db,
	now: Date = new Date(),
): Promise<{ generated: number; weekStart: Date }> {
	const thisMonday = getMondayOfWeek(now)
	const lastMonday = new Date(thisMonday)
	lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)

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

		const stats = await getUserWeeklyStats(user.id, lastMonday, thisMonday, db)

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

	return { generated, weekStart: thisMonday }
}
