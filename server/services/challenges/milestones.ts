// Pays a gym the challenge milestones its player has reached, once each. Every
// payout is claimed with an INSERT IGNORE on (gym, source) under the gym row
// lock, like the other gym rewards, so ticking a goal twice or two racing
// requests pay one milestone once.
import { eq, sql } from "drizzle-orm"
import {
	type ChallengeMilestone,
	milestoneSource,
	reachedMilestones,
} from "../../../shared/challenges/milestones.js"
import { gymRewards, userGyms } from "../../db/schema.js"
import { getOrCreateGym } from "../gym/index.js"
import type { Db } from "../gym/layout3dStore.js"

/** Returns the milestones this call paid (none when all were paid before). */
export async function payChallengeMilestones(
	db: Db,
	userId: string,
	challengeId: number,
	fraction: number,
): Promise<ChallengeMilestone[]> {
	const reached = reachedMilestones(fraction)
	if (reached.length === 0) return []
	const gym = await getOrCreateGym(userId, db)
	return db.transaction(async (tx) => {
		await tx
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(eq(userGyms.id, gym.id))
			.for("update")
		const paid: ChallengeMilestone[] = []
		for (const m of reached) {
			const [claim] = await tx
				.insert(gymRewards)
				.ignore()
				.values({
					gymId: gym.id,
					source: milestoneSource(challengeId, m.pct),
					sweat: m.sweat,
					greens: m.greens,
				})
			if (!claim.affectedRows) continue
			await tx
				.update(userGyms)
				.set({
					coins: sql`${userGyms.coins} + ${m.coins}`,
					sweat: sql`${userGyms.sweat} + ${m.sweat}`,
					greens: sql`${userGyms.greens} + ${m.greens}`,
				})
				.where(eq(userGyms.id, gym.id))
			paid.push(m)
		}
		return paid
	})
}
