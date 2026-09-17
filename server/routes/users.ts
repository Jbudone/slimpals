import { eq } from "drizzle-orm"
import { type Request, Router } from "express"
import type { CoachPersonality, ViewMode } from "../../shared/types.js"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import { IMPERSONATOR_COOKIE, parseCookies } from "../lib/cookies.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const usersRouter = Router()

const VALID_THEMES = [
	"midnight",
	"forest",
	"sunset",
	"ocean",
	"light",
	"neon",
	"cream",
] as const

const VALID_PERSONALITIES: CoachPersonality[] = [
	"drill_sergeant",
	"friendly",
	"roaster",
	"anime_sensei",
	"bro",
]

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
		heightCm: user.heightCm,
		isAdmin: user.isAdmin,
		autoShareFoodLogs: user.autoShareFoodLogs,
		autoShareBadges: user.autoShareBadges,
		autoShareWeightMilestones: user.autoShareWeightMilestones,
	}
}

async function getImpersonatedBy(
	req: Request,
): Promise<{ id: string; name: string } | null> {
	const adminId = parseCookies(req.headers.cookie)[IMPERSONATOR_COOKIE]
	if (!adminId) return null
	const [admin] = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, adminId))
	return admin ?? null
}

usersRouter.get("/users/me", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const [user] = await db.select().from(users).where(eq(users.id, userId))
	if (!user) {
		res.status(404).json({ error: "User not found" })
		return
	}
	res.json({
		...userPayload(user),
		impersonatedBy: await getImpersonatedBy(req),
	})
})

usersRouter.patch("/users/me", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const {
		theme,
		goalWeightKg,
		goalDate,
		coachPersonality,
		viewMode,
		heightCm,
		autoShareFoodLogs,
		autoShareBadges,
		autoShareWeightMilestones,
	} = req.body as {
		theme?: string
		goalWeightKg?: number
		goalDate?: string
		coachPersonality?: string
		viewMode?: string
		heightCm?: number | null
		autoShareFoodLogs?: boolean
		autoShareBadges?: boolean
		autoShareWeightMilestones?: boolean
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
		coachPersonality !== undefined &&
		!VALID_PERSONALITIES.includes(coachPersonality as CoachPersonality)
	) {
		res.status(400).json({
			error: `Invalid personality. Must be one of: ${VALID_PERSONALITIES.join(", ")}`,
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

	const VALID_VIEW_MODES: ViewMode[] = ["simple", "technical"]
	if (
		viewMode !== undefined &&
		!VALID_VIEW_MODES.includes(viewMode as ViewMode)
	) {
		res.status(400).json({
			error: `Invalid viewMode. Must be one of: ${VALID_VIEW_MODES.join(", ")}`,
		})
		return
	}

	if (
		heightCm !== undefined &&
		heightCm !== null &&
		(typeof heightCm !== "number" || heightCm <= 0)
	) {
		res.status(400).json({ error: "heightCm must be a positive number" })
		return
	}

	const updates: Partial<typeof users.$inferInsert> = {}
	if (theme !== undefined)
		updates.theme = theme as (typeof VALID_THEMES)[number]
	if (coachPersonality !== undefined)
		updates.coachPersonality = coachPersonality as CoachPersonality
	if (viewMode !== undefined) updates.viewMode = viewMode as ViewMode
	if (heightCm !== undefined) updates.heightCm = heightCm
	if (goalWeightKg !== undefined)
		updates.goalWeightKg = Math.round(goalWeightKg * 10)
	if (goalDate !== undefined) updates.goalDate = new Date(goalDate)
	if (autoShareFoodLogs !== undefined)
		updates.autoShareFoodLogs = autoShareFoodLogs
	if (autoShareBadges !== undefined) updates.autoShareBadges = autoShareBadges
	if (autoShareWeightMilestones !== undefined)
		updates.autoShareWeightMilestones = autoShareWeightMilestones

	await db.update(users).set(updates).where(eq(users.id, userId))

	const [updated] = await db.select().from(users).where(eq(users.id, userId))
	res.json({
		...userPayload(updated),
		impersonatedBy: await getImpersonatedBy(req),
	})
})
