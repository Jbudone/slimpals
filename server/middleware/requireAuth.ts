import { fromNodeHeaders } from "better-auth/node"
import type { NextFunction, Request, Response } from "express"
import { auth } from "../auth.js"

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	})
	if (!session) {
		res.status(401).json({ error: "Unauthorized" })
		return
	}
	// Attach session data for downstream handlers
	;(
		req as Request & {
			user: typeof session.user
			session: typeof session.session
		}
	).user = session.user
	;(
		req as Request & {
			user: typeof session.user
			session: typeof session.session
		}
	).session = session.session
	next()
}
