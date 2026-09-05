import { and, eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
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

	const [challenge] = await db
		.select()
		.from(challenges)
		.where(eq(challenges.id, inserted.id))

	return { status: "created", challenge }
}
