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
import { Router } from "express"
import { db } from "../db/index.js"
import {
	dailyCheckins,
	foodLogs,
	stepRecords,
	tournamentParticipants,
	tournaments,
	users,
	weightEntries,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService } from "../services/ai/index.js"
import { checkAndAward } from "../services/badges/index.js"

type TournamentType = "weight_loss" | "step_count" | "streak" | "food_challenge"

async function computeScore(
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

async function resolveTournament(
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

export function createTournamentsRouter(aiService: AIService) {
	const router = Router()

	router.get("/tournaments", async (_req, res) => {
		const rows = await db
			.select()
			.from(tournaments)
			.orderBy(desc(tournaments.startDate))

		const participantCounts = await db
			.select({
				tournamentId: tournamentParticipants.tournamentId,
				count: count(),
			})
			.from(tournamentParticipants)
			.groupBy(tournamentParticipants.tournamentId)

		const countMap = new Map(
			participantCounts.map((p) => [p.tournamentId, p.count]),
		)

		res.json(
			rows.map((t) => ({
				id: t.id,
				name: t.name,
				creatorId: t.creatorId,
				startDate: t.startDate,
				endDate: t.endDate,
				type: t.type,
				goalValue: t.goalValue,
				rewardDescription: t.rewardDescription,
				winnerId: t.winnerId,
				victoryMessage: t.victoryMessage,
				resolvedAt: t.resolvedAt,
				participantCount: countMap.get(t.id) ?? 0,
			})),
		)
	})

	router.post("/tournaments", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const { name, startDate, endDate, type, goalValue, rewardDescription } =
			req.body as {
				name?: string
				startDate?: string
				endDate?: string
				type?: string
				goalValue?: number
				rewardDescription?: string
			}

		if (!name || !startDate || !endDate || !type) {
			res
				.status(400)
				.json({ error: "name, startDate, endDate, and type are required" })
			return
		}

		const validTypes = ["weight_loss", "step_count", "streak", "food_challenge"]
		if (!validTypes.includes(type)) {
			res
				.status(400)
				.json({ error: `type must be one of: ${validTypes.join(", ")}` })
			return
		}

		const start = new Date(startDate)
		const end = new Date(endDate)

		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			res.status(400).json({ error: "Invalid date format" })
			return
		}

		if (end <= start) {
			res.status(400).json({ error: "endDate must be after startDate" })
			return
		}

		const [inserted] = await db
			.insert(tournaments)
			.values({
				name,
				creatorId: userId,
				startDate: start,
				endDate: end,
				type: type as
					| "weight_loss"
					| "step_count"
					| "streak"
					| "food_challenge",
				goalValue: goalValue ?? null,
				rewardDescription: rewardDescription ?? null,
			})
			.$returningId()

		// Creator auto-joins
		await db.insert(tournamentParticipants).values({
			tournamentId: inserted.id,
			userId,
		})

		const newBadges = await checkAndAward(
			userId,
			{ type: "tournament_join" },
			db,
		)

		const [row] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, inserted.id))

		res.status(201).json({
			id: row.id,
			name: row.name,
			creatorId: row.creatorId,
			startDate: row.startDate,
			endDate: row.endDate,
			type: row.type,
			goalValue: row.goalValue,
			rewardDescription: row.rewardDescription,
			winnerId: row.winnerId,
			victoryMessage: row.victoryMessage,
			resolvedAt: row.resolvedAt,
			participantCount: 1,
			newBadges,
		})
	})

	router.post("/tournaments/:id/join", async (req, res) => {
		const userId = (req as unknown as AuthRequest).user.id
		const tournamentId = Number(req.params.id)

		if (Number.isNaN(tournamentId)) {
			res.status(400).json({ error: "Invalid tournament ID" })
			return
		}

		const [tournament] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		if (!tournament) {
			res.status(404).json({ error: "Tournament not found" })
			return
		}

		if (tournament.resolvedAt) {
			res.status(400).json({ error: "Tournament has already ended" })
			return
		}

		const [existing] = await db
			.select()
			.from(tournamentParticipants)
			.where(
				and(
					eq(tournamentParticipants.tournamentId, tournamentId),
					eq(tournamentParticipants.userId, userId),
				),
			)

		if (existing) {
			res.status(400).json({ error: "Already joined this tournament" })
			return
		}

		await db.insert(tournamentParticipants).values({
			tournamentId,
			userId,
		})

		const newBadges = await checkAndAward(
			userId,
			{ type: "tournament_join" },
			db,
		)

		res.status(201).json({ joined: true, newBadges })
	})

	router.get("/tournaments/:id/leaderboard", async (req, res) => {
		const tournamentId = Number(req.params.id)

		if (Number.isNaN(tournamentId)) {
			res.status(400).json({ error: "Invalid tournament ID" })
			return
		}

		const [tournament] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		if (!tournament) {
			res.status(404).json({ error: "Tournament not found" })
			return
		}

		// Resolve if past end date and not yet resolved
		if (new Date() > tournament.endDate && !tournament.resolvedAt) {
			await resolveTournament(tournamentId, aiService)
			// Re-fetch after resolution
			const [updated] = await db
				.select()
				.from(tournaments)
				.where(eq(tournaments.id, tournamentId))
			if (updated) {
				Object.assign(tournament, updated)
			}
		}

		const participants = await db
			.select({
				userId: tournamentParticipants.userId,
				userName: users.name,
			})
			.from(tournamentParticipants)
			.innerJoin(users, eq(tournamentParticipants.userId, users.id))
			.where(eq(tournamentParticipants.tournamentId, tournamentId))

		const leaderboard: {
			userId: string
			userName: string
			score: number
		}[] = []

		for (const p of participants) {
			const score = await computeScore(
				p.userId,
				tournament.type as TournamentType,
				tournament.startDate,
				tournament.endDate,
			)
			leaderboard.push({
				userId: p.userId,
				userName: p.userName,
				score,
			})
		}

		leaderboard.sort((a, b) => b.score - a.score)

		res.json({
			tournament: {
				id: tournament.id,
				name: tournament.name,
				type: tournament.type,
				startDate: tournament.startDate,
				endDate: tournament.endDate,
				winnerId: tournament.winnerId,
				victoryMessage: tournament.victoryMessage,
				resolvedAt: tournament.resolvedAt,
			},
			leaderboard,
		})
	})

	return router
}
