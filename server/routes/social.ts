import { and, count, desc, eq, inArray } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	badges,
	foodLogs,
	reactions,
	socialPosts,
	userBadges,
	users,
} from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { checkAndAward, type NewBadge } from "../services/badges/index.js"

export const socialRouter = Router()

/** Mirrors the auto-share-on-badge pattern in checkins.ts/weight.ts/food.ts,
 * for badges earned through a reaction (either side of it). */
async function autoShareBadges(
	userId: string,
	newBadges: NewBadge[],
): Promise<void> {
	if (newBadges.length === 0) return

	const [user] = await db
		.select({ autoShareBadges: users.autoShareBadges })
		.from(users)
		.where(eq(users.id, userId))

	if (!user?.autoShareBadges) return

	for (const badge of newBadges) {
		await db.insert(socialPosts).values({
			userId,
			type: "milestone",
			content: {
				badgeKey: badge.key,
				badgeName: badge.name,
				badgeTier: badge.tier,
			},
		})
	}
}

const VALID_EMOJIS = ["❤️", "😂", "💪", "🔥", "😭"] as const
type Emoji = (typeof VALID_EMOJIS)[number]

function emptyReactions(): Record<
	Emoji,
	{ count: number; userReacted: boolean }
> {
	return Object.fromEntries(
		VALID_EMOJIS.map((e) => [e, { count: 0, userReacted: false }]),
	) as Record<Emoji, { count: number; userReacted: boolean }>
}

function buildReactions(
	postReactions: (typeof reactions.$inferSelect)[],
	userId: string,
): Record<Emoji, { count: number; userReacted: boolean }> {
	const result = emptyReactions()
	for (const r of postReactions) {
		const emoji = r.emoji as Emoji
		result[emoji].count++
		if (r.userId === userId) result[emoji].userReacted = true
	}
	return result
}

socialRouter.get("/social/feed", async (req, res) => {
	const userId = (req as AuthRequest).user.id

	const posts = await db
		.select({
			id: socialPosts.id,
			userId: socialPosts.userId,
			userName: users.name,
			type: socialPosts.type,
			content: socialPosts.content,
			createdAt: socialPosts.createdAt,
		})
		.from(socialPosts)
		.innerJoin(users, eq(socialPosts.userId, users.id))
		.orderBy(desc(socialPosts.createdAt))

	if (posts.length === 0) {
		res.json([])
		return
	}

	const postIds = posts.map((p) => p.id)
	const allReactions = await db
		.select()
		.from(reactions)
		.where(inArray(reactions.postId, postIds))

	const reactionsByPost = new Map<number, (typeof reactions.$inferSelect)[]>()
	for (const r of allReactions) {
		const list = reactionsByPost.get(r.postId) ?? []
		list.push(r)
		reactionsByPost.set(r.postId, list)
	}

	res.json(
		posts.map((p) => ({
			...p,
			reactions: buildReactions(reactionsByPost.get(p.id) ?? [], userId),
		})),
	)
})

socialRouter.post("/social/react", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const { postId, emoji } = req.body as { postId?: number; emoji?: string }

	if (!emoji || !(VALID_EMOJIS as readonly string[]).includes(emoji)) {
		res.status(400).json({ error: "emoji must be one of ❤️ 😂 💪 🔥 😭" })
		return
	}

	const [post] = await db
		.select({ id: socialPosts.id, userId: socialPosts.userId })
		.from(socialPosts)
		.where(eq(socialPosts.id, postId ?? -1))
		.limit(1)

	if (!post) {
		res.status(404).json({ error: "Post not found" })
		return
	}

	const [existing] = await db
		.select()
		.from(reactions)
		.where(
			and(
				eq(reactions.postId, post.id),
				eq(reactions.userId, userId),
				eq(reactions.emoji, emoji as Emoji),
			),
		)
		.limit(1)

	const wasExisting = !!existing
	if (existing) {
		await db.delete(reactions).where(eq(reactions.id, existing.id))
	} else {
		await db
			.insert(reactions)
			.values({ postId: post.id, userId, emoji: emoji as Emoji })
	}

	const postReactions = await db
		.select()
		.from(reactions)
		.where(eq(reactions.postId, post.id))

	// Badge checks (fire-and-forget shape; errors are non-fatal)
	const newBadges = []
	if (!wasExisting) {
		// Reactor earned a "react given" badge
		const [{ value: totalGiven }] = await db
			.select({ value: count() })
			.from(reactions)
			.where(eq(reactions.userId, userId))
		const reactorBadges = await checkAndAward(
			userId,
			{ type: "social_react_given", totalGiven },
			db,
		)
		newBadges.push(...reactorBadges)
		await autoShareBadges(userId, reactorBadges)

		// Post owner earns a "reaction received" badge
		const postOwnerId = post.userId
		if (postOwnerId !== userId) {
			const reactionsOnPost = postReactions.length
			const ownerBadges = await checkAndAward(
				postOwnerId,
				{ type: "social_reaction_received", reactionsOnPost },
				db,
			)
			await autoShareBadges(postOwnerId, ownerBadges)
		}
	}

	res.json({ reactions: buildReactions(postReactions, userId), newBadges })
})

socialRouter.post("/social/share", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const { source_type, source_id } = req.body as {
		source_type?: string
		source_id?: number
	}

	if (!source_type || !source_id) {
		res.status(400).json({ error: "source_type and source_id are required" })
		return
	}

	if (source_type === "food_log") {
		const [log] = await db
			.select()
			.from(foodLogs)
			.where(and(eq(foodLogs.id, source_id), eq(foodLogs.userId, userId)))
			.limit(1)

		if (!log) {
			res.status(404).json({ error: "Food log not found" })
			return
		}

		const [post] = await db
			.insert(socialPosts)
			.values({
				userId,
				type: "food_photo",
				content: {
					foodLogId: log.id,
					photoUrl: log.photoUrl,
					foodName:
						(log.aiAnalysis as { foodName?: string } | null)?.foodName ??
						"Food",
					mealType: log.mealType,
				},
			})
			.$returningId()

		res.status(201).json({ postId: post.id })
		return
	}

	if (source_type === "badge") {
		const [ub] = await db
			.select({
				badgeId: userBadges.badgeId,
				key: badges.key,
				name: badges.name,
				tier: badges.tier,
			})
			.from(userBadges)
			.innerJoin(badges, eq(userBadges.badgeId, badges.id))
			.where(and(eq(userBadges.id, source_id), eq(userBadges.userId, userId)))
			.limit(1)

		if (!ub) {
			res.status(404).json({ error: "Badge not found" })
			return
		}

		const [post] = await db
			.insert(socialPosts)
			.values({
				userId,
				type: "milestone",
				content: {
					badgeKey: ub.key,
					badgeName: ub.name,
					badgeTier: ub.tier,
				},
			})
			.$returningId()

		res.status(201).json({ postId: post.id })
		return
	}

	res
		.status(400)
		.json({ error: "Invalid source_type. Must be food_log or badge" })
})
