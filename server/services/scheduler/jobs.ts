// The app's scheduled jobs. Each calls the same service function as its
// X-Cron-Secret endpoint (never HTTP). The per-period claim in the scheduler
// stops a double run; the services also skip work that already exists
// (a challenge for the month, a sprint/inspiration per user per week, an
// unexpired NPC dialog batch, an already-resolved tournament).
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import type { AIService } from "../ai/index.js"
import { generateChallengeForMonth } from "../challenges/index.js"
import { generateNightlyGymContent } from "../gym/content.js"
import { generateInspirationForAllUsers } from "../inspiration/index.js"
import { generateSprintsForAllUsers } from "../sprints/index.js"
import { resolveDueTournaments } from "../tournaments/index.js"
import { createScheduler, type ScheduledJob, type Scheduler } from "./index.js"
import { createDbRunStore } from "./store.js"

type Db = MySql2Database<typeof schema>

export function buildScheduledJobs(
	aiService: AIService,
	db: Db,
): ScheduledJob[] {
	return [
		{
			key: "monthly-challenge",
			label: "Monthly challenge",
			schedule: { kind: "monthly", atMinute: 5 },
			async run(now) {
				const month = now.getUTCMonth() + 1
				const year = now.getUTCFullYear()
				const res = await generateChallengeForMonth(aiService, month, year, db)
				return res.status === "created"
					? { created: true, challengeId: res.challenge.id }
					: { created: false, reason: "already exists" }
			},
		},
		{
			key: "weekly-sprints",
			label: "Weekly sprints",
			schedule: { kind: "weekly", atMinute: 5 },
			async run() {
				const { generated, weekStart } = await generateSprintsForAllUsers(
					aiService,
					db,
				)
				return { generated, weekStart: weekStart.toISOString() }
			},
		},
		{
			key: "weekly-inspiration",
			label: "Weekly inspiration",
			schedule: { kind: "weekly", atMinute: 10 },
			async run(now) {
				const { generated, weekStart } = await generateInspirationForAllUsers(
					aiService,
					db,
					now,
				)
				return { generated, weekStart: weekStart.toISOString() }
			},
		},
		{
			key: "nightly-gym-content",
			label: "Nightly gym content + NPC dialog",
			schedule: { kind: "daily", atMinute: 20 },
			async run(now) {
				return generateNightlyGymContent(aiService, db, now)
			},
		},
		{
			key: "tournament-resolve",
			label: "Resolve ended tournaments",
			schedule: { kind: "interval", everyMs: 15 * 60 * 1000 },
			staleAfterMs: 30 * 60 * 1000,
			async run(now) {
				return resolveDueTournaments(aiService, now)
			},
		},
	]
}

export function createAppScheduler(aiService: AIService, db: Db): Scheduler {
	return createScheduler({
		jobs: buildScheduledJobs(aiService, db),
		store: createDbRunStore(db),
	})
}
