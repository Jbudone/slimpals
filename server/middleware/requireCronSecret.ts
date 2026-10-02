import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

export const CRON_SECRET_HEADER = "x-cron-secret"

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest()
}

/**
 * True when the request carries the `X-Cron-Secret` header matching
 * CRON_SECRET. Fails closed: with no CRON_SECRET configured nothing matches.
 */
export function hasValidCronSecret(
	req: Pick<Request, "headers">,
	secret: string | undefined = process.env.CRON_SECRET,
): boolean {
	if (!secret) return false
	const given = req.headers[CRON_SECRET_HEADER]
	if (typeof given !== "string" || !given) return false
	// Hash both sides so the comparison is constant-time whatever the lengths.
	return timingSafeEqual(digest(given), digest(secret))
}

/**
 * Guards the cron-style generation endpoints (listed in OPEN_ROUTES in
 * server/app.ts, so they skip session auth). They spend AI credits, so the
 * caller must prove it is the scheduler/operator with the shared secret.
 */
export function requireCronSecret(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (hasValidCronSecret(req)) {
		next()
		return
	}
	res.status(401).json({ error: "Unauthorized" })
}
