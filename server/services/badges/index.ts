import { and, eq, inArray } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import { badges, userBadges } from "../../db/schema.js"

type Db = MySql2Database<typeof schema>

export type BadgeContext =
	| { type: "checkin"; streakCount: number }
	| { type: "weight_loss"; lossKg: number; goalReached: boolean }
	| { type: "weight_log"; totalLogs: number }
	| {
			type: "food_log"
			totalLogs: number
			consecutiveDays: number
			todayMealTypes: string[]
	  }
	| { type: "social_share" }
	| { type: "social_react_given"; totalGiven: number }
	| { type: "social_reaction_received"; reactionsOnPost: number }
	| { type: "tournament_join" }
	| {
			type: "tournament_win"
			totalWins: number
			tournamentType: string
	  }

export type NewBadge = {
	key: string
	name: string
	tier: "bronze" | "silver" | "gold" | "platinum"
	earnedAt: Date
}

function badgeKeysForContext(ctx: BadgeContext): string[] {
	switch (ctx.type) {
		case "checkin": {
			const keys: string[] = []
			if (ctx.streakCount >= 3) keys.push("streak_3")
			if (ctx.streakCount >= 7) keys.push("streak_7")
			if (ctx.streakCount >= 14) keys.push("streak_14")
			if (ctx.streakCount >= 30) keys.push("streak_30")
			if (ctx.streakCount >= 60) keys.push("streak_60")
			if (ctx.streakCount >= 100) keys.push("streak_100")
			if (ctx.streakCount >= 365) keys.push("streak_365")
			return keys
		}
		case "weight_loss": {
			const keys: string[] = []
			if (ctx.lossKg >= 2) keys.push("loss_2kg")
			if (ctx.lossKg >= 5) keys.push("loss_5kg")
			if (ctx.lossKg >= 10) keys.push("loss_10kg")
			if (ctx.lossKg >= 15) keys.push("loss_15kg")
			if (ctx.lossKg >= 20) keys.push("loss_20kg")
			if (ctx.lossKg >= 25) keys.push("loss_25kg")
			if (ctx.goalReached) keys.push("loss_goal")
			return keys
		}
		case "weight_log": {
			const keys = ["weight_first_log"]
			if (ctx.totalLogs >= 7) keys.push("weight_7_logs")
			if (ctx.totalLogs >= 30) keys.push("weight_30_logs")
			return keys
		}
		case "food_log": {
			const keys = ["food_first"]
			if (ctx.totalLogs >= 100) keys.push("food_100logs")
			if (ctx.consecutiveDays >= 7) keys.push("food_7days")
			if (ctx.consecutiveDays >= 30) keys.push("food_30days")
			const mealTypes = new Set(ctx.todayMealTypes)
			if (
				["breakfast", "lunch", "dinner", "snack"].every((m) => mealTypes.has(m))
			) {
				keys.push("food_all_types")
			}
			return keys
		}
		case "social_share":
			return ["social_first_share"]
		case "social_react_given": {
			const keys = ["social_first_react"]
			if (ctx.totalGiven >= 50) keys.push("social_supportive")
			return keys
		}
		case "social_reaction_received": {
			const keys = ["social_first_reaction_received"]
			if (ctx.reactionsOnPost >= 10) keys.push("social_10_reacts")
			return keys
		}
		case "tournament_join":
			return ["tournament_first_join"]
		case "tournament_win": {
			const keys = ["tournament_first_win"]
			if (ctx.totalWins >= 3) keys.push("tournament_3_wins")
			if (ctx.tournamentType === "weight_loss")
				keys.push("tournament_weight_win")
			if (ctx.tournamentType === "streak") keys.push("tournament_streak_win")
			return keys
		}
	}
}

export async function checkAndAward(
	userId: string,
	ctx: BadgeContext,
	db: Db,
): Promise<NewBadge[]> {
	const candidateKeys = badgeKeysForContext(ctx)
	if (candidateKeys.length === 0) return []

	const candidateBadges = await db
		.select()
		.from(badges)
		.where(inArray(badges.key, candidateKeys))

	if (candidateBadges.length === 0) return []

	const alreadyEarned = await db
		.select({ badgeId: userBadges.badgeId })
		.from(userBadges)
		.where(
			and(
				eq(userBadges.userId, userId),
				inArray(
					userBadges.badgeId,
					candidateBadges.map((b) => b.id),
				),
			),
		)

	const alreadyEarnedIds = new Set(alreadyEarned.map((r) => r.badgeId))
	const toAward = candidateBadges.filter((b) => !alreadyEarnedIds.has(b.id))

	if (toAward.length === 0) return []

	const now = new Date()
	await db
		.insert(userBadges)
		.values(toAward.map((b) => ({ userId, badgeId: b.id, earnedAt: now })))

	return toAward.map((b) => ({
		key: b.key,
		name: b.name,
		tier: b.tier,
		earnedAt: now,
	}))
}
