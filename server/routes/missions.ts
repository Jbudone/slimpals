import { and, eq, gte, isNull } from "drizzle-orm"
import { Router } from "express"
import {
	MISSION_XP,
	type MissionCadence,
	type MissionDifficulty,
} from "../../shared/types.js"
import { db } from "../db/index.js"
import { missionCompletions, missions } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import {
	awardGymXp,
	getLevelProgress,
	getOrCreateGym,
} from "../services/gym/index.js"
import {
	currentPeriodStart,
	isWithinCurrentPeriod,
} from "../services/missions/index.js"

export const missionsRouter = Router()

const CADENCES: MissionCadence[] = ["daily", "weekly"]
const DIFFICULTIES: MissionDifficulty[] = ["easy", "medium", "hard"]

function missionPayload(
	row: typeof missions.$inferSelect,
	completedThisPeriod = false,
) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		cadence: row.cadence,
		difficulty: row.difficulty,
		createdAt: row.createdAt,
		completedThisPeriod,
	}
}

function validateMissionInput(body: unknown): string | null {
	const { title, cadence, difficulty, description } = (body ?? {}) as {
		title?: unknown
		cadence?: unknown
		difficulty?: unknown
		description?: unknown
	}

	if (typeof title !== "string" || title.trim().length === 0) {
		return "title is required"
	}
	if (title.length > 255) {
		return "title must be 255 characters or fewer"
	}
	if (!CADENCES.includes(cadence as MissionCadence)) {
		return "cadence must be 'daily' or 'weekly'"
	}
	if (!DIFFICULTIES.includes(difficulty as MissionDifficulty)) {
		return "difficulty must be 'easy', 'medium', or 'hard'"
	}
	if (description !== undefined && typeof description !== "string") {
		return "description must be a string"
	}
	return null
}

missionsRouter.get("/missions", async (req, res) => {
	const userId = (req as unknown as AuthRequest).user.id

	const rows = await db
		.select()
		.from(missions)
		.where(and(eq(missions.userId, userId), isNull(missions.archivedAt)))
		.orderBy(missions.createdAt)

	// weeklyStart <= dailyStart always (Monday of this week is never later
	// than today), so fetching from weeklyStart onward covers the window
	// relevant to both cadences in one query.
	const now = new Date()
	const completions = await db
		.select({
			missionId: missionCompletions.missionId,
			periodStart: missionCompletions.periodStart,
		})
		.from(missionCompletions)
		.where(
			and(
				eq(missionCompletions.userId, userId),
				gte(missionCompletions.periodStart, currentPeriodStart("weekly", now)),
			),
		)

	const periodsByMission = new Map<number, Date[]>()
	for (const c of completions) {
		const list = periodsByMission.get(c.missionId) ?? []
		list.push(c.periodStart)
		periodsByMission.set(c.missionId, list)
	}

	function completedThisPeriod(row: typeof missions.$inferSelect): boolean {
		const periods = periodsByMission.get(row.id) ?? []
		return periods.some((p) =>
			isWithinCurrentPeriod(p, row.cadence as MissionCadence, now),
		)
	}

	res.json({
		daily: rows
			.filter((r) => r.cadence === "daily")
			.map((r) => missionPayload(r, completedThisPeriod(r))),
		weekly: rows
			.filter((r) => r.cadence === "weekly")
			.map((r) => missionPayload(r, completedThisPeriod(r))),
	})
})

missionsRouter.post("/missions", async (req, res) => {
	const userId = (req as unknown as AuthRequest).user.id

	const error = validateMissionInput(req.body)
	if (error) {
		res.status(400).json({ error })
		return
	}

	const { title, description, cadence, difficulty } = req.body as {
		title: string
		description?: string
		cadence: MissionCadence
		difficulty: MissionDifficulty
	}

	const [inserted] = await db
		.insert(missions)
		.values({
			userId,
			title: title.trim(),
			description: description?.trim() || null,
			cadence,
			difficulty,
		})
		.$returningId()

	const [row] = await db
		.select()
		.from(missions)
		.where(eq(missions.id, inserted.id))

	res.status(201).json(missionPayload(row))
})

missionsRouter.patch("/missions/:id", async (req, res) => {
	const userId = (req as unknown as AuthRequest).user.id
	const missionId = Number.parseInt(req.params.id, 10)

	if (Number.isNaN(missionId)) {
		res.status(400).json({ error: "Invalid mission ID" })
		return
	}

	const [existing] = await db
		.select()
		.from(missions)
		.where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
		.limit(1)

	if (!existing || existing.archivedAt) {
		res.status(404).json({ error: "Mission not found" })
		return
	}

	const error = validateMissionInput({
		title: req.body?.title ?? existing.title,
		cadence: req.body?.cadence ?? existing.cadence,
		difficulty: req.body?.difficulty ?? existing.difficulty,
		description: req.body?.description ?? existing.description ?? undefined,
	})
	if (error) {
		res.status(400).json({ error })
		return
	}

	const { title, description, cadence, difficulty } = req.body as {
		title?: string
		description?: string
		cadence?: MissionCadence
		difficulty?: MissionDifficulty
	}

	await db
		.update(missions)
		.set({
			title: title !== undefined ? title.trim() : existing.title,
			description:
				description !== undefined
					? description.trim() || null
					: existing.description,
			cadence: cadence ?? existing.cadence,
			difficulty: difficulty ?? existing.difficulty,
		})
		.where(eq(missions.id, missionId))

	const [row] = await db
		.select()
		.from(missions)
		.where(eq(missions.id, missionId))

	res.json(missionPayload(row))
})

missionsRouter.post("/missions/:id/archive", async (req, res) => {
	const userId = (req as unknown as AuthRequest).user.id
	const missionId = Number.parseInt(req.params.id, 10)

	if (Number.isNaN(missionId)) {
		res.status(400).json({ error: "Invalid mission ID" })
		return
	}

	const [existing] = await db
		.select()
		.from(missions)
		.where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
		.limit(1)

	if (!existing || existing.archivedAt) {
		res.status(404).json({ error: "Mission not found" })
		return
	}

	await db
		.update(missions)
		.set({ archivedAt: new Date() })
		.where(eq(missions.id, missionId))

	res.json({ archived: true })
})

async function loadOwnedActiveMission(missionId: number, userId: string) {
	const [mission] = await db
		.select()
		.from(missions)
		.where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
		.limit(1)
	return mission && !mission.archivedAt ? mission : null
}

async function gymProgressPayload(userId: string) {
	const gym = await getOrCreateGym(userId, db)
	return { xp: gym.xp, ...getLevelProgress(gym.xp) }
}

missionsRouter.post("/missions/:id/complete", async (req, res) => {
	const userId = (req as unknown as AuthRequest).user.id
	const missionId = Number.parseInt(req.params.id, 10)

	if (Number.isNaN(missionId)) {
		res.status(400).json({ error: "Invalid mission ID" })
		return
	}

	const mission = await loadOwnedActiveMission(missionId, userId)
	if (!mission) {
		res.status(404).json({ error: "Mission not found" })
		return
	}

	const cadence = mission.cadence as MissionCadence
	const now = new Date()
	const periodStart = currentPeriodStart(cadence, now)

	const existingCompletions = await db
		.select()
		.from(missionCompletions)
		.where(eq(missionCompletions.missionId, missionId))

	const alreadyCompleted = existingCompletions.some((c) =>
		isWithinCurrentPeriod(c.periodStart, cadence, now),
	)
	if (alreadyCompleted) {
		res.status(400).json({ error: "Mission already completed this period" })
		return
	}

	const xpAwarded = MISSION_XP[cadence][mission.difficulty as MissionDifficulty]

	await db.insert(missionCompletions).values({
		missionId,
		userId,
		periodStart,
		xpAwarded,
	})
	await awardGymXp(userId, xpAwarded, "mission_complete", db)

	res.json({
		completed: true,
		xpAwarded,
		gym: await gymProgressPayload(userId),
	})
})

missionsRouter.post("/missions/:id/uncomplete", async (req, res) => {
	const userId = (req as unknown as AuthRequest).user.id
	const missionId = Number.parseInt(req.params.id, 10)

	if (Number.isNaN(missionId)) {
		res.status(400).json({ error: "Invalid mission ID" })
		return
	}

	const mission = await loadOwnedActiveMission(missionId, userId)
	if (!mission) {
		res.status(404).json({ error: "Mission not found" })
		return
	}

	const cadence = mission.cadence as MissionCadence
	const now = new Date()

	const existingCompletions = await db
		.select()
		.from(missionCompletions)
		.where(eq(missionCompletions.missionId, missionId))

	const currentCompletion = existingCompletions.find((c) =>
		isWithinCurrentPeriod(c.periodStart, cadence, now),
	)
	if (!currentCompletion) {
		res.status(400).json({ error: "Mission not completed this period" })
		return
	}

	await db
		.delete(missionCompletions)
		.where(eq(missionCompletions.id, currentCompletion.id))
	await awardGymXp(
		userId,
		-currentCompletion.xpAwarded,
		"mission_uncomplete",
		db,
	)

	res.json({
		completed: false,
		xpRetracted: currentCompletion.xpAwarded,
		gym: await gymProgressPayload(userId),
	})
})
