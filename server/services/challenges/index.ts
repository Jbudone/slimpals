import { and, eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type { CatalogChallenge } from "../../../shared/challenges/catalog.js"
import { catalogForMonth } from "../../../shared/challenges/catalog.js"
import type * as schema from "../../db/schema.js"
import { challenges } from "../../db/schema.js"
import type { AIService } from "../ai/index.js"

type Db = MySql2Database<typeof schema>

export type GenerateChallengeResult =
	| { status: "created"; challenge: typeof challenges.$inferSelect }
	| { status: "conflict" }

export async function generateChallengeForMonth(
	aiService: AIService,
	month: number,
	year: number,
	db: Db,
): Promise<GenerateChallengeResult> {
	const [existing] = await db
		.select({ id: challenges.id })
		.from(challenges)
		.where(and(eq(challenges.month, month), eq(challenges.year, year)))
		.limit(1)

	if (existing) {
		return { status: "conflict" }
	}

	try {
		const generated = await aiService.generateMonthlyChallenge(month, year)
		const [inserted] = await db
			.insert(challenges)
			.values({
				title: generated.title,
				description: generated.description,
				month,
				year,
				theme: generated.theme,
				aiGenerated: true,
				tasks: generated.goals,
			})
			.$returningId()
		return { status: "created", challenge: await byId(db, inserted.id) }
	} catch (err) {
		// the AI is down or answered badly: a curated card keeps the month going
		console.error("[challenges] AI generation failed, using the catalog:", err)
		return createCatalogChallenge(db, catalogForMonth(month, year), month, year)
	}
}

async function byId(db: Db, id: number) {
	const [challenge] = await db
		.select()
		.from(challenges)
		.where(eq(challenges.id, id))
	return challenge
}

/** Puts a curated card in a month (conflict when the month has one). */
export async function createCatalogChallenge(
	db: Db,
	card: CatalogChallenge,
	month: number,
	year: number,
): Promise<GenerateChallengeResult> {
	const [existing] = await db
		.select({ id: challenges.id })
		.from(challenges)
		.where(and(eq(challenges.month, month), eq(challenges.year, year)))
		.limit(1)
	if (existing) return { status: "conflict" }
	const [inserted] = await db
		.insert(challenges)
		.values({
			title: card.title,
			description: card.description,
			month,
			year,
			theme: card.theme,
			aiGenerated: false,
			tasks: card.goals,
			tagline: card.tagline,
			coachIntro: card.coachIntro,
			rewardCosmetic: card.rewardCosmetic,
		})
		.$returningId()
	return { status: "created", challenge: await byId(db, inserted.id) }
}
