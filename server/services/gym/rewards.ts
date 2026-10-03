// Sweat and Greens for real tasks (gym home). Every payout is claimed with
// an INSERT IGNORE on (gym, source) first, so one activity pays once however
// often it is ticked, un-ticked and ticked again, and two racing requests
// cannot both pay. See the mapping in shared/gym3d/economy.ts.
import { and, eq, sql } from "drizzle-orm"
import { ECONOMY } from "../../../shared/gym3d/economy.js"
import type { Reward } from "../../../shared/types.js"
import { gymRewards, userGyms } from "../../db/schema.js"
import { getOrCreateGym } from "./index.js"
import type { Db } from "./layout3dStore.js"

export type { Reward }

export const NO_REWARD: Reward = { sweat: 0, greens: 0 }

/** Pays `reward` for the activity `source` unless it was paid before.
 * Returns what was actually paid (zeros when already paid). */
export async function payReward(
	userId: string,
	source: string,
	reward: Reward,
	db: Db,
): Promise<Reward> {
	const gym = await getOrCreateGym(userId, db)
	return payGymReward(gym.id, source, reward, db)
}

/** Same as `payReward` for a gym that is already known. */
export async function payGymReward(
	gymId: number,
	source: string,
	reward: Reward,
	db: Db,
): Promise<Reward> {
	const sweat = Math.max(0, Math.round(reward.sweat))
	const greens = Math.max(0, Math.round(reward.greens))
	if (!sweat && !greens) return NO_REWARD
	return db.transaction(async (tx) => {
		// the gym row first, always: racing payouts queue here instead of
		// deadlocking between the claim's unique key and the balance update
		await tx
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		const [claim] = await tx
			.insert(gymRewards)
			.ignore()
			.values({ gymId, source: source.slice(0, 64), sweat, greens })
		if (!claim.affectedRows) return NO_REWARD
		await tx
			.update(userGyms)
			.set({
				sweat: sql`${userGyms.sweat} + ${sweat}`,
				greens: sql`${userGyms.greens} + ${greens}`,
			})
			.where(eq(userGyms.id, gymId))
		return { sweat, greens }
	})
}

/** Records activities as already paid, with nothing paid (a gym's goals
 * that were met before goals existed start out done, not rewarded). Takes
 * the gym row lock so racing first reads queue up instead of deadlocking
 * on the unique key, and does nothing when `marker` was written already. */
export async function markPaid(
	gymId: number,
	marker: string,
	sources: readonly string[],
	db: Db,
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		const [done] = await tx
			.select({ id: gymRewards.id })
			.from(gymRewards)
			.where(and(eq(gymRewards.gymId, gymId), eq(gymRewards.source, marker)))
		if (done) return
		for (const source of [marker, ...sources])
			await tx
				.insert(gymRewards)
				.ignore()
				.values({ gymId, source: source.slice(0, 64), sweat: 0, greens: 0 })
	})
}

/** YYYY-MM-DD (UTC) for reward sources. */
export function dayKey(d: Date = new Date()): string {
	return d.toISOString().slice(0, 10)
}

export function mealReward(): Reward {
	return { sweat: 0, greens: ECONOMY.rewards.mealGreens }
}

export function weightReward(): Reward {
	return { sweat: 0, greens: ECONOMY.rewards.weightGreens }
}
