import { and, asc, desc, eq, gte, lt, max, sum } from "drizzle-orm"
import { db } from "../../db/index.js"
import {
	dailyCheckins,
	foodLogs,
	stepRecords,
	weightEntries,
} from "../../db/schema.js"

export type TournamentType =
	| "weight_loss"
	| "step_count"
	| "streak"
	| "food_challenge"

export async function computeScore(
	userId: string,
	type: TournamentType,
	startDate: Date,
	endDate: Date,
): Promise<number> {
	switch (type) {
		case "weight_loss": {
			const [first] = await db
				.select({ weightKg: weightEntries.weightKg })
				.from(weightEntries)
				.where(
					and(
						eq(weightEntries.userId, userId),
						gte(weightEntries.recordedAt, startDate),
					),
				)
				.orderBy(asc(weightEntries.recordedAt))
				.limit(1)

			if (!first) return 0

			const [latest] = await db
				.select({ weightKg: weightEntries.weightKg })
				.from(weightEntries)
				.where(
					and(
						eq(weightEntries.userId, userId),
						gte(weightEntries.recordedAt, startDate),
						lt(weightEntries.recordedAt, endDate),
					),
				)
				.orderBy(desc(weightEntries.recordedAt))
				.limit(1)

			if (!latest) return 0

			const pctLost =
				((first.weightKg - latest.weightKg) / first.weightKg) * 100
			return Math.max(0, Math.round(pctLost * 100) / 100)
		}

		case "streak": {
			const [result] = await db
				.select({ maxStreak: max(dailyCheckins.streakCount) })
				.from(dailyCheckins)
				.where(
					and(
						eq(dailyCheckins.userId, userId),
						gte(dailyCheckins.date, startDate),
						lt(dailyCheckins.date, endDate),
					),
				)

			return result?.maxStreak ?? 0
		}

		case "food_challenge": {
			const logs = await db
				.select({ aiAnalysis: foodLogs.aiAnalysis })
				.from(foodLogs)
				.where(
					and(
						eq(foodLogs.userId, userId),
						gte(foodLogs.loggedAt, startDate),
						lt(foodLogs.loggedAt, endDate),
					),
				)

			if (logs.length === 0) return 0

			let totalRating = 0
			let ratedCount = 0
			for (const log of logs) {
				const analysis = log.aiAnalysis as { rating?: number } | null
				if (analysis?.rating != null) {
					totalRating += analysis.rating
					ratedCount++
				}
			}

			if (ratedCount === 0) return 0
			return Math.round((totalRating / ratedCount) * 100) / 100
		}

		case "step_count": {
			const [result] = await db
				.select({ totalSteps: sum(stepRecords.steps) })
				.from(stepRecords)
				.where(
					and(
						eq(stepRecords.userId, userId),
						gte(stepRecords.recordedAt, startDate),
						lt(stepRecords.recordedAt, endDate),
					),
				)

			return Number(result?.totalSteps ?? 0)
		}
	}
}
