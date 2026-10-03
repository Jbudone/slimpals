// Staff growth (gym home): the staff cards and training. A staff member is
// trained with coins; every level above 1 raises the coins their area earns
// (see shared/gym3d/staff.ts). Rows exist only for trained staff (no row =
// level 1). Training pays out the waiting coin bubbles first, so the new
// rate only counts from then, and runs under the gym row lock.
import { and, eq } from "drizzle-orm"
import {
	STAFF,
	STAFF_MAX_LEVEL,
	staffBonus,
	staffDef,
	staffStats,
	trainCost,
} from "../../../shared/gym3d/staff.js"
import type { GymStaffDto } from "../../../shared/types.js"
import { gymStaff, userGymUpgrades } from "../../db/schema.js"
import { BuildError, spend, withGym } from "./build3d.js"
import { settleIncome, staffLevels } from "./income3d.js"
import type { Conn, Db } from "./layout3dStore.js"

/** Every staff card of the gym, in the cast's order. */
export async function staffCards(
	conn: Conn,
	gymId: number,
): Promise<GymStaffDto[]> {
	const levels = await staffLevels(conn, gymId)
	const unlocked = new Set(
		(
			await conn
				.select({ key: userGymUpgrades.upgradeKey })
				.from(userGymUpgrades)
				.where(eq(userGymUpgrades.gymId, gymId))
		).map((r) => r.key),
	)
	return STAFF.map((def) => {
		const level = levels.get(def.key) ?? 1
		return {
			npcKey: def.key,
			level,
			maxLevel: STAFF_MAX_LEVEL,
			stats: staffStats(def, level),
			area: def.area,
			perk: def.perk,
			bonus: staffBonus(def, level),
			trainCost: trainCost(level),
			available: def.unlockedBy == null || unlocked.has(def.unlockedBy),
		}
	})
}

/** Trains a staff member one level for coins. Answers the new cards and
 * the coins that were waiting in the bubbles (paid out first). */
export async function trainStaff(
	db: Db,
	gymId: number,
	npcKey: string,
): Promise<{ staff: GymStaffDto[]; coins: number; collected: number }> {
	const def = staffDef(npcKey)
	if (!def) throw new BuildError(404, "Unknown staff member")
	return withGym(db, gymId, async (tx, gym, now) => {
		const card = (await staffCards(tx, gymId)).find((c) => c.npcKey === npcKey)
		if (!card?.available)
			throw new BuildError(409, "They have not joined your gym yet")
		const cost = trainCost(card.level)
		if (cost == null) throw new BuildError(409, "Already fully trained")
		// pay what is waiting at the old rates, then the coins can be spent
		const collected = await settleIncome(tx, gymId, now)
		gym.coins += collected
		await spend(tx, gym, cost)
		const up = await tx
			.update(gymStaff)
			.set({ level: card.level + 1, updatedAt: now })
			.where(
				and(
					eq(gymStaff.gymId, gymId),
					eq(gymStaff.npcKey, npcKey),
					eq(gymStaff.level, card.level),
				),
			)
		if (!up[0].affectedRows) {
			if (card.level > 1) throw new BuildError(409, "Try that again")
			await tx
				.insert(gymStaff)
				.values({ gymId, npcKey, level: 2, updatedAt: now })
		}
		return {
			staff: await staffCards(tx, gymId),
			coins: gym.coins,
			collected,
		}
	})
}
