import { eq } from "drizzle-orm"
import type { NextFunction, Request, Response } from "express"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import type { AuthRequest } from "./requireAuth.js"

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
	const [user] = await db
		.select({ isAdmin: users.isAdmin })
		.from(users)
		.where(eq(users.id, userId))
	if (!user?.isAdmin) {
		res.status(403).json({ error: "Admin access required" })
		return
	}
	next()
}
