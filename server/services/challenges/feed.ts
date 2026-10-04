import { eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import { socialPosts, users } from "../../db/schema.js"

type Db = MySql2Database<typeof schema>

/** Posts a finished challenge to the feed for users with auto-share on (the
 * same switch badges use). The tier and decor reward ride along for the card. */
export async function shareChallengeCompletion(
	db: Db,
	userId: string,
	post: { challengeName: string; tier: string; reward?: string | null },
): Promise<boolean> {
	const [user] = await db
		.select({ autoShareBadges: users.autoShareBadges })
		.from(users)
		.where(eq(users.id, userId))
	if (!user?.autoShareBadges) return false
	await db.insert(socialPosts).values({
		userId,
		type: "challenge_completion",
		content: {
			challengeName: post.challengeName,
			tier: post.tier,
			...(post.reward ? { reward: post.reward } : {}),
		},
	})
	return true
}
