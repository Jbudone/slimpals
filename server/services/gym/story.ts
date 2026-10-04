// The story (shared/gym3d/story.ts) for one gym: which beat waits, which were
// seen. Seeing a beat is one `gym_rewards` claim `story:<id>` (no payout), so
// each fires once and its time paces the next one.
import { and, eq, like } from "drizzle-orm"
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

async function seenBeats(db: Db, gymId: number): Promise<StorySeen[]> {
	const rows = await db
		.select({ source: gymRewards.source, at: gymRewards.createdAt })
		.from(gymRewards)
		.where(
			and(eq(gymRewards.gymId, gymId), like(gymRewards.source, `${PREFIX}%`)),
		)
	return rows
		.map((r) => ({ id: r.source.slice(PREFIX.length), at: r.at }))
		.filter((s) => STORY.some((b) => b.id === s.id))
}

export async function getStoryDto(
	db: Db,
	gymId: number,
	now = new Date(),
): Promise<StoryDto> {
	const [gym] = await db
		.select({ level: userGyms.level })
		.from(userGyms)
		.where(eq(userGyms.id, gymId))
	const seen = await seenBeats(db, gymId)
	const state = storyState(gym?.level ?? 0, seen, now)
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
	}
}

/** Records that the waiting beat was seen (only that one, once). */
export async function markBeatSeen(
	db: Db,
	gymId: number,
	beatId: string,
	now = new Date(),
): Promise<StoryDto> {
	const dto = await getStoryDto(db, gymId, now)
	if (dto.pending?.id !== beatId)
		throw new BuildError(409, "That chapter is not waiting")
	await db
		.insert(gymRewards)
		.ignore()
		.values({
			gymId,
			source: `${PREFIX}${beatId}`.slice(0, 64),
			sweat: 0,
			greens: 0,
		})
	return getStoryDto(db, gymId, now)
}
