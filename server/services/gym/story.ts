// The story (shared/gym3d/story.ts) for one gym: which beat waits, which were
// seen, and the Pavement Street Open. Seeing a beat is one `gym_rewards`
// claim `story:<id>` (its time paces the next one); the contest's start and
// end are two more claims that hold the gym's XP at those moments.
import { and, eq, like, sql } from "drizzle-orm"
import {
	OPEN_END_PREFIX,
	OPEN_START_BEAT,
	OPEN_START_PREFIX,
	type OpenStart,
	openEndSource,
	openStartSource,
	openState,
} from "../../../shared/gym3d/open.js"
import {
	STORY,
	type StoryDto,
	type StorySeen,
	storyState,
} from "../../../shared/gym3d/story.js"
import { gymRewards, userGyms } from "../../db/schema.js"
import { BuildError } from "./build3d.js"
import type { Db } from "./layout3dStore.js"

const PREFIX = "story:"

type Claim = { source: string; at: Date }

async function claims(db: Db, gymId: number): Promise<Claim[]> {
	const rows = await db
		.select({ source: gymRewards.source, at: gymRewards.createdAt })
		.from(gymRewards)
		.where(
			and(eq(gymRewards.gymId, gymId), like(gymRewards.source, `${PREFIX}%`)),
		)
	return rows.map((r) => ({ source: r.source, at: r.at }))
}

const seenOf = (cs: Claim[]): StorySeen[] =>
	cs
		.map((c) => ({ id: c.source.slice(PREFIX.length), at: c.at }))
		.filter((s) => STORY.some((b) => b.id === s.id))

function startOf(cs: Claim[]): OpenStart | null {
	const c = cs.find((x) => x.source.startsWith(OPEN_START_PREFIX))
	if (!c) return null
	const [xp, level] = c.source.slice(OPEN_START_PREFIX.length).split(":")
	return { at: c.at, xp: Number(xp) || 0, level: Number(level) || 1 }
}

function endOf(cs: Claim[]): { xp: number } | null {
	const c = cs.find((x) => x.source.startsWith(OPEN_END_PREFIX))
	return c ? { xp: Number(c.source.slice(OPEN_END_PREFIX.length)) || 0 } : null
}

export async function getStoryDto(
	db: Db,
	gymId: number,
	now = new Date(),
): Promise<StoryDto> {
	const [gym] = await db
		.select({
			level: userGyms.level,
			xp: userGyms.xp,
			campaign: userGyms.campaign,
		})
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	// the authored story is campaign one's; later campaigns have none yet
	if ((gym?.campaign ?? 1) > 1)
		return {
			pending: null,
			log: [],
			nextLevel: null,
			waitingForOpen: false,
			open: null,
		}
	let cs = await claims(db, gymId)
	const start = startOf(cs)
	let end = endOf(cs)
	let open = openState({ start, end, xpNow: gym?.xp ?? 0, now })
	// the first read after the week is over keeps the XP of that moment
	if (open.phase === "ended" && !end) {
		await db
			.insert(gymRewards)
			.ignore()
			.values({
				gymId,
				source: openEndSource(gym?.xp ?? 0).slice(0, 64),
				sweat: 0,
				greens: 0,
			})
		cs = await claims(db, gymId)
		end = endOf(cs)
		open = openState({ start, end, xpNow: gym?.xp ?? 0, now })
	}
	const seen = seenOf(cs)
	const state = storyState(gym?.level ?? 0, seen, now, open.result)
	const at = new Map(seen.map((x) => [x.id, x.at]))
	return {
		pending: state.pending,
		log: state.log.map((b) => ({
			id: b.id,
			act: b.act,
			title: b.title,
			recap: b.recap,
			seenAt: (at.get(b.id) ?? now).toISOString(),
		})),
		nextLevel: state.nextLevel,
		waitingForOpen: state.waitingForOpen,
		open: start ? open : null,
	}
}

/** Records that the waiting beat was seen (only that one, once): starts the
 * Open when it is the chapter that does, and pays the chapter's reward. */
export async function markBeatSeen(
	db: Db,
	gymId: number,
	beatId: string,
	now = new Date(),
): Promise<StoryDto> {
	const dto = await getStoryDto(db, gymId, now)
	if (dto.pending?.id !== beatId)
		throw new BuildError(409, "That chapter is not waiting")
	const beat = dto.pending
	await db.transaction(async (tx) => {
		const [gym] = await tx
			.select({ xp: userGyms.xp, level: userGyms.level })
			.from(userGyms)
			.where(eq(userGyms.id, gymId))
			.for("update")
		const [claim] = await tx
			.insert(gymRewards)
			.ignore()
			.values({
				gymId,
				source: `${PREFIX}${beatId}`.slice(0, 64),
				sweat: 0,
				greens: 0,
			})
		if (!claim.affectedRows) return
		if (beat.reward)
			await tx
				.update(userGyms)
				.set({ coins: sql`${userGyms.coins} + ${beat.reward.coins}` })
				.where(eq(userGyms.id, gymId))
		if (beatId === OPEN_START_BEAT)
			await tx
				.insert(gymRewards)
				.ignore()
				.values({
					gymId,
					source: openStartSource(gym?.xp ?? 0, gym?.level ?? 1).slice(0, 64),
					sweat: 0,
					greens: 0,
				})
	})
	return getStoryDto(db, gymId, now)
}
