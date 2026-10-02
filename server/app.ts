import path from "node:path"
import { toNodeHandler } from "better-auth/node"
import cors from "cors"
import express from "express"
import { auth } from "./auth.js"
import { db } from "./db/index.js"
import {
	seedBadges,
	seedGymClasses,
	seedGymUpgrades,
	seedNpcs,
} from "./db/seed.js"
import { getDevAutologinUser } from "./middleware/devAutologin.js"
import { requireAuth } from "./middleware/requireAuth.js"
import { createAdminRouter, createImpersonationRouter } from "./routes/admin.js"
import { appleHealthRouter } from "./routes/appleHealth.js"
import { badgesRouter } from "./routes/badges.js"
import { createChallengesRouter } from "./routes/challenges.js"
import { checkinsRouter } from "./routes/checkins.js"
import { createContentTuningRouter } from "./routes/contentTuning.js"
import { createFoodRouter } from "./routes/food.js"
import { createGymRouter } from "./routes/gym.js"
import { healthRouter } from "./routes/health.js"
import { createInspirationRouter } from "./routes/inspiration.js"
import { invitesRouter } from "./routes/invites.js"
import { missionsRouter } from "./routes/missions.js"
import { validateInvite } from "./routes/register.js"
import { socialRouter } from "./routes/social.js"
import { createSprintsRouter } from "./routes/sprints.js"
import { createTournamentsRouter } from "./routes/tournaments.js"
import { usersRouter } from "./routes/users.js"
import { weightRouter } from "./routes/weight.js"
import { type AIService, GeminiAIService } from "./services/ai/index.js"
import type { Scheduler } from "./services/scheduler/index.js"
import { createAppScheduler } from "./services/scheduler/jobs.js"

// Cron-style generation endpoints: no session, but each one requires the
// X-Cron-Secret header (requireCronSecret; fails closed without CRON_SECRET).
// Production runs these through the in-process scheduler instead.
const OPEN_ROUTES = new Set([
	"POST:/api/challenges/generate",
	"POST:/api/sprints/generate",
	"POST:/api/inspiration/generate",
	"POST:/api/gym/cron/generate-content",
])

const CLIENT_DIR =
	process.env.NODE_ENV === "production"
		? path.resolve(import.meta.dirname, "../../client")
		: ""

export function createApp(
	deps: { aiService?: AIService; scheduler?: Scheduler } = {},
) {
	const aiService = deps.aiService ?? new GeminiAIService()
	// Built here (no timers until start()) so the admin panel can show and
	// trigger jobs; server/index.ts starts it when SCHEDULER_ENABLED.
	const scheduler = deps.scheduler ?? createAppScheduler(aiService, db)
	const app = express()

	seedBadges(db).catch((err) => console.error("Badge seed failed:", err))
	seedGymUpgrades(db).catch((err) =>
		console.error("Gym upgrade seed failed:", err),
	)
	seedNpcs(db).catch((err) => console.error("NPC seed failed:", err))
	seedGymClasses(db).catch((err) =>
		console.error("Gym class seed failed:", err),
	)

	if (
		process.env.NODE_ENV !== "production" &&
		process.env.DEV_AUTOLOGIN_EMAIL
	) {
		console.log(
			`[dev-autologin] enabled — every request auto-authenticates as ${process.env.DEV_AUTOLOGIN_EMAIL}`,
		)
	}

	app.use(
		cors({
			credentials: true,
			origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
		}),
	)
	app.use(express.json())

	if (CLIENT_DIR) {
		app.use(express.static(CLIENT_DIR))
	}

	// Health check (no auth required)
	app.use("/api", healthRouter)

	// Registration: validate invite code first, then hand off to Better Auth
	app.post("/api/auth/sign-up/email", validateInvite, toNodeHandler(auth))

	// Dev-only: make the frontend's session check see the autologin user
	// (DEV_AUTOLOGIN_EMAIL) so the login screen is skipped entirely.
	app.get("/api/auth/get-session", async (_req, res, next) => {
		const devUser = await getDevAutologinUser()
		if (!devUser) {
			next()
			return
		}
		res.json({
			session: { id: "dev-autologin", userId: devUser.id },
			user: {
				id: devUser.id,
				email: devUser.email,
				name: devUser.name,
				emailVerified: devUser.emailVerified,
			},
		})
	})

	// All other Better Auth routes (sign-in, sign-out, session, etc.)
	app.use("/api/auth", toNodeHandler(auth))

	// All /api/* routes beyond auth require a valid session,
	// except cron-style generation endpoints (secret-checked in their routers)
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
	app.use("/api", missionsRouter)
	app.use("/api", badgesRouter)
	app.use("/api", createGymRouter(aiService))
	app.use("/api", createTournamentsRouter(aiService))
	app.use("/api", createInspirationRouter(aiService))
	app.use("/api", createChallengesRouter(aiService))
	app.use("/api", createSprintsRouter(aiService))
	app.use("/api", appleHealthRouter)
	app.use("/api", createImpersonationRouter())
	app.use("/api", createAdminRouter(aiService, scheduler))
	app.use("/api", createContentTuningRouter(aiService))

	if (CLIENT_DIR) {
		app.get("/{*path}", (_req, res) => {
			res.sendFile(path.join(CLIENT_DIR, "index.html"))
		})
	}

	return app
}
