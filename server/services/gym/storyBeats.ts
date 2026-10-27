// Which chapters a campaign plays: the authored story if it has one, otherwise
// the chapters the story council wrote and the owner approved
// (docs/story_council.md). Nothing here changes an authored campaign, and a
// campaign with no approved arc and scenes still has no story.
import { and, desc, eq } from "drizzle-orm"
import type { Arc, Scene } from "../../../shared/content/storyCouncil.js"
import { type StoryBeat, storyFor } from "../../../shared/gym3d/story.js"
import { storyDrafts } from "../../db/schema.js"
import type { Db } from "./layout3dStore.js"

async function approved(db: Db, campaign: number, level: string, ref: string) {
	const [row] = await db
		.select()
		.from(storyDrafts)
		.where(
			and(
				eq(storyDrafts.campaign, campaign),
				eq(storyDrafts.level, level),
				eq(storyDrafts.ref, ref),
				eq(storyDrafts.status, "approved"),
			),
		)
		.orderBy(desc(storyDrafts.id))
		.limit(1)
	return row ?? null
}

/** Approved scenes in chapter order, up to the first chapter that has none:
 * a gap never lets the story skip ahead. */
async function approvedBeats(db: Db, campaign: number): Promise<StoryBeat[]> {
	const arcRow = await approved(db, campaign, "arc", String(campaign))
	if (!arcRow) return []
	const arc = arcRow.body as Arc
	const out: StoryBeat[] = []
	for (const c of arc.chapters) {
		const row = await approved(db, campaign, "scene", `c${campaign}-${c.n}`)
		if (!row) break
		const scene = row.body as Scene
		out.push({
			id: scene.id,
			act: 1,
			level: c.level,
			title: scene.title,
			recap: scene.recap,
			lines: scene.lines.map((l) => ({
				who: l.who as StoryBeat["lines"][number]["who"],
				text: l.text,
			})),
		})
	}
	return out
}

export async function beatsForCampaign(
	db: Db,
	campaign: number,
): Promise<readonly StoryBeat[]> {
	const authored = storyFor(campaign)
	return authored.length ? authored : approvedBeats(db, campaign)
}

/** The chapter that finishes the campaign's story (null: it has no story). */
export async function finaleOfCampaign(
	db: Db,
	campaign: number,
): Promise<string | null> {
	const beats = await beatsForCampaign(db, campaign)
	return beats.length ? (beats[beats.length - 1] as StoryBeat).id : null
}
