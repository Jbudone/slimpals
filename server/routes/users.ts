import { eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const usersRouter = Router()

const VALID_THEMES = [
	"midnight",
	"forest",
	"sunset",
	"ocean",
	"light",
	"neon",
] as const

function userPayload(user: typeof users.$inferSelect) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		theme: user.theme,
		coachPersonality: user.coachPersonality,
		viewMode: user.viewMode,
		goalWeightKg: user.goalWeightKg != null ? user.goalWeightKg / 10 : null,
		goalDate: user.goalDate ?? null,
	}
}

usersRouter.get("/users/me", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const [user] = await db.select().from(users).where(eq(users.id, userId))
	if (!user) {
		res.status(404).json({ error: "User not found" })
		return
	}
	res.json(userPayload(user))
})

usersRouter.patch("/users/me", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const { theme, goalWeightKg, goalDate } = req.body as {
		theme?: string
		goalWeightKg?: number
		goalDate?: string
	}

	if (
		theme !== undefined &&
		!VALID_THEMES.includes(theme as (typeof VALID_THEMES)[number])
	) {
		res.status(400).json({
			error: `Invalid theme. Must be one of: ${VALID_THEMES.join(", ")}`,
		})
		return
	}

	if (
		goalWeightKg !== undefined &&
		(typeof goalWeightKg !== "number" || goalWeightKg <= 0)
	) {
		res.status(400).json({ error: "goalWeightKg must be a positive number" })
		return
	}

	const updates: Partial<typeof users.$inferInsert> = {}
	if (theme !== undefined)
		updates.theme = theme as (typeof VALID_THEMES)[number]
	if (goalWeightKg !== undefined)
		updates.goalWeightKg = Math.round(goalWeightKg * 10)
	if (goalDate !== undefined) updates.goalDate = new Date(goalDate)

	await db.update(users).set(updates).where(eq(users.id, userId))

	const [updated] = await db.select().from(users).where(eq(users.id, userId))
	res.json(userPayload(updated))
})
