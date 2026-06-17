import { eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { badges, userBadges } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const badgesRouter = Router()

badgesRouter.get("/badges", async (_req, res) => {
	const all = await db.select().from(badges)
	res.json(all)
})

badgesRouter.get("/badges/mine", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const earned = await db
		.select({
			id: badges.id,
			userBadgeId: userBadges.id,
			key: badges.key,
			name: badges.name,
			description: badges.description,
			tier: badges.tier,
			earnedAt: userBadges.earnedAt,
		})
		.from(userBadges)
		.innerJoin(badges, eq(userBadges.badgeId, badges.id))
		.where(eq(userBadges.userId, userId))
	res.json(earned)
})
