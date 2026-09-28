// Sweat and Greens for real tasks (gym home). Every payout is claimed with
// an INSERT IGNORE on (gym, source) first, so one activity pays once however
// often it is ticked, un-ticked and ticked again, and two racing requests
// cannot both pay. See the mapping in shared/gym3d/economy.ts.
import { eq, sql } from "drizzle-orm"
import { ECONOMY } from "../../../shared/gym3d/economy.js"
import { gymRewards, userGyms } from "../../db/schema.js"
import { getOrCreateGym } from "./index.js"
import type { Db } from "./layout3dStore.js"

export type Reward = { sweat: number; greens: number }

export const NO_REWARD: Reward = { sweat: 0, greens: 0 }

/** Pays `reward` for the activity `source` unless it was paid before.
 * Returns what was actually paid (zeros when already paid). */
export async function payReward(
	userId: string,
	source: string,
	reward: Reward,
	db: Db,
): Promise<Reward> {
	const sweat = Math.max(0, Math.round(reward.sweat))
	const greens = Math.max(0, Math.round(reward.greens))
	if (!sweat && !greens) return NO_REWARD
	const gym = await getOrCreateGym(userId, db)
	return db.transaction(async (tx) => {
		const [claim] = await tx
			.insert(gymRewards)
			.ignore()
			.values({ gymId: gym.id, source: source.slice(0, 64), sweat, greens })
		if (!claim.affectedRows) return NO_REWARD
		await tx
			.update(userGyms)
			.set({
				sweat: sql`${userGyms.sweat} + ${sweat}`,
				greens: sql`${userGyms.greens} + ${greens}`,
			})
			.where(eq(userGyms.id, gym.id))
		return { sweat, greens }
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
