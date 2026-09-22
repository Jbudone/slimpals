import { and, eq, isNull } from "drizzle-orm"
import { Router } from "express"
import type { MissionCadence, MissionDifficulty } from "../../shared/types.js"
import { db } from "../db/index.js"
import { missions } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const missionsRouter = Router()

const CADENCES: MissionCadence[] = ["daily", "weekly"]
const DIFFICULTIES: MissionDifficulty[] = ["easy", "medium", "hard"]

function missionPayload(row: typeof missions.$inferSelect) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		cadence: row.cadence,
		difficulty: row.difficulty,
		createdAt: row.createdAt,
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

	res.json({
		daily: rows.filter((r) => r.cadence === "daily").map(missionPayload),
		weekly: rows.filter((r) => r.cadence === "weekly").map(missionPayload),
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
