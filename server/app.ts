import { toNodeHandler } from "better-auth/node"
import cors from "cors"
import express from "express"
import { auth } from "./auth.js"
import { db } from "./db/index.js"
import { seedBadges, seedGymUpgrades } from "./db/seed.js"
import { requireAuth } from "./middleware/requireAuth.js"
import { adminRouter } from "./routes/admin.js"
import { appleHealthRouter } from "./routes/appleHealth.js"
import { badgesRouter } from "./routes/badges.js"
import { createChallengesRouter } from "./routes/challenges.js"
import { checkinsRouter } from "./routes/checkins.js"
import { createFoodRouter } from "./routes/food.js"
import { gymRouter } from "./routes/gym.js"
import { healthRouter } from "./routes/health.js"
import { createInspirationRouter } from "./routes/inspiration.js"
import { invitesRouter } from "./routes/invites.js"
import { validateInvite } from "./routes/register.js"
import { socialRouter } from "./routes/social.js"
import { createSprintsRouter } from "./routes/sprints.js"
import { createTournamentsRouter } from "./routes/tournaments.js"
import { usersRouter } from "./routes/users.js"
import { weightRouter } from "./routes/weight.js"
import { type AIService, GeminiAIService } from "./services/ai/index.js"

const OPEN_ROUTES = new Set([
	"POST:/api/challenges/generate",
	"POST:/api/sprints/generate",
	"POST:/api/inspiration/generate",
])

export function createApp(deps: { aiService?: AIService } = {}) {
	const aiService = deps.aiService ?? new GeminiAIService()
	const app = express()

	seedBadges(db).catch((err) => console.error("Badge seed failed:", err))
	seedGymUpgrades(db).catch((err) =>
		console.error("Gym upgrade seed failed:", err),
	)

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

	// All /api/* routes beyond auth require a valid session,
	// except cron-style generation endpoints
	app.use("/api", (req, res, next) => {
		if (OPEN_ROUTES.has(`${req.method}:${req.baseUrl}${req.path}`)) {
			next()
			return
		}
		requireAuth(req, res, next)
	})

	// Serve uploaded files
	app.use("/uploads", express.static("uploads"))

	// Protected routes
	app.use("/api", usersRouter)
	app.use("/api", weightRouter)
	app.use("/api", createFoodRouter(aiService))
	app.use("/api", checkinsRouter)
	app.use("/api", socialRouter)
	app.use("/api", invitesRouter)
	app.use("/api", badgesRouter)
	app.use("/api", gymRouter)
	app.use("/api", createTournamentsRouter(aiService))
	app.use("/api", createInspirationRouter(aiService))
	app.use("/api", createChallengesRouter(aiService))
	app.use("/api", createSprintsRouter(aiService))
	app.use("/api", appleHealthRouter)
	app.use("/api", adminRouter)

	return app
}
