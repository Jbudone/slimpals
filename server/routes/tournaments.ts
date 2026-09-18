import { and, count, desc, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	socialPosts,
	tournamentParticipants,
	tournaments,
	users,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService } from "../services/ai/index.js"
import { checkAndAward } from "../services/badges/index.js"
import {
	computeScore,
	resolveTournament,
	type TournamentType,
} from "../services/tournaments/index.js"

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

	router.post("/tournaments/:id/nudge", async (req, res) => {
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

		const [membership] = await db
			.select()
			.from(tournamentParticipants)
			.where(
				and(
					eq(tournamentParticipants.tournamentId, tournamentId),
					eq(tournamentParticipants.userId, userId),
				),
			)

		if (!membership) {
			res.status(403).json({
				error: "Join the tournament before nudging the group",
			})
			return
		}

		await db.insert(socialPosts).values({
			userId,
			type: "milestone",
			content: {
				text: `Nudged the ${tournament.name} group to keep going! 💪`,
			},
		})

		res.status(201).json({ nudged: true })
	})

	return router
}
