import { and, desc, eq, gte, lt } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import { dailyCheckins } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import { checkAndAward } from "../services/badges/index.js"
import { awardGymXp } from "../services/gym/index.js"

export const checkinsRouter = Router()

export function startOfDayUtc(d: Date = new Date()): Date {
	const r = new Date(d)
	r.setUTCHours(0, 0, 0, 0)
	return r
}

function daysBetween(a: Date, b: Date): number {
	return Math.round(
		Math.abs(startOfDayUtc(a).getTime() - startOfDayUtc(b).getTime()) /
			86_400_000,
	)
}

function checkinPayload(row: typeof dailyCheckins.$inferSelect) {
	return {
		id: row.id,
		date: row.date,
		goalsCompleted: row.goalsCompleted,
		mood: row.mood,
		notes: row.notes,
		streakCount: row.streakCount,
	}
}

async function getLastCheckin(userId: string) {
	const [row] = await db
		.select()
		.from(dailyCheckins)
		.where(eq(dailyCheckins.userId, userId))
		.orderBy(desc(dailyCheckins.date))
		.limit(1)
	return row ?? null
}

async function getTodayCheckin(userId: string) {
	const todayStart = startOfDayUtc()
	const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)
	const [row] = await db
		.select()
		.from(dailyCheckins)
		.where(
			and(
				eq(dailyCheckins.userId, userId),
				gte(dailyCheckins.date, todayStart),
				lt(dailyCheckins.date, tomorrowStart),
			),
		)
		.limit(1)
	return row ?? null
}

function calcNewStreak(last: typeof dailyCheckins.$inferSelect | null): number {
	if (!last) return 1
	const daysSince = daysBetween(last.date, new Date())
	if (daysSince <= 2) return last.streakCount + 1
	return 1
}

checkinsRouter.get("/checkins/today", async (req, res) => {
	const userId = (req as AuthRequest).user.id

	const todayCheckin = await getTodayCheckin(userId)
	if (todayCheckin) {
		res.json({ checkedInToday: true, streakCount: todayCheckin.streakCount })
		return
	}

	const last = await getLastCheckin(userId)
	if (!last) {
		res.json({ checkedInToday: false, streakCount: 0 })
		return
	}

	const daysSince = daysBetween(last.date, new Date())
	const streakCount = daysSince <= 2 ? last.streakCount : 0
	res.json({ checkedInToday: false, streakCount })
})

checkinsRouter.post("/checkins", async (req, res) => {
	const userId = (req as AuthRequest).user.id
	const { mood, notes, goalsCompleted } = req.body as {
		mood?: string
		notes?: string
		goalsCompleted?: unknown
	}

	const existing = await getTodayCheckin(userId)
	if (existing) {
		res.status(200).json(checkinPayload(existing))
		return
	}

	const last = await getLastCheckin(userId)
	const streakCount = calcNewStreak(last)

	const [inserted] = await db
		.insert(dailyCheckins)
		.values({
			userId,
			date: startOfDayUtc(),
			streakCount,
			mood: mood ?? null,
			notes: notes ?? null,
			goalsCompleted: goalsCompleted ?? null,
		})
		.$returningId()

	const [row] = await db
		.select()
		.from(dailyCheckins)
		.where(eq(dailyCheckins.id, inserted.id))

	const newBadges = await checkAndAward(
		userId,
		{ type: "checkin", streakCount },
		db,
	)

	let gymXp = 15
	for (const _badge of newBadges) {
		gymXp += 10
	}
	await awardGymXp(userId, gymXp, "checkin", db)

	res.status(201).json({ ...checkinPayload(row), newBadges })
})

export async function ensureCheckin(userId: string): Promise<void> {
	const existing = await getTodayCheckin(userId)
	if (existing) return

	const last = await getLastCheckin(userId)
	const streakCount = calcNewStreak(last)

	await db.insert(dailyCheckins).values({
		userId,
		date: startOfDayUtc(),
		streakCount,
		goalsCompleted: null,
		mood: null,
		notes: null,
	})
}
