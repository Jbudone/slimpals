// What the owner has waiting (shared/admin/inbox.ts): live counts for the
// admin "To do" tab.
import { eq, sql } from "drizzle-orm"
import { Router } from "express"
import { buildInbox } from "../../shared/admin/inbox.js"
import { BAKEOFF_ENOUGH } from "../../shared/content/bakeoff.js"
import { db } from "../db/index.js"
import { contentItems, storyDrafts } from "../db/schema.js"
import { requireAdmin } from "../middleware/requireAdmin.js"
import { bakeoffState, latestRound } from "../services/content/bakeoff.js"

export function createAdminInboxRouter() {
	const router = Router()
	router.get("/admin/inbox", requireAdmin, async (_req, res) => {
		const [cand] = await db
			.select({ n: sql<string>`COUNT(*)` })
			.from(contentItems)
			.where(eq(contentItems.status, "candidate"))
		const [drafts] = await db
			.select({ n: sql<string>`COUNT(*)` })
			.from(storyDrafts)
			.where(eq(storyDrafts.status, "draft"))
		const round = await latestRound(db)
		const bake = round ? await bakeoffState(db, round) : null
		const left =
			bake && bake.entries > 0 ? Math.max(0, BAKEOFF_ENOUGH - bake.votes) : null
		res.json({
			tasks: buildInbox({
				candidates: Number(cand?.n ?? 0),
				bakeoffVotesLeft: left,
				storyDrafts: Number(drafts?.n ?? 0),
				openrouterKey: Boolean(process.env.OPENROUTER_API_KEY),
			}),
		})
	})
	return router
}
