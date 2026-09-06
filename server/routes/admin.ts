import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, asc, count, desc, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	accounts,
	badges,
	challenges,
	dailyCheckins,
	foodLogs,
	reactions,
	sessions,
	socialPosts,
	sprints,
	tournamentParticipants,
	tournaments,
	userBadges,
	userChallenges,
	users,
	weightEntries,
} from "../db/schema.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import type {
	AIService,
	ChallengeGoal,
	SprintTask,
} from "../services/ai/index.js"
import { generateChallengeForMonth } from "../services/challenges/index.js"
import {
	generateSprintForUser,
	generateSprintsForAllUsers,
} from "../services/sprints/index.js"
import {
	computeScore,
	resolveTournament,
	type TournamentType,
} from "../services/tournaments/index.js"

function getMondayOfWeek(d: Date = new Date()): Date {
	const date = new Date(d)
	date.setUTCHours(0, 0, 0, 0)
	const day = date.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	date.setUTCDate(date.getUTCDate() - diff)
	return date
}

export function createAdminRouter(aiService: AIService) {
	const adminRouter = Router()
	adminRouter.use(requireAdmin)

	adminRouter.get("/admin/users", async (_req, res) => {
		const rows = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				isAdmin: users.isAdmin,
				createdAt: users.createdAt,
			})
			.from(users)
			.orderBy(asc(users.createdAt))
		res.json(rows)
	})

	adminRouter.post("/admin/users", async (req, res) => {
		const {
			name,
			email,
			password = "TestPass1!",
		} = req.body as { name?: string; email?: string; password?: string }

		const ts = Date.now()
		const resolvedEmail = email ?? `test-${ts}@slimpals.test`
		const resolvedName = name ?? `Test User ${ts}`

		const userId = randomUUID()
		const accountId = randomUUID()
		const hashedPassword = await hashPassword(password)

		await db
			.insert(users)
			.values({ id: userId, email: resolvedEmail, name: resolvedName })
		await db.insert(accounts).values({
			id: accountId,
			accountId: userId,
			providerId: "credential",
			userId,
			password: hashedPassword,
		})

		res
			.status(201)
			.json({ id: userId, name: resolvedName, email: resolvedEmail, password })
	})

	adminRouter.delete("/admin/users/:id", async (req, res) => {
		await db.delete(users).where(eq(users.id, req.params.id))
		res.json({ success: true })
	})

	adminRouter.post("/admin/impersonate/:id", async (req, res) => {
		const { id } = req.params
		const [user] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, id))
		if (!user) {
			res.status(404).json({ error: "User not found" })
			return
		}

		const token = randomBytes(32).toString("hex")
		const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-please-change"

		await db.insert(sessions).values({
			id: randomUUID(),
			token,
			userId: id,
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		})

		const signature = createHmac("sha256", secret)
			.update(token)
			.digest("base64")
		const cookieValue = encodeURIComponent(`${token}.${signature}`)

		res.setHeader(
			"Set-Cookie",
			`better-auth.session_token=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
		)
		res.json({ success: true })
	})

	adminRouter.post("/admin/seed/:id/checkins", async (req, res) => {
		const { id } = req.params
		const { days = 7 } = req.body as { days?: number }

		await db.delete(dailyCheckins).where(eq(dailyCheckins.userId, id))

		const now = new Date()
		const inserts = []
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(now)
			d.setUTCHours(0, 0, 0, 0)
			d.setUTCDate(d.getUTCDate() - i)
			inserts.push({ userId: id, date: d, streakCount: days - i })
		}
		await db.insert(dailyCheckins).values(inserts)
		res.json({ seeded: days })
	})

	adminRouter.post("/admin/seed/:id/weight", async (req, res) => {
		const { id } = req.params
		const {
			count = 5,
			startKg = 90,
			endKg = 85,
		} = req.body as { count?: number; startKg?: number; endKg?: number }

		const inserts = []
		for (let i = 0; i < count; i++) {
			const fraction = count === 1 ? 0 : i / (count - 1)
			const weightKg = startKg + (endKg - startKg) * fraction
			const d = new Date()
			d.setUTCDate(d.getUTCDate() - (count - 1 - i))
			inserts.push({
				userId: id,
				weightKg: Math.round(weightKg * 10),
				recordedAt: d,
			})
		}
		await db.insert(weightEntries).values(inserts)
		res.json({ seeded: count })
	})

	adminRouter.post("/admin/seed/:id/badges", async (req, res) => {
		const { id } = req.params
		const { keys = [] } = req.body as { keys?: string[] }

		if (keys.length === 0) {
			res.json({ awarded: 0 })
			return
		}

		const badgeRows = await db
			.select({ id: badges.id, key: badges.key })
			.from(badges)
		const keyToId = new Map(badgeRows.map((b) => [b.key, b.id]))

		const earned = await db
			.select({ badgeId: userBadges.badgeId })
			.from(userBadges)
			.where(eq(userBadges.userId, id))
		const earnedIds = new Set(earned.map((e) => e.badgeId))

		const toInsert = keys
			.map((k) => keyToId.get(k))
			.filter(
				(badgeId): badgeId is number =>
					badgeId !== undefined && !earnedIds.has(badgeId),
			)
			.map((badgeId) => ({ userId: id, badgeId }))

		if (toInsert.length > 0) {
			await db.insert(userBadges).values(toInsert)
		}
		res.json({ awarded: toInsert.length })
	})

	adminRouter.post("/admin/seed/:id/food", async (req, res) => {
		const { id } = req.params
		const { count = 3 } = req.body as { count?: number }

		const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const
		const inserts = []
		for (let i = 0; i < count; i++) {
			const d = new Date()
			d.setUTCDate(d.getUTCDate() - (count - 1 - i))
			inserts.push({
				userId: id,
				photoUrl: "/uploads/admin-seed-food.jpg",
				aiAnalysis: {
					foods: ["chicken", "broccoli"],
					macros: { calories: 420, protein: 40, carbs: 28, fat: 14 },
					coachMessage: "Solid macros!",
					alternatives: [],
				},
				mealType: mealTypes[i % mealTypes.length],
				loggedAt: d,
			})
		}
		await db.insert(foodLogs).values(inserts)
		res.json({ seeded: count })
	})

	adminRouter.get("/admin/users/:id/challenge", async (req, res) => {
		const { id } = req.params
		const now = new Date()
		const month = now.getUTCMonth() + 1
		const year = now.getUTCFullYear()

		const [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, month), eq(challenges.year, year)))
			.limit(1)

		if (!challenge) {
			res.json({
				challenge: null,
				joined: false,
				completedTasks: null,
				completedAt: null,
				goalsCompleted: 0,
				totalGoals: 0,
			})
			return
		}

		const [userChallenge] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, id),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
			.limit(1)

		const goals = challenge.tasks as ChallengeGoal[]
		const completedTasks = userChallenge
			? (userChallenge.completedTasks as Record<string, number>)
			: null
		const goalsCompleted = completedTasks
			? goals.filter((g) => (completedTasks[g.id] ?? 0) >= g.target).length
			: 0

		res.json({
			challenge: {
				id: challenge.id,
				title: challenge.title,
				description: challenge.description,
				theme: challenge.theme,
				month: challenge.month,
				year: challenge.year,
				goals,
			},
			joined: !!userChallenge,
			completedTasks,
			completedAt: userChallenge?.completedAt ?? null,
			goalsCompleted,
			totalGoals: goals.length,
		})
	})

	adminRouter.delete("/admin/users/:id/challenge", async (req, res) => {
		const { id } = req.params
		const [result] = await db
			.delete(userChallenges)
			.where(eq(userChallenges.userId, id))
		res.json({ deleted: result.affectedRows })
	})

	adminRouter.get("/admin/users/:id/sprint", async (req, res) => {
		const { id } = req.params
		const monday = getMondayOfWeek()

		const [sprint] = await db
			.select()
			.from(sprints)
			.where(and(eq(sprints.userId, id), eq(sprints.weekStart, monday)))
			.limit(1)

		if (!sprint) {
			res.json({
				sprint: null,
				completedTasks: null,
				completedAt: null,
				progress: 0,
			})
			return
		}

		const tasks = sprint.tasks as SprintTask[]
		const completedTasks = (sprint.completedTasks ?? []) as string[]

		res.json({
			sprint: {
				id: sprint.id,
				title: sprint.title,
				weekStart: sprint.weekStart,
				tasks,
			},
			completedTasks,
			completedAt: sprint.completedAt,
			progress:
				tasks.length > 0
					? Math.round((completedTasks.length / tasks.length) * 100)
					: 0,
		})
	})

	adminRouter.delete("/admin/users/:id/sprint", async (req, res) => {
		const { id } = req.params
		const [result] = await db.delete(sprints).where(eq(sprints.userId, id))
		res.json({ deleted: result.affectedRows })
	})

	adminRouter.get("/admin/tournaments", async (_req, res) => {
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

	adminRouter.get("/admin/tournaments/:id", async (req, res) => {
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

		const participants = await db
			.select({
				userId: tournamentParticipants.userId,
				userName: users.name,
				joinedAt: tournamentParticipants.joinedAt,
				completed: tournamentParticipants.completed,
			})
			.from(tournamentParticipants)
			.innerJoin(users, eq(tournamentParticipants.userId, users.id))
			.where(eq(tournamentParticipants.tournamentId, tournamentId))

		const withScores = await Promise.all(
			participants.map(async (p) => ({
				...p,
				score: await computeScore(
					p.userId,
					tournament.type as TournamentType,
					tournament.startDate,
					tournament.endDate,
				),
			})),
		)
		withScores.sort((a, b) => b.score - a.score)

		res.json({
			tournament: {
				id: tournament.id,
				name: tournament.name,
				creatorId: tournament.creatorId,
				startDate: tournament.startDate,
				endDate: tournament.endDate,
				type: tournament.type,
				goalValue: tournament.goalValue,
				rewardDescription: tournament.rewardDescription,
				winnerId: tournament.winnerId,
				victoryMessage: tournament.victoryMessage,
				resolvedAt: tournament.resolvedAt,
			},
			participants: withScores,
		})
	})

	const VALID_TOURNAMENT_TYPES: TournamentType[] = [
		"weight_loss",
		"step_count",
		"streak",
		"food_challenge",
	]

	adminRouter.post("/admin/tournaments/seed", async (req, res) => {
		const {
			creatorId,
			name,
			type,
			startDate,
			endDate,
			participantIds = [],
			goalValue,
			rewardDescription,
		} = req.body as {
			creatorId?: string
			name?: string
			type?: string
			startDate?: string
			endDate?: string
			participantIds?: string[]
			goalValue?: number
			rewardDescription?: string
		}

		if (!creatorId || !type) {
			res.status(400).json({ error: "creatorId and type are required" })
			return
		}

		if (!VALID_TOURNAMENT_TYPES.includes(type as TournamentType)) {
			res.status(400).json({
				error: `type must be one of: ${VALID_TOURNAMENT_TYPES.join(", ")}`,
			})
			return
		}

		const [creator] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, creatorId))
			.limit(1)

		if (!creator) {
			res.status(404).json({ error: "creatorId not found" })
			return
		}

		const start = startDate
			? new Date(startDate)
			: new Date(Date.now() - 7 * 86_400_000)
		const end = endDate
			? new Date(endDate)
			: new Date(Date.now() + 1 * 86_400_000)

		const [inserted] = await db
			.insert(tournaments)
			.values({
				name: name ?? `Seeded ${type} Tournament`,
				creatorId,
				startDate: start,
				endDate: end,
				type: type as TournamentType,
				goalValue: goalValue ?? null,
				rewardDescription: rewardDescription ?? null,
			})
			.$returningId()

		const uniqueParticipantIds = Array.from(
			new Set([creatorId, ...participantIds]),
		)
		await db.insert(tournamentParticipants).values(
			uniqueParticipantIds.map((userId) => ({
				tournamentId: inserted.id,
				userId,
			})),
		)

		const [tournament] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, inserted.id))

		res.status(201).json({
			tournament: {
				id: tournament.id,
				name: tournament.name,
				creatorId: tournament.creatorId,
				startDate: tournament.startDate,
				endDate: tournament.endDate,
				type: tournament.type,
				goalValue: tournament.goalValue,
				rewardDescription: tournament.rewardDescription,
				winnerId: tournament.winnerId,
				victoryMessage: tournament.victoryMessage,
				resolvedAt: tournament.resolvedAt,
			},
			participantIds: uniqueParticipantIds,
		})
	})

	adminRouter.post("/admin/tournaments/:id/resolve", async (req, res) => {
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
			res.status(409).json({ error: "Tournament is already resolved" })
			return
		}

		await resolveTournament(tournamentId, aiService)

		const [updated] = await db
			.select()
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		res.json({
			tournament: {
				id: updated.id,
				name: updated.name,
				creatorId: updated.creatorId,
				startDate: updated.startDate,
				endDate: updated.endDate,
				type: updated.type,
				goalValue: updated.goalValue,
				rewardDescription: updated.rewardDescription,
				winnerId: updated.winnerId,
				victoryMessage: updated.victoryMessage,
				resolvedAt: updated.resolvedAt,
			},
		})
	})

	adminRouter.delete("/admin/tournaments/:id", async (req, res) => {
		const tournamentId = Number(req.params.id)
		if (Number.isNaN(tournamentId)) {
			res.status(400).json({ error: "Invalid tournament ID" })
			return
		}

		const [tournament] = await db
			.select({ id: tournaments.id })
			.from(tournaments)
			.where(eq(tournaments.id, tournamentId))

		if (!tournament) {
			res.status(404).json({ error: "Tournament not found" })
			return
		}

		await db
			.delete(tournamentParticipants)
			.where(eq(tournamentParticipants.tournamentId, tournamentId))
		await db.delete(tournaments).where(eq(tournaments.id, tournamentId))

		res.json({ success: true })
	})

	adminRouter.get("/admin/social/posts", async (_req, res) => {
		const posts = await db
			.select({
				id: socialPosts.id,
				userId: socialPosts.userId,
				userName: users.name,
				type: socialPosts.type,
				content: socialPosts.content,
				createdAt: socialPosts.createdAt,
			})
			.from(socialPosts)
			.innerJoin(users, eq(socialPosts.userId, users.id))
			.orderBy(desc(socialPosts.createdAt))

		if (posts.length === 0) {
			res.json([])
			return
		}

		const reactionCounts = await db
			.select({ postId: reactions.postId, count: count() })
			.from(reactions)
			.groupBy(reactions.postId)

		const countMap = new Map(reactionCounts.map((r) => [r.postId, r.count]))

		res.json(
			posts.map((p) => ({
				...p,
				reactionCount: countMap.get(p.id) ?? 0,
			})),
		)
	})

	const VALID_SOCIAL_POST_TYPES: (typeof socialPosts.$inferInsert)["type"][] = [
		"food_photo",
		"ai_message",
		"milestone",
		"weight_update",
		"challenge_completion",
	]

	adminRouter.post("/admin/social/posts", async (req, res) => {
		const { userId, type, content } = req.body as {
			userId?: string
			type?: string
			content?: unknown
		}

		if (!userId || !type) {
			res.status(400).json({ error: "userId and type are required" })
			return
		}

		if (
			!VALID_SOCIAL_POST_TYPES.includes(
				type as (typeof socialPosts.$inferInsert)["type"],
			)
		) {
			res.status(400).json({
				error: `type must be one of: ${VALID_SOCIAL_POST_TYPES.join(", ")}`,
			})
			return
		}

		if (
			typeof content !== "object" ||
			content === null ||
			Array.isArray(content)
		) {
			res.status(400).json({ error: "content must be an object" })
			return
		}

		const [user] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1)

		if (!user) {
			res.status(404).json({ error: "userId not found" })
			return
		}

		const [inserted] = await db
			.insert(socialPosts)
			.values({
				userId,
				type: type as (typeof socialPosts.$inferInsert)["type"],
				content,
			})
			.$returningId()

		const [post] = await db
			.select({
				id: socialPosts.id,
				userId: socialPosts.userId,
				userName: users.name,
				type: socialPosts.type,
				content: socialPosts.content,
				createdAt: socialPosts.createdAt,
			})
			.from(socialPosts)
			.innerJoin(users, eq(socialPosts.userId, users.id))
			.where(eq(socialPosts.id, inserted.id))

		res.status(201).json(post)
	})

	adminRouter.delete("/admin/social/posts/:id", async (req, res) => {
		const postId = Number(req.params.id)
		if (Number.isNaN(postId)) {
			res.status(400).json({ error: "Invalid post ID" })
			return
		}

		const [post] = await db
			.select({ id: socialPosts.id })
			.from(socialPosts)
			.where(eq(socialPosts.id, postId))

		if (!post) {
			res.status(404).json({ error: "Post not found" })
			return
		}

		await db.delete(reactions).where(eq(reactions.postId, postId))
		await db.delete(socialPosts).where(eq(socialPosts.id, postId))

		res.json({ success: true })
	})

	const DEFAULT_SEED_TASKS: SprintTask[] = [
		{ id: "task_1", title: "Log 3 meals" },
		{ id: "task_2", title: "Log a weight entry" },
		{ id: "task_3", title: "Complete a daily check-in" },
	]

	function computeSeedCompletion(
		taskIds: string[],
		completion: "none" | "partial" | "near_complete" | "complete",
	): string[] {
		if (completion === "none") return []
		if (completion === "complete") return taskIds
		if (completion === "near_complete") return taskIds.slice(0, -1)
		return taskIds.slice(0, Math.floor(taskIds.length / 2))
	}

	adminRouter.post("/admin/seed/:id/sprint", async (req, res) => {
		const { id } = req.params
		const {
			weekStart,
			completion = "complete",
			tasks: providedTasks,
		} = req.body as {
			weekStart?: string
			completion?: "none" | "partial" | "near_complete" | "complete"
			tasks?: SprintTask[]
		}

		const monday = getMondayOfWeek(weekStart ? new Date(weekStart) : undefined)

		let [sprint] = await db
			.select()
			.from(sprints)
			.where(and(eq(sprints.userId, id), eq(sprints.weekStart, monday)))
			.limit(1)

		if (!sprint) {
			const [inserted] = await db
				.insert(sprints)
				.values({
					userId: id,
					weekStart: monday,
					title: `Seeded Sprint ${monday.toISOString().slice(0, 10)}`,
					tasks: providedTasks ?? DEFAULT_SEED_TASKS,
				})
				.$returningId()
			;[sprint] = await db
				.select()
				.from(sprints)
				.where(eq(sprints.id, inserted.id))
		}

		const tasks = sprint.tasks as SprintTask[]
		const completedTasks = computeSeedCompletion(
			tasks.map((t) => t.id),
			completion,
		)

		await db
			.update(sprints)
			.set({
				completedTasks,
				completedAt: completion === "complete" ? new Date() : null,
			})
			.where(eq(sprints.id, sprint.id))

		res.status(201).json({
			sprint: {
				id: sprint.id,
				title: sprint.title,
				weekStart: sprint.weekStart,
				tasks,
			},
			completedTasks,
			completedAt: completion === "complete" ? new Date() : null,
			progress:
				tasks.length > 0
					? Math.round((completedTasks.length / tasks.length) * 100)
					: 0,
		})
	})

	adminRouter.post("/admin/sprints/generate", async (req, res) => {
		const { userId } = req.body as { userId?: string }

		if (userId) {
			const [user] = await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)

			if (!user) {
				res.status(404).json({ error: "User not found" })
				return
			}

			const result = await generateSprintForUser(aiService, user, db)
			if (result.status === "exists") {
				res
					.status(409)
					.json({ error: "Sprint already exists for this user this week" })
				return
			}

			res.status(201).json({ generated: 1, sprint: result.sprint })
			return
		}

		const { generated, weekStart } = await generateSprintsForAllUsers(
			aiService,
			db,
		)
		res.status(201).json({ generated, weekStart: weekStart.toISOString() })
	})

	const DEFAULT_SEED_GOALS: ChallengeGoal[] = [
		{
			id: "goal_1",
			title: "60 Glasses of Water",
			description: "Stay hydrated.",
			target: 60,
			unit: "glasses",
			dailyAmount: 6,
			dailyPrompt: "Did you drink 6 glasses today?",
		},
		{
			id: "goal_2",
			title: "200 Minutes of Movement",
			description: "Get moving.",
			target: 200,
			unit: "minutes",
			dailyAmount: 20,
			dailyPrompt: "Did you move for 20 minutes today?",
		},
	]

	type SeedCompletion = "none" | "partial" | "near_complete" | "complete"

	adminRouter.post("/admin/seed/:id/challenge", async (req, res) => {
		const { id } = req.params
		const now = new Date()
		const {
			month = now.getUTCMonth() + 1,
			year = now.getUTCFullYear(),
			completion = "complete",
			goals,
		} = req.body as {
			month?: number
			year?: number
			completion?: SeedCompletion
			goals?: ChallengeGoal[]
		}

		let [challenge] = await db
			.select()
			.from(challenges)
			.where(and(eq(challenges.month, month), eq(challenges.year, year)))
			.limit(1)

		if (!challenge) {
			const [inserted] = await db
				.insert(challenges)
				.values({
					title: `Seeded Challenge ${month}/${year}`,
					description: "Seeded via admin panel for testing",
					month,
					year,
					theme: "seeded",
					aiGenerated: false,
					tasks: goals ?? DEFAULT_SEED_GOALS,
				})
				.$returningId()
			;[challenge] = await db
				.select()
				.from(challenges)
				.where(eq(challenges.id, inserted.id))
		}

		const challengeGoals = challenge.tasks as ChallengeGoal[]

		await db
			.delete(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, id),
					eq(userChallenges.challengeId, challenge.id),
				),
			)

		if (completion !== "none") {
			const completedTasks: Record<string, number> = {}
			challengeGoals.forEach((g, i) => {
				if (completion === "complete") {
					completedTasks[g.id] = g.target
				} else if (completion === "near_complete") {
					const isLast = i === challengeGoals.length - 1
					completedTasks[g.id] = isLast ? Math.max(0, g.target - 1) : g.target
				} else {
					completedTasks[g.id] = Math.max(0, Math.floor(g.target / 2))
				}
			})

			await db.insert(userChallenges).values({
				userId: id,
				challengeId: challenge.id,
				completedTasks,
				completedAt: completion === "complete" ? new Date() : null,
			})
		}

		const [userChallenge] = await db
			.select()
			.from(userChallenges)
			.where(
				and(
					eq(userChallenges.userId, id),
					eq(userChallenges.challengeId, challenge.id),
				),
			)
			.limit(1)

		res.status(201).json({
			challenge: {
				id: challenge.id,
				title: challenge.title,
				month: challenge.month,
				year: challenge.year,
				goals: challengeGoals,
			},
			joined: !!userChallenge,
			completedTasks: userChallenge
				? (userChallenge.completedTasks as Record<string, number>)
				: null,
			completedAt: userChallenge?.completedAt ?? null,
		})
	})

	adminRouter.post("/admin/challenges/generate", async (_req, res) => {
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

	return adminRouter
}
