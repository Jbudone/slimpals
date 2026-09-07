import { fromNodeHeaders } from "better-auth/node"
import type { NextFunction, Request, Response } from "express"
import { auth } from "../auth.js"
import { getDevAutologinUser } from "./devAutologin.js"

export type AuthRequest = Request & {
	user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"]
	session: NonNullable<
		Awaited<ReturnType<typeof auth.api.getSession>>
	>["session"]
}

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	// A real session (including one set up by admin impersonation) always
	// wins over dev-autologin — otherwise autologin makes it impossible to
	// ever be anyone but the autologin user, impersonation included.
	// Dev-autologin only kicks in as a fallback when the browser has no
	// session at all, so the login screen can still be skipped.
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	})
	if (session) {
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
		return
	}

	const devUser = await getDevAutologinUser()
	if (devUser) {
		;(req as AuthRequest).user = devUser as AuthRequest["user"]
		;(req as AuthRequest).session = {
			id: "dev-autologin",
			userId: devUser.id,
		} as AuthRequest["session"]
		next()
		return
	}

	res.status(401).json({ error: "Unauthorized" })
}
