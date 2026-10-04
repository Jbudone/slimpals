import { and, count, eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import { challengeFraction } from "../../../shared/challenges/milestones.js"
import { tierGoals } from "../../../shared/challenges/tiers.js"
import { cosmeticOf } from "../../../shared/gym3d/cosmetics.js"
import type * as schema from "../../db/schema.js"
import { challenges, userChallenges } from "../../db/schema.js"
import type { ChallengeGoal } from "../ai/index.js"
import { checkAndAward, shareBadges } from "../badges/index.js"
import { grantCosmetic } from "../gym/cosmetics.js"
import { awardGymXp, getOrCreateGym } from "../gym/index.js"
import { shareChallengeCompletion } from "./feed.js"
import { payChallengeMilestones } from "./milestones.js"

type Db = MySql2Database<typeof schema>
type GoalProgress = Record<string, number>
type DailyLog = Record<string, string[]>

/** The decor a curated challenge gives for finishing it. */
export function rewardOf(
	key: string | null,
): { key: string; name: string } | null {
	const def = key ? cosmeticOf(key) : null
	return def ? { key: def.key, name: def.name } : null
}

export type ProgressBody = Awaited<ReturnType<typeof addChallengeProgress>>

export type ProgressResult =
	| { ok: false; status: number; error: string }
	| {
			ok: true
			body: {
				progress: GoalProgress
				dailyLog: DailyLog
				milestonesPaid: Awaited<ReturnType<typeof payChallengeMilestones>>
				goalsCompleted: number
				totalGoals: number
				overallProgress: number
				completed: boolean
				newBadges: Awaited<ReturnType<typeof checkAndAward>>
				gymXpAwarded: number
				cosmeticAwarded: string | null
				rewardAwarded: string | null
			}
	  }

/** Adds progress to a joined challenge and settles whatever it reaches:
 * milestones, and on finishing the XP, trophy, decor, badges and feed post.
 * `auto` is for progress the app tracks itself: goals marked `auto` only
 * take progress from it, and ignore a player's own taps. */
export async function addChallengeProgress(
	db: Db,
	userId: string,
	challengeId: number,
	dailyProgress: Record<string, number>,
	opts: { auto?: boolean } = {},
): Promise<ProgressResult> {
	const [challenge] = await db
		.select()
		.from(challenges)
		.where(eq(challenges.id, challengeId))
		.limit(1)
	if (!challenge)
		return { ok: false, status: 404, error: "Challenge not found" }

	const [userChallenge] = await db
		.select()
		.from(userChallenges)
		.where(
			and(
				eq(userChallenges.userId, userId),
				eq(userChallenges.challengeId, challengeId),
			),
		)
		.limit(1)
	if (!userChallenge)
		return {
			ok: false,
			status: 400,
			error: "You must join the challenge first",
		}
	if (userChallenge.completedAt)
		return { ok: false, status: 400, error: "Challenge already completed" }

	const goals = tierGoals(
		challenge.tasks as ChallengeGoal[],
		userChallenge.tier,
	)
	// a player's taps never move a goal the app tracks itself, and the app's
	// own progress only moves those
	const takes = new Map(goals.map((g) => [g.id, !!g.auto === !!opts.auto]))
	const current = (userChallenge.completedTasks ?? {}) as GoalProgress
	const dailyLog = (userChallenge.dailyLog ?? {}) as DailyLog
	const today = new Date().toISOString().slice(0, 10)

	for (const [goalId, value] of Object.entries(dailyProgress)) {
		if (!takes.get(goalId)) continue
		if (typeof value !== "number" || value < 0) continue
		current[goalId] = (current[goalId] ?? 0) + value

		const loggedDays = dailyLog[goalId] ?? []
		if (!loggedDays.includes(today)) {
			dailyLog[goalId] = [...loggedDays, today]
		}
	}

	const goalsCompleted = goals.filter(
		(g) => (current[g.id] ?? 0) >= g.target,
	).length
	const isComplete = goalsCompleted >= goals.length

	const updates: Partial<typeof userChallenges.$inferInsert> = {
		completedTasks: current,
		dailyLog,
	}
	if (isComplete) updates.completedAt = new Date()

	await db
		.update(userChallenges)
		.set(updates)
		.where(eq(userChallenges.id, userChallenge.id))

	let newBadges: Awaited<ReturnType<typeof checkAndAward>> = []
	let gymXpAwarded = 0
	let cosmeticAwarded: string | null = null
	let rewardAwarded: string | null = null

	if (isComplete) {
		const [{ value: totalCompleted }] = await db
			.select({ value: count() })
			.from(userChallenges)
			.where(and(eq(userChallenges.userId, userId)))

		newBadges = await checkAndAward(
			userId,
			{ type: "challenge_complete", totalCompleted },
			db,
		)
		await shareBadges(userId, newBadges, db)
		await shareChallengeCompletion(db, userId, {
			challengeName: challenge.title,
			tier: userChallenge.tier,
			reward: rewardOf(challenge.rewardCosmetic)?.name,
		})

		gymXpAwarded = 200
		await awardGymXp(userId, gymXpAwarded, "challenge_complete", db)
		// the first finished challenge puts a trophy in the gym's inventory
		cosmeticAwarded = await grantCosmetic(
			db,
			(await getOrCreateGym(userId, db)).id,
			"challenge_trophy",
			`challenge:${userChallenge.challengeId}`,
		)
		// a curated challenge also gives its own decor
		if (challenge.rewardCosmetic)
			rewardAwarded = await grantCosmetic(
				db,
				(await getOrCreateGym(userId, db)).id,
				challenge.rewardCosmetic,
				`challenge:${userChallenge.challengeId}`,
			)
	}

	const milestonesPaid = await payChallengeMilestones(
		db,
		userId,
		challengeId,
		challengeFraction(goals, current),
		userChallenge.tier,
	)

	return {
		ok: true,
		body: {
			progress: current,
			dailyLog,
			milestonesPaid,
			goalsCompleted,
			totalGoals: goals.length,
			overallProgress:
				goals.length > 0
					? Math.round((goalsCompleted / goals.length) * 100)
					: 0,
			completed: isComplete,
			newBadges,
			gymXpAwarded: isComplete ? gymXpAwarded : 0,
			cosmeticAwarded,
			rewardAwarded,
		},
	}
}

/** Something the app can count on its own (a great-rated meal photo, a
 * check-in): adds `amount` to every goal of this month's joined, unfinished
 * challenge that is marked `auto: kind`. Never throws: it rides on someone
 * else's request. */
export async function bumpAutoGoals(
	db: Db,
	userId: string,
	kind: string,
	amount = 1,
	now = new Date(),
): Promise<void> {
	try {
		const [row] = await db
			.select({
				challengeId: challenges.id,
				tasks: challenges.tasks,
				completedAt: userChallenges.completedAt,
			})
			.from(userChallenges)
			.innerJoin(challenges, eq(userChallenges.challengeId, challenges.id))
			.where(
				and(
					eq(userChallenges.userId, userId),
					eq(challenges.month, now.getUTCMonth() + 1),
					eq(challenges.year, now.getUTCFullYear()),
				),
			)
			.limit(1)
		if (!row || row.completedAt) return
		const delta: Record<string, number> = {}
		for (const g of row.tasks as ChallengeGoal[])
			if (g.auto === kind) delta[g.id] = amount
		if (Object.keys(delta).length === 0) return
		await addChallengeProgress(db, userId, row.challengeId, delta, {
			auto: true,
		})
	} catch (err) {
		console.error("[challenges] auto progress failed:", err)
	}
}
