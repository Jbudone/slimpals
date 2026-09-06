import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	isNull,
	lt,
	max,
	sum,
} from "drizzle-orm"
import { db } from "../../db/index.js"
import {
	dailyCheckins,
	foodLogs,
	stepRecords,
	tournamentParticipants,
	tournaments,
	users,
	weightEntries,
} from "../../db/schema.js"
import type { AIService } from "../ai/index.js"
import { checkAndAward } from "../badges/index.js"

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

export async function resolveTournament(
	tournamentId: number,
	aiService: AIService,
): Promise<void> {
	const [tournament] = await db
		.select()
		.from(tournaments)
		.where(
			and(eq(tournaments.id, tournamentId), isNull(tournaments.resolvedAt)),
		)

	if (!tournament) return

	// Mark as resolving immediately to prevent race conditions
	await db
		.update(tournaments)
		.set({ resolvedAt: new Date() })
		.where(eq(tournaments.id, tournamentId))

	const participants = await db
		.select({
			userId: tournamentParticipants.userId,
			joinedAt: tournamentParticipants.joinedAt,
		})
		.from(tournamentParticipants)
		.where(eq(tournamentParticipants.tournamentId, tournamentId))

	if (participants.length === 0) return

	const scores: { userId: string; score: number; joinedAt: Date }[] = []
	for (const p of participants) {
		const score = await computeScore(
			p.userId,
			tournament.type as TournamentType,
			tournament.startDate,
			tournament.endDate,
		)
		scores.push({ userId: p.userId, score, joinedAt: p.joinedAt })
	}

	// Tie-break: highest score wins; ties go to whoever joined the
	// tournament earliest, rather than an arbitrary DB-order pick.
	scores.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score
		return a.joinedAt.getTime() - b.joinedAt.getTime()
	})
	const winner = scores[0]

	if (!winner || winner.score === 0) return

	const [winnerUser] = await db
		.select({ name: users.name, coachPersonality: users.coachPersonality })
		.from(users)
		.where(eq(users.id, winner.userId))

	let victoryMessage = `${winnerUser?.name ?? "Unknown"} won the tournament!`
	try {
		victoryMessage = await aiService.generateVictoryMessage(
			winnerUser?.name ?? "Unknown",
			tournament.name,
			tournament.type,
			winnerUser?.coachPersonality ?? "friendly",
		)
	} catch {}

	await db
		.update(tournaments)
		.set({ winnerId: winner.userId, victoryMessage })
		.where(eq(tournaments.id, tournamentId))

	// Award badges
	const [{ value: totalWins }] = await db
		.select({ value: count() })
		.from(tournaments)
		.where(eq(tournaments.winnerId, winner.userId))

	await checkAndAward(
		winner.userId,
		{
			type: "tournament_win",
			totalWins,
			tournamentType: tournament.type,
		},
		db,
	)
}
