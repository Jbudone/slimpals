import { and, count, eq, isNotNull } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	badges,
	foodLogs,
	userBadges,
	userChallenges,
	weightEntries,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { daysBetween, getLastCheckin } from "./checkins.js"
import { computeConsecutiveFoodDays } from "./food.js"

export const badgesRouter = Router()

type BadgeTier = "bronze" | "silver" | "gold" | "platinum"

type ProgressEntry = {
	key: string
	name: string
	tier: BadgeTier
	current: number
	target: number
	unit: string
}

// Thresholds mirror server/services/badges/index.ts's badgeKeysForContext —
// duplicated here (rather than refactored into shared data) since that
// switch statement isn't structured for reuse and this is a read-only
// progress *display* endpoint. Earning logic itself is untouched; these are
// only used to show "how close," never to award anything.
const STREAK_THRESHOLDS = [
	{ key: "streak_3", value: 3 },
	{ key: "streak_7", value: 7 },
	{ key: "streak_14", value: 14 },
	{ key: "streak_30", value: 30 },
	{ key: "streak_60", value: 60 },
	{ key: "streak_100", value: 100 },
	{ key: "streak_365", value: 365 },
]
const LOSS_THRESHOLDS = [
	{ key: "loss_2kg", value: 2 },
	{ key: "loss_5kg", value: 5 },
	{ key: "loss_10kg", value: 10 },
	{ key: "loss_15kg", value: 15 },
	{ key: "loss_20kg", value: 20 },
	{ key: "loss_25kg", value: 25 },
]
const WEIGHT_LOG_THRESHOLDS = [
	{ key: "weight_7_logs", value: 7 },
	{ key: "weight_30_logs", value: 30 },
]
const FOOD_DAYS_THRESHOLDS = [
	{ key: "food_7days", value: 7 },
	{ key: "food_30days", value: 30 },
]
const CHALLENGE_THRESHOLDS = [
	{ key: "challenge_first", value: 1 },
	{ key: "challenge_3", value: 3 },
	{ key: "challenge_6", value: 6 },
	{ key: "challenge_12", value: 12 },
]

badgesRouter.get("/badges", async (_req, res) => {
	const all = await db.select().from(badges)
	res.json(all)
})

badgesRouter.get("/badges/mine", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const earned = await db
		.select({
			id: badges.id,
			userBadgeId: userBadges.id,
			key: badges.key,
			name: badges.name,
			description: badges.description,
			tier: badges.tier,
			earnedAt: userBadges.earnedAt,
		})
		.from(userBadges)
		.innerJoin(badges, eq(userBadges.badgeId, badges.id))
		.where(eq(userBadges.userId, userId))
	res.json(earned)
})

// Read-only progress toward not-yet-earned badges, for the "closest to
// unlocking" display — only covers badge families with a clean, honest
// "current of target" shape and working award logic (streak, weight-loss,
// weight-log-count, food-consecutive-days, challenge-completed-count).
// Deliberately excludes: binary one-shot badges (no meaningful partial
// state), and badge families with no implemented award path anywhere in the
// codebase today (gym level/upgrades, sprints, social totals, tournament
// wins, app-age, theme-exploration, invites) — showing progress toward a
// badge that can never actually unlock would be misleading.
badgesRouter.get("/badges/progress", async (req, res) => {
	const userId = (req as AuthRequest).user.id

	const [earnedRows, allBadges] = await Promise.all([
		db
			.select({ key: badges.key })
			.from(userBadges)
			.innerJoin(badges, eq(userBadges.badgeId, badges.id))
			.where(eq(userBadges.userId, userId)),
		db.select().from(badges),
	])
	const earnedKeys = new Set(earnedRows.map((r) => r.key))
	const badgeByKey = new Map(allBadges.map((b) => [b.key, b]))

	const progress: ProgressEntry[] = []

	function addNext(
		thresholds: { key: string; value: number }[],
		current: number,
		unit: string,
	) {
		const next = thresholds.find((t) => !earnedKeys.has(t.key))
		if (!next) return
		const badge = badgeByKey.get(next.key)
		if (!badge) return
		progress.push({
			key: next.key,
			name: badge.name,
			tier: badge.tier,
			current: Math.max(0, Math.min(current, next.value)),
			target: next.value,
			unit,
		})
	}

	const lastCheckin = await getLastCheckin(userId)
	const streakCount =
		lastCheckin && daysBetween(lastCheckin.date, new Date()) <= 2
			? lastCheckin.streakCount
			: 0
	addNext(STREAK_THRESHOLDS, streakCount, "check-ins")

	const weightRows = await db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(weightEntries.recordedAt)
	if (weightRows.length > 1) {
		const lossKg =
			(weightRows[0].weightKg - weightRows[weightRows.length - 1].weightKg) / 10
		if (lossKg > 0) addNext(LOSS_THRESHOLDS, lossKg, "kg lost")
	}
	addNext(WEIGHT_LOG_THRESHOLDS, weightRows.length, "entries logged")

	const foodRows = await db
		.select({ loggedAt: foodLogs.loggedAt })
		.from(foodLogs)
		.where(eq(foodLogs.userId, userId))
	const consecutiveDays = computeConsecutiveFoodDays(
		foodRows.map((r) => r.loggedAt),
		new Date(),
	)
	addNext(FOOD_DAYS_THRESHOLDS, consecutiveDays, "days logged")

	const [{ value: completedChallenges }] = await db
		.select({ value: count() })
		.from(userChallenges)
		.where(
			and(
				eq(userChallenges.userId, userId),
				isNotNull(userChallenges.completedAt),
			),
		)
	addNext(CHALLENGE_THRESHOLDS, completedChallenges, "challenges completed")

	progress.sort((a, b) => b.current / b.target - a.current / a.target)
	res.json(progress)
})
