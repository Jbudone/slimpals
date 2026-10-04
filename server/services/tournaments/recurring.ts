// Creates the system-run weekly and monthly tournaments (see
// shared/tournaments/recurring.ts). Idempotent: `system_key` is unique, so a
// period never gets two tournaments however many times this runs.
import type { MySql2Database } from "drizzle-orm/mysql2"
import { recurringPeriods } from "../../../shared/tournaments/recurring.js"
import type * as schema from "../../db/schema.js"
import { tournaments } from "../../db/schema.js"

type Db = MySql2Database<typeof schema>

export async function ensureRecurringTournaments(
	db: Db,
	now: Date = new Date(),
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
	}
	return { created }
}
