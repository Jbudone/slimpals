// Speech-bubble lines for the 3D gym (slice 3), from data the server already
// has: each NPC's cached dialog batches (still valid) and the milestone
// dialogs they have already told this member, plus friends / rivals from
// their personality for pair exchanges. Never calls the AI.
import { and, eq, gt } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import { extractBubbleLines } from "../../../shared/gym3d/npcLines.js"
import type * as schema from "../../db/schema.js"
import {
	gymNpcDialogBatches,
	gymNpcs,
	userGymNpcRelationships,
	userGymUpgrades,
} from "../../db/schema.js"
import type { DialogEntry } from "./dialog.js"

type Db = MySql2Database<typeof schema>

export type NpcLinesDto = {
	npcs: {
		key: string
		lines: string[]
		friends: string[]
		rivals: string[]
	}[]
}

/** Milestone dialog text by key (routes/gym.ts owns the definitions). */
export type MilestoneText = Record<
	string,
	{ npcKey: string; promptText: string; response: string }
>

const strings = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []

export async function buildNpcLines(
	gymId: number,
	db: Db,
	milestones: MilestoneText,
	now = new Date(),
): Promise<NpcLinesDto> {
	const npcs = await db.select().from(gymNpcs)
	const unlocked = new Set(
		(
			await db
				.select({ key: userGymUpgrades.upgradeKey })
				.from(userGymUpgrades)
				.where(eq(userGymUpgrades.gymId, gymId))
		).map((r) => r.key),
	)
	const rels = await db
		.select()
		.from(userGymNpcRelationships)
		.where(eq(userGymNpcRelationships.gymId, gymId))
	const batches = await db
		.select()
		.from(gymNpcDialogBatches)
		.where(
			and(
				eq(gymNpcDialogBatches.gymId, gymId),
				gt(gymNpcDialogBatches.expiresAt, now),
			),
		)
	const out: NpcLinesDto["npcs"] = []
	for (const n of npcs) {
		if (n.unlockedByUpgradeKey && !unlocked.has(n.unlockedByUpgradeKey))
			continue
		const texts: string[] = []
		// newest batch first
		for (const b of batches
			.filter((q) => q.npcKey === n.key)
			.sort((a, c) => c.generatedAt.getTime() - a.generatedAt.getTime())) {
			const d = (Array.isArray(b.dialogs) ? b.dialogs : []) as DialogEntry[]
			for (const e of d) {
				if (typeof e?.promptText === "string") texts.push(e.promptText)
				if (typeof e?.response === "string") texts.push(e.response)
			}
		}
		const rel = rels.find((r) => r.npcKey === n.key)
		for (const k of strings(rel?.milestoneDialogsFired)) {
			const m = milestones[k]
			if (m && m.npcKey === n.key) texts.push(m.promptText, m.response)
		}
		const p = (n.personalityProfile ?? {}) as {
			friendlyWith?: unknown
			rivalWith?: unknown
		}
		out.push({
			key: n.key,
			lines: extractBubbleLines(texts, 2, 8),
			friends: strings(p.friendlyWith),
			rivals: strings(p.rivalWith),
		})
	}
	return { npcs: out }
}
