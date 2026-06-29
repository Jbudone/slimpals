import { and, eq, gt } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import {
	gymNpcDialogBatches,
	gymNpcs,
	userGymNpcRelationships,
} from "../../db/schema.js"
import type { AIService } from "../ai/index.js"
import type { MemoryEvent } from "./content.js"

type Db = MySql2Database<typeof schema>

export type DialogEntry = {
	promptText: string
	response: string
	portraitVariant: "happy" | "neutral" | "determined"
	personalityTagAdded: string | null
}

export type RelationshipStage = 0 | 1 | 2 | 3

const STAGE_LABELS: Record<RelationshipStage, string> = {
	0: "Stranger",
	1: "Acquaintance",
	2: "Gym Buddy",
	3: "Friend",
}

export function getRelationshipStage(level: number): RelationshipStage {
	if (level >= 75) return 3
	if (level >= 50) return 2
	if (level >= 25) return 1
	return 0
}

export function getStageLabel(stage: RelationshipStage): string {
	return STAGE_LABELS[stage]
}

export async function getOrCreateRelationship(
	gymId: number,
	npcKey: string,
	db: Db,
) {
	const [existing] = await db
		.select()
		.from(userGymNpcRelationships)
		.where(
			and(
				eq(userGymNpcRelationships.gymId, gymId),
				eq(userGymNpcRelationships.npcKey, npcKey),
			),
		)

	if (existing) return existing

	const [inserted] = await db
		.insert(userGymNpcRelationships)
		.values({ gymId, npcKey })
		.$returningId()

	const [row] = await db
		.select()
		.from(userGymNpcRelationships)
		.where(eq(userGymNpcRelationships.id, inserted.id))

	return row
}

export async function getCurrentDialogBatch(
	gymId: number,
	npcKey: string,
	stage: RelationshipStage,
	db: Db,
): Promise<DialogEntry[] | null> {
	const now = new Date()
	const [batch] = await db
		.select()
		.from(gymNpcDialogBatches)
		.where(
			and(
				eq(gymNpcDialogBatches.gymId, gymId),
				eq(gymNpcDialogBatches.npcKey, npcKey),
				eq(gymNpcDialogBatches.relationshipStage, stage),
				gt(gymNpcDialogBatches.expiresAt, now),
			),
		)

	if (!batch) return null
	return batch.dialogs as DialogEntry[]
}

export async function generateDialogBatch(
	gymId: number,
	npcKey: string,
	stage: RelationshipStage,
	aiService: AIService,
	db: Db,
	userStats?: {
		streak: number
		recentBadges: string[]
		latestWeightKg: number | null
	},
): Promise<DialogEntry[]> {
	const [npc] = await db.select().from(gymNpcs).where(eq(gymNpcs.key, npcKey))

	if (!npc) return []

	const rel = await getOrCreateRelationship(gymId, npcKey, db)
	const personalityNotes = (rel.personalityNotes as string[]) ?? []
	const profile = npc.personalityProfile as Record<string, unknown>
	const stageLabel = getStageLabel(stage)

	const statsStr = userStats
		? `Streak: ${userStats.streak} days. Recent badges: ${userStats.recentBadges.join(", ") || "none"}. Latest weight: ${userStats.latestWeightKg ?? "unknown"} kg.`
		: "No stats available yet."

	const notesStr =
		personalityNotes.length > 0
			? personalityNotes.join(", ")
			: "Nothing yet — first conversations."

	const memoryEvents = (rel.gymMemoryEvents as MemoryEvent[] | undefined) ?? []
	const unreferencedEvents = memoryEvents.filter((e) => !e.referenced)
	const memoryStr =
		unreferencedEvents.length > 0
			? `Recent milestones to naturally weave in (each only once): ${unreferencedEvents.map((e) => e.event).join(", ")}.`
			: ""

	const prompt = `You are ${npc.name}, a ${npc.role} at a gym. Personality: ${JSON.stringify(profile)}.
Your relationship with this gym member is at stage ${stage} (${stageLabel}).
Their recent stats: ${statsStr}
Things you know about them from past conversations: ${notesStr}.
${memoryStr}

Generate 5 realistic, casual gym conversation exchanges.
Each must have:
- promptText: what the gym member could say (max 20 words, natural gym small talk)
- response: your reply as ${npc.name} (max 40 words, in character)
- portraitVariant: "happy" | "neutral" | "determined"
- personalityTagAdded: a short tag describing something new you learned about them (or null)

Return JSON array only, no markdown.`

	const dialogs = await aiService.generateNpcDialogs(prompt)

	if (unreferencedEvents.length > 0) {
		const updatedEvents = memoryEvents.map((e) =>
			!e.referenced ? { ...e, referenced: true } : e,
		)
		await db
			.update(userGymNpcRelationships)
			.set({ gymMemoryEvents: updatedEvents })
			.where(
				and(
					eq(userGymNpcRelationships.gymId, gymId),
					eq(userGymNpcRelationships.npcKey, npcKey),
				),
			)
	}

	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

	await db.insert(gymNpcDialogBatches).values({
		gymId,
		npcKey,
		relationshipStage: stage,
		dialogs,
		expiresAt,
	})

	return dialogs
}

export function computeRelationshipGain(stage: RelationshipStage): number {
	const gains: Record<RelationshipStage, [number, number]> = {
		0: [5, 8],
		1: [4, 7],
		2: [3, 6],
		3: [3, 5],
	}
	const [min, max] = gains[stage]
	return Math.floor(Math.random() * (max - min + 1)) + min
}
