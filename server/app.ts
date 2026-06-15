import { toNodeHandler } from "better-auth/node"
import cors from "cors"
import express from "express"
import { auth } from "./auth.js"
import { requireAuth } from "./middleware/requireAuth.js"
import { healthRouter } from "./routes/health.js"
import { validateInvite } from "./routes/register.js"
import { usersRouter } from "./routes/users.js"
import { weightRouter } from "./routes/weight.js"

export function createApp() {
	const app = express()

	app.use(
		cors({
			credentials: true,
			origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
		}),
	)
	app.use(express.json())

	// Health check (no auth required)
	app.use("/api", healthRouter)

	// Registration: validate invite code first, then hand off to Better Auth
	app.post("/api/auth/sign-up/email", validateInvite, toNodeHandler(auth))

	// All other Better Auth routes (sign-in, sign-out, session, etc.)
	app.use("/api/auth", toNodeHandler(auth))

	// All /api/* routes beyond auth require a valid session
	app.use("/api", requireAuth)

	// Protected routes
	app.use("/api", usersRouter)
	app.use("/api", weightRouter)

	return app
}
