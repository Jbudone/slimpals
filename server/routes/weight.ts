import { asc, count, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { users, weightEntries } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { checkAndAward } from "../services/badges/index.js"
import { ensureCheckin } from "./checkins.js"

const USER_COLORS = [
	"#6366f1",
	"#f59e0b",
	"#10b981",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#06b6d4",
	"#84cc16",
]

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

	await ensureCheckin(userId)

	const newBadges = []

	// Weight log count badges
	const [{ value: totalLogs }] = await db
		.select({ value: count() })
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
	newBadges.push(
		...(await checkAndAward(userId, { type: "weight_log", totalLogs }, db)),
	)

	// Weight loss badges: compare current vs. first entry
	const [firstEntry] = await db
		.select({ weightKg: weightEntries.weightKg })
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(asc(weightEntries.recordedAt))
		.limit(1)

	if (firstEntry) {
		const lossKg = (firstEntry.weightKg - stored) / 10
		if (lossKg > 0) {
			const [user] = await db
				.select({ goalWeightKg: users.goalWeightKg })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)
			const goalReached =
				user?.goalWeightKg != null && stored <= user.goalWeightKg
			newBadges.push(
				...(await checkAndAward(
					userId,
					{ type: "weight_loss", lossKg, goalReached },
					db,
				)),
			)
		}
	}

	res.status(201).json({ ...entryPayload(row), newBadges })
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

weightRouter.get("/weight/social", async (_req, res) => {
	// Fetch all users ordered by creation date for stable color assignment
	const allUsers = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.orderBy(asc(users.createdAt))

	const allEntries = await db
		.select()
		.from(weightEntries)
		.orderBy(asc(weightEntries.recordedAt))

	// Group entries by userId
	const byUser = new Map<string, typeof allEntries>()
	for (const entry of allEntries) {
		const list = byUser.get(entry.userId) ?? []
		list.push(entry)
		byUser.set(entry.userId, list)
	}

	// Only include users who have at least one entry
	const result = allUsers
		.filter((u) => byUser.has(u.id))
		.map((u, idx) => ({
			userId: u.id,
			userName: u.name,
			color: USER_COLORS[idx % USER_COLORS.length],
			entries: (byUser.get(u.id) ?? []).map(entryPayload),
		}))

	res.json(result)
})
