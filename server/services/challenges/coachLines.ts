import type { MySql2Database } from "drizzle-orm/mysql2"
import { cleanCoachLines } from "../../../shared/challenges/coachDays.js"
import type * as schema from "../../db/schema.js"
import { challengeCoachLines } from "../../db/schema.js"
import type { AIService } from "../ai/index.js"

type Db = MySql2Database<typeof schema>

/** Asks the AI for a coach line per day of the challenge and stores the ones
 * that pass the coach rules. Returns how many days got a line; 0 when the AI
 * has no such method or fails (the scripted lines cover every day anyway). */
export async function storeChallengeCoachLines(
	db: Db,
	ai: AIService,
	p: {
		userChallengeId: number
		personality: string
		title: string
		days: number
	},
): Promise<number> {
	if (!ai.generateChallengeCoachLines) return 0
	let raw: unknown
	try {
		raw = await ai.generateChallengeCoachLines(p.personality, p.title, p.days)
	} catch (err) {
		console.error("[challenges] coach lines failed, using the scripts:", err)
		return 0
	}
	const rows = cleanCoachLines(raw, p.days).flatMap((line, i) =>
		line ? [{ userChallengeId: p.userChallengeId, day: i + 1, line }] : [],
	)
	if (rows.length === 0) return 0
	await db.insert(challengeCoachLines).ignore().values(rows)
	return rows.length
}
