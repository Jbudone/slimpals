import { and, eq, isNull } from "drizzle-orm"
import type { NextFunction, Request, Response } from "express"
import { pendingInvites } from "../auth.js"
import { db } from "../db/index.js"
import { invites, users } from "../db/schema.js"

export async function validateInvite(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const { email, inviteCode } = req.body as {
		email?: string
		inviteCode?: string
	}

	if (!inviteCode) {
		res.status(400).json({ error: "Invite code is required" })
		return
	}
	if (!email) {
		res.status(400).json({ error: "Email is required" })
		return
	}

	// Pre-check: reject if email is already registered
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1)
	if (existing) {
		res.status(400).json({ error: "Email already registered" })
		return
	}

	// Validate the invite code
	const [invite] = await db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.code, inviteCode),
				isNull(invites.usedByUserId),
				isNull(invites.revokedAt),
			),
		)
		.limit(1)

	if (!invite || invite.expiresAt < new Date()) {
		res.status(400).json({ error: "Invalid or expired invite code" })
		return
	}

	// Park the invite so the databaseHooks.user.create.after can mark it used
	pendingInvites.set(email, { id: invite.id, code: invite.code })
	next()
}
