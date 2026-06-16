import { and, desc, eq, inArray } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { reactions, socialPosts, users } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

export const socialRouter = Router()

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
		.select({ id: socialPosts.id })
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

	res.json(buildReactions(postReactions, userId))
})
