import { eq } from "drizzle-orm"
import type { NextFunction, Request, Response } from "express"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import { IMPERSONATOR_COOKIE, parseCookies } from "../lib/cookies.js"
import type { AuthRequest } from "./requireAuth.js"

async function isAdminUser(userId: string): Promise<boolean> {
	const [user] = await db
		.select({ isAdmin: users.isAdmin })
		.from(users)
		.where(eq(users.id, userId))
	return user?.isAdmin ?? false
}

export async function requireAdmin(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (process.env.NODE_ENV === "production") {
		res.status(403).json({ error: "Admin panel not available in production" })
		return
	}
	const userId = (req as AuthRequest).user.id
	if (await isAdminUser(userId)) {
		next()
		return
	}

	// The current session is the impersonated (often non-admin) user, but
	// the admin panel should stay usable while impersonating — otherwise
	// the Admin nav link is a dead end until you stop impersonating first.
	const impersonatorId = parseCookies(req.headers.cookie)[IMPERSONATOR_COOKIE]
	if (impersonatorId && (await isAdminUser(impersonatorId))) {
		next()
		return
	}

	res.status(403).json({ error: "Admin access required" })
}
