import { asc, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { weightEntries } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const weightRouter = Router()

function entryPayload(row: typeof weightEntries.$inferSelect) {
	return {
		id: row.id,
		weightKg: row.weightKg / 10,
		note: row.note,
		recordedAt: row.recordedAt,
		source: row.source,
	}
}

weightRouter.post("/weight", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const { weightKg, note, recordedAt } = req.body as {
		weightKg?: number
		note?: string
		recordedAt?: string
	}

	if (weightKg === undefined || weightKg === null) {
		res.status(400).json({ error: "weightKg is required" })
		return
	}
	if (typeof weightKg !== "number" || weightKg <= 0) {
		res.status(400).json({ error: "weightKg must be a positive number" })
		return
	}

	const stored = Math.round(weightKg * 10)
	const [inserted] = await db
		.insert(weightEntries)
		.values({
			userId,
			weightKg: stored,
			note: note ?? null,
			recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
		})
		.$returningId()

	const [row] = await db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.id, inserted.id))

	res.status(201).json(entryPayload(row))
})

weightRouter.get("/weight", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const rows = await db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(asc(weightEntries.recordedAt))

	res.json(rows.map(entryPayload))
})
