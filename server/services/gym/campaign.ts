// Campaigns (shared/gym3d/campaign.ts): a gym played start to finish. The one
// without `archivedAt` is in play; beginning the next archives it with a
// summary for the Hall of fame, starts a fresh gym for the same player and
// carries the cosmetics over (never the coins, staff, rooms or levels).
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm"
import {
	CAMPAIGN_FINALE,
	type CampaignDto,
	type CampaignSummary,
	daysBetween,
	type HallEntry,
} from "../../../shared/gym3d/campaign.js"
import { gymPieces, gymPlots, gymRewards, userGyms } from "../../db/schema.js"
import { BuildError } from "./build3d.js"
import type { Db } from "./layout3dStore.js"

async function finaleSeen(db: Db, gymId: number): Promise<boolean> {
	const rows = await db
		.select({ id: gymRewards.id })
		.from(gymRewards)
		.where(
			and(
				eq(gymRewards.gymId, gymId),
				eq(gymRewards.source, `story:${CAMPAIGN_FINALE}`),
			),
		)
		.limit(1)
	return rows.length > 0
}

export async function getCampaignDto(
	db: Db,
	userId: string,
	gymId: number,
): Promise<CampaignDto> {
	const [gym] = await db
		.select({ campaign: userGyms.campaign })
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	const archived = await db
		.select()
		.from(userGyms)
		.where(and(eq(userGyms.userId, userId), isNotNull(userGyms.archivedAt)))
		.orderBy(asc(userGyms.campaign))
	const hall: HallEntry[] = archived.map((g) => ({
		campaign: g.campaign,
		name: g.name,
		archivedAt: (g.archivedAt ?? g.createdAt).toISOString(),
		summary: (g.archiveSummary as CampaignSummary | null) ?? null,
	}))
	return {
		campaign: gym?.campaign ?? 1,
		canFinish: await finaleSeen(db, gymId),
		hall,
	}
}

/** Archives the gym in play and starts the next campaign. Only once the
 * story is finished. Returns the new gym's id. */
export async function beginNextCampaign(
	db: Db,
	userId: string,
	gymId: number,
	now = new Date(),
): Promise<number> {
	return db.transaction(async (tx) => {
		const [gym] = await tx
			.select()
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		if (!gym || gym.userId !== userId || gym.archivedAt)
			throw new BuildError(404, "No gym in play")
		if (!(await finaleSeen(tx as unknown as Db, gymId)))
			throw new BuildError(409, "Finish this campaign's story first")
		const [{ plots }] = await tx
			.select({ plots: count() })
			.from(gymPlots)
			.where(eq(gymPlots.gymId, gymId))
		const [{ pieces }] = await tx
			.select({ pieces: count() })
			.from(gymPieces)
			.where(eq(gymPieces.gymId, gymId))
		const summary: CampaignSummary = {
			level: gym.level,
			xp: gym.xp,
			plots,
			pieces,
			days: daysBetween(gym.createdAt, now),
		}
		await tx
			.update(userGyms)
			.set({ archivedAt: now, archiveSummary: summary })
			.where(eq(userGyms.id, gymId))
		const [created] = await tx
			.insert(userGyms)
			.values({
				userId,
				name: gym.name,
				campaign: gym.campaign + 1,
			})
			.$returningId()
		// cosmetics and trophies carry over (the decor on show starts unplaced)
		await tx.execute(sql`
			INSERT INTO gym_cosmetics (gym_id, cosmetic_key, source, worn)
			SELECT ${created.id}, cosmetic_key, 'campaign', worn
			FROM gym_cosmetics WHERE gym_id = ${gymId}`)
		return created.id
	})
}
