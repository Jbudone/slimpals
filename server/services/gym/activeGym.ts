import { and, eq, isNull } from "drizzle-orm"
import { userGyms } from "../../db/schema.js"

/** Matches the gym a user is playing now: their latest campaign, not the
 * archived ones in their Hall of fame (#188). */
export const activeGymOf = (userId: string) =>
	and(eq(userGyms.userId, userId), isNull(userGyms.archivedAt))
