// The monthly reward track (#126, first slice). No table of its own: each
// claimed step is a `gym_rewards` row (`track:<YYYY-MM>:<n>`) and the day's
// claim is a marker row (`trackday:<YYYY-MM-DD>`), so a step pays once and
// racing taps claim once. Themes and rewards are rules in
// shared/gym3d/rewardTrack.ts.
import { and, desc, eq, gte, like, lt, or, sql } from "drizzle-orm"
import { COSMETICS, cosmeticOf } from "../../../shared/gym3d/cosmetics.js"
import {
	claimBlock,
	daysInMonth,
	monthKey,
	themeOf,
	trackSteps,
} from "../../../shared/gym3d/rewardTrack.js"
import type {
	GymCosmeticDto,
	GymRewardTrackDto,
} from "../../../shared/types.js"
import {
	dailyCheckins,
	gymCosmetics,
	gymRewards,
	userGyms,
} from "../../db/schema.js"
import { BuildError, withGym } from "./build3d.js"
import type { Db } from "./layout3dStore.js"
import { dayKey } from "./rewards.js"
import { loadTrackOverride } from "./rewardTrackOverride.js"

async function checkedInToday(db: Db, userId: string, now: Date) {
	const start = new Date(now)
	start.setUTCHours(0, 0, 0, 0)
	const end = new Date(start.getTime() + 86_400_000)
	const [row] = await db
		.select({ id: dailyCheckins.id })
		.from(dailyCheckins)
		.where(
			and(
				eq(dailyCheckins.userId, userId),
				gte(dailyCheckins.date, start),
				lt(dailyCheckins.date, end),
			),
		)
		.limit(1)
	return !!row
}

async function state(db: Db, gymId: number, userId: string, now: Date) {
	const key = monthKey(now)
	const claimedRows = await db
		.select({ source: gymRewards.source })
		.from(gymRewards)
		.where(
			and(
				eq(gymRewards.gymId, gymId),
				like(gymRewards.source, `track:${key}:%`),
			),
		)
	const [today] = await db
		.select({ id: gymRewards.id })
		.from(gymRewards)
		.where(
			and(
				eq(gymRewards.gymId, gymId),
				eq(gymRewards.source, `trackday:${dayKey(now)}`),
			),
		)
	const override = await loadTrackOverride(db, key)
	const steps = trackSteps(key, override)
	return {
		key,
		override,
		steps,
		claimed: claimedRows.length,
		claimedToday: !!today,
		checkedIn: await checkedInToday(db, userId, now),
	}
}

function toDto(s: Awaited<ReturnType<typeof state>>): GymRewardTrackDto {
	const block = claimBlock({
		claimed: s.claimed,
		claimedToday: s.claimedToday,
		checkedIn: s.checkedIn,
		total: s.steps.length,
	})
	return {
		month: s.key,
		theme: themeOf(s.key, s.override),
		claimed: s.claimed,
		claimedToday: s.claimedToday,
		checkedIn: s.checkedIn,
		canClaim: block == null,
		blockedReason: block,
		steps: s.steps.map((st) => ({
			...st,
			claimed: st.n <= s.claimed,
			...(st.reward.cosmetic
				? { cosmeticName: cosmeticOf(st.reward.cosmetic)?.name }
				: {}),
		})),
	}
}

export async function getRewardTrack(
	db: Db,
	gymId: number,
	userId: string,
	now: Date = new Date(),
): Promise<GymRewardTrackDto> {
	return toDto(await state(db, gymId, userId, now))
}

/** Claims today's step: pays it and returns the track, or refuses. */
export async function claimTrackStep(
	db: Db,
	gymId: number,
	userId: string,
	now: Date = new Date(),
): Promise<{ track: GymRewardTrackDto; paid: GymRewardTrackDto["steps"][0] }> {
	const checkedIn = await checkedInToday(db, userId, now)
	return withGym(db, gymId, async (tx) => {
		const s = { ...(await state(tx as unknown as Db, gymId, userId, now)) }
		s.checkedIn = checkedIn
		const block = claimBlock({
			claimed: s.claimed,
			claimedToday: s.claimedToday,
			checkedIn: s.checkedIn,
			total: s.steps.length,
		})
		if (block) throw new BuildError(409, block)
		const step = s.steps[s.claimed]
		await tx.insert(gymRewards).values([
			{
				gymId,
				source: `track:${s.key}:${step.n}`,
				sweat: step.reward.sweat,
				greens: step.reward.greens,
			},
			{ gymId, source: `trackday:${dayKey(now)}`, sweat: 0, greens: 0 },
		])
		await tx
			.update(userGyms)
			.set({
				coins: sql`${userGyms.coins} + ${step.reward.coins}`,
				sweat: sql`${userGyms.sweat} + ${step.reward.sweat}`,
				greens: sql`${userGyms.greens} + ${step.reward.greens}`,
			})
			.where(eq(userGyms.id, gymId))
		if (step.reward.cosmetic)
			await tx
				.insert(gymCosmetics)
				.ignore()
				.values({
					gymId,
					cosmeticKey: step.reward.cosmetic,
					source: `track:${s.key}:${step.n}`,
				})
		s.claimed += 1
		s.claimedToday = true
		return {
			track: toDto(s),
			paid: { ...step, claimed: true },
		}
	})
}

/** The cosmetics a gym owns, newest first. */
export async function listCosmetics(
	db: Db,
	gymId: number,
): Promise<GymCosmeticDto[]> {
	const rows = await db
		.select()
		.from(gymCosmetics)
		.where(eq(gymCosmetics.gymId, gymId))
		.orderBy(desc(gymCosmetics.id))
	return rows.flatMap((r) => {
		const def = COSMETICS.find((c) => c.key === r.cosmeticKey)
		return def
			? [
					{
						key: def.key,
						name: def.name,
						kind: def.kind,
						worn: r.worn,
						from: def.from,
						at: r.createdAt.toISOString(),
					},
				]
			: []
	})
}

/** Test tool: makes this month's track stand at `step` steps claimed (0..the
 * month's length) without paying anything, and frees today's claim so the
 * next step can be taken at once. Returns the new track. */
export async function setTrackStep(
	db: Db,
	gymId: number,
	userId: string,
	step: number,
	now: Date = new Date(),
): Promise<GymRewardTrackDto> {
	const key = monthKey(now)
	const total = daysInMonth(key)
	const n = Math.max(0, Math.min(total, Math.floor(step) || 0))
	await db.transaction(async (tx) => {
		await tx
			.select({ id: userGyms.id })
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		await tx
			.delete(gymRewards)
			.where(
				and(
					eq(gymRewards.gymId, gymId),
					or(
						like(gymRewards.source, `track:${key}:%`),
						eq(gymRewards.source, `trackday:${dayKey(now)}`),
					),
				),
			)
		if (n)
			await tx.insert(gymRewards).values(
				Array.from({ length: n }, (_, i) => ({
					gymId,
					source: `track:${key}:${i + 1}`,
					sweat: 0,
					greens: 0,
				})),
			)
	})
	return getRewardTrack(db, gymId, userId, now)
}
