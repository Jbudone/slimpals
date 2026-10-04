// Creates the system-run weekly and monthly tournaments (see
// shared/tournaments/recurring.ts). Idempotent: `system_key` is unique, so a
// period never gets two tournaments however many times this runs.

import { eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import { cleanTournamentFlavor } from "../../../shared/tournaments/flavor.js"
import { recurringPeriods } from "../../../shared/tournaments/recurring.js"
import type * as schema from "../../db/schema.js"
import { socialPosts, tournaments } from "../../db/schema.js"
import type { AIService } from "../ai/index.js"

type Db = MySql2Database<typeof schema>

export async function ensureRecurringTournaments(
	db: Db,
	now: Date = new Date(),
	ai?: AIService,
): Promise<{ created: number }> {
	let created = 0
	for (const p of recurringPeriods(now)) {
		const [res] = await db.insert(tournaments).ignore().values({
			name: p.name,
			creatorId: null,
			systemKey: p.key,
			type: p.type,
			startDate: p.start,
			endDate: p.end,
			rewardDescription: "Bragging rights",
		})
		created += res.affectedRows
		// a new one is announced in the feed (by the system, not a user)
		if (res.affectedRows > 0) {
			let name = p.name
			// the AI may give it a livelier name and prize; the plain name stays
			// when it is down or answers badly
			if (ai?.generateTournamentFlavor) {
				try {
					const flavor = cleanTournamentFlavor(
						await ai.generateTournamentFlavor(
							p.type,
							p.kind,
							`${p.start.toISOString().slice(0, 10)} to ${p.end.toISOString().slice(0, 10)}`,
						),
					)
					if (flavor) {
						await db
							.update(tournaments)
							.set({ name: flavor.name, rewardDescription: flavor.reward })
							.where(eq(tournaments.systemKey, p.key))
						name = flavor.name
					}
				} catch (err) {
					console.error("[tournaments] flavor failed, keeping the name:", err)
				}
			}
			await db.insert(socialPosts).values({
				userId: null,
				type: "milestone",
				content: {
					text: `${name} is open: ${p.start.toISOString().slice(0, 10)} to ${p.end.toISOString().slice(0, 10)}. Join it from Tournaments. 🏁`,
				},
			})
		}
	}
	return { created }
}
