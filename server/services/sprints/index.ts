import { and, count, eq, gte, lt } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import {
	dailyCheckins,
	foodLogs,
	sprints,
	userChallenges,
	users,
	weightEntries,
} from "../../db/schema.js"
import type { AIService } from "../ai/index.js"

type Db = MySql2Database<typeof schema>

export function getMondayOfWeek(d: Date = new Date()): Date {
	const date = new Date(d)
	date.setUTCHours(0, 0, 0, 0)
	const day = date.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	date.setUTCDate(date.getUTCDate() - diff)
	return date
}

export function getPreviousWeekRange(): { start: Date; end: Date } {
	const thisMonday = getMondayOfWeek()
	const lastMonday = new Date(thisMonday)
	lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)
	return { start: lastMonday, end: thisMonday }
}

export type GenerateSprintResult =
	| { status: "created"; sprint: typeof sprints.$inferSelect }
	| { status: "exists" }

export async function generateSprintForUser(
	aiService: AIService,
	user: { id: string; name: string },
	db: Db,
): Promise<GenerateSprintResult> {
	const monday = getMondayOfWeek()

	const [existing] = await db
		.select({ id: sprints.id })
		.from(sprints)
		.where(and(eq(sprints.userId, user.id), eq(sprints.weekStart, monday)))
		.limit(1)

	if (existing) {
		return { status: "exists" }
	}

	const { start, end } = getPreviousWeekRange()

	const [{ value: checkins }] = await db
		.select({ value: count() })
		.from(dailyCheckins)
		.where(
			and(
				eq(dailyCheckins.userId, user.id),
				gte(dailyCheckins.date, start),
				lt(dailyCheckins.date, end),
			),
		)

	const [{ value: foodLogCount }] = await db
		.select({ value: count() })
		.from(foodLogs)
		.where(
			and(
				eq(foodLogs.userId, user.id),
				gte(foodLogs.loggedAt, start),
				lt(foodLogs.loggedAt, end),
			),
		)

	const [{ value: weightCount }] = await db
		.select({ value: count() })
		.from(weightEntries)
		.where(
			and(
				eq(weightEntries.userId, user.id),
				gte(weightEntries.recordedAt, start),
				lt(weightEntries.recordedAt, end),
			),
		)

	const [activeChallenge] = await db
		.select({ id: userChallenges.id })
		.from(userChallenges)
		.where(eq(userChallenges.userId, user.id))
		.limit(1)

	const result = await aiService.generateWeeklySprint(user.name, {
		checkins,
		foodLogs: foodLogCount,
		weightEntries: weightCount,
		hasChallenge: !!activeChallenge,
	})

	const [inserted] = await db
		.insert(sprints)
		.values({
			userId: user.id,
			weekStart: monday,
			title: result.title,
			tasks: result.tasks,
		})
		.$returningId()

	const [sprint] = await db
		.select()
		.from(sprints)
		.where(eq(sprints.id, inserted.id))

	return { status: "created", sprint }
}

export async function generateSprintsForAllUsers(
	aiService: AIService,
	db: Db,
): Promise<{ generated: number; weekStart: Date }> {
	const monday = getMondayOfWeek()
	const allUsers = await db
		.select({ id: users.id, name: users.name })
		.from(users)

	let generated = 0
	for (const user of allUsers) {
		const result = await generateSprintForUser(aiService, user, db)
		if (result.status === "created") generated++
	}

	return { generated, weekStart: monday }
}
