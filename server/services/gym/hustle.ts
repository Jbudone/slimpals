// Tap-to-hustle (gym home): tapping a working member until they are done
// pays a few coins. The client plays the taps; the server only decides the
// bonus: a piece that is really working, a daily count claimed through
// gym_rewards (`hustle:<day>:<n>`, unique per gym), and a payout that shrinks
// with the count (`hustleCoins`). Nothing here trusts how many taps there
// were: asking again and again just runs into the daily cap.
import { and, eq, like, sql } from "drizzle-orm"
import { ECONOMY, hustleCoins } from "../../../shared/gym3d/economy.js"
import { gymPieces, gymRewards, userGyms } from "../../db/schema.js"
import { BuildError, withGym } from "./build3d.js"
import { isEarningPiece } from "./income3d.js"
import type { Db } from "./layout3dStore.js"
import { dayKey } from "./rewards.js"

export type HustleResult = {
	/** Coins paid by this bonus (0 when the day's bonuses are used up). */
	paid: number
	/** Bonuses left today. */
	left: number
}

export async function hustleBonus(
	db: Db,
	gymId: number,
	pieceId: number,
): Promise<HustleResult> {
	return withGym(db, gymId, async (tx, _gym, now) => {
		const [piece] = await tx
			.select()
			.from(gymPieces)
			.where(and(eq(gymPieces.id, pieceId), eq(gymPieces.gymId, gymId)))
		if (!piece || !isEarningPiece(piece))
			throw new BuildError(404, "Nobody is working out there")
		const day = dayKey(now)
		const cap = ECONOMY.hustle.dailyCap
		const [row] = await tx
			.select({ n: sql<number>`count(*)` })
			.from(gymRewards)
			.where(
				and(
					eq(gymRewards.gymId, gymId),
					like(gymRewards.source, `hustle:${day}:%`),
				),
			)
		const used = Number(row?.n ?? 0)
		const paid = hustleCoins(used)
		if (!paid) return { paid: 0, left: 0 }
		const [claim] = await tx
			.insert(gymRewards)
			.ignore()
			.values({
				gymId,
				source: `hustle:${day}:${used + 1}`,
				sweat: 0,
				greens: 0,
			})
		if (!claim.affectedRows)
			return { paid: 0, left: Math.max(0, cap - used - 1) }
		await tx
			.update(userGyms)
			.set({ coins: sql`${userGyms.coins} + ${paid}` })
			.where(eq(userGyms.id, gymId))
		return { paid, left: cap - used - 1 }
	})
}
