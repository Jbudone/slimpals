import { eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { invites, users } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const invitesRouter = Router()

function inviteStatus(invite: {
	usedByUserId: string | null
	expiresAt: Date
	revokedAt: Date | null
}): "active" | "used" | "expired" {
	if (invite.usedByUserId) return "used"
	if (invite.revokedAt || invite.expiresAt < new Date()) return "expired"
	return "active"
}

function invitePayload(
	invite: typeof invites.$inferSelect,
	usedByName: string | null,
) {
	return {
		id: invite.id,
		code: invite.code,
		createdAt: invite.createdAt,
		expiresAt: invite.expiresAt,
		status: inviteStatus(invite),
		usedByName,
	}
}

invitesRouter.get("/invites", async (req, res) => {
	const userId = (req as AuthRequest).user.id

	const rows = await db
		.select({
			invite: invites,
			usedByName: users.name,
		})
		.from(invites)
		.leftJoin(users, eq(invites.usedByUserId, users.id))
		.where(eq(invites.createdByUserId, userId))
		.orderBy(invites.createdAt)

	res.json(
		rows.map(({ invite, usedByName }) => invitePayload(invite, usedByName)),
	)
})

invitesRouter.post("/invites", async (req, res) => {
	const userId = (req as AuthRequest).user.id

	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	const suffix = Array.from(
		{ length: 8 },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join("")
	const code = `SLIM-${suffix}`

	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

	const [inserted] = await db
		.insert(invites)
		.values({ code, createdByUserId: userId, expiresAt })
		.$returningId()

	const [invite] = await db
		.select()
		.from(invites)
		.where(eq(invites.id, inserted.id))

	res.status(201).json(invitePayload(invite, null))
})
