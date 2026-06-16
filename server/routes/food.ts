import { and, desc, eq, gte, lt } from "drizzle-orm"
import { Router } from "express"
import multer from "multer"
import { db } from "../db/index.js"
import { foodLogs } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"
import type { AIService } from "../services/ai/index.js"
import { checkAndAward } from "../services/badges/index.js"
import { awardGymXp } from "../services/gym/index.js"
import { createStorageService } from "../services/storage/index.js"

function startOfDayUtc(d: Date = new Date()): Date {
	const r = new Date(d)
	r.setUTCHours(0, 0, 0, 0)
	return r
}

function computeConsecutiveFoodDays(
	logDates: Date[],
	referenceDay: Date,
): number {
	if (logDates.length === 0) return 0
	const days = new Set(logDates.map((d) => startOfDayUtc(d).getTime()))
	let consecutive = 0
	let day = startOfDayUtc(referenceDay).getTime()
	while (days.has(day)) {
		consecutive++
		day -= 86_400_000
	}
	return consecutive
}

const upload = multer({ storage: multer.memoryStorage() })
const storage = createStorageService()

export function createFoodRouter(aiService: AIService) {
	const router = Router()

	router.get("/food/logs", async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const logs = await db
			.select()
			.from(foodLogs)
			.where(eq(foodLogs.userId, userId))
			.orderBy(desc(foodLogs.loggedAt))

		res.json(
			logs.map((l) => ({
				id: l.id,
				photoUrl: l.photoUrl,
				aiAnalysis: l.aiAnalysis,
				mealType: l.mealType,
				loggedAt: l.loggedAt,
				isShared: l.isShared,
			})),
		)
	})

	router.post("/food/analyze", upload.single("photo"), async (req, res) => {
		if (!req.file) {
			res.status(400).json({ error: "photo is required" })
			return
		}

		const userId = (req as AuthRequest).user.id
		const mealType = (req.body as { mealType?: string }).mealType ?? "snack"

		const photoUrl = await storage.upload(req.file)

		// Build absolute URL for Gemini to fetch the image
		const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
		const absoluteUrl = `${baseUrl}${photoUrl}`

		let analysis: Awaited<ReturnType<typeof aiService.analyzeFood>>
		try {
			analysis = await aiService.analyzeFood(absoluteUrl, userId)
		} catch (err) {
			const msg = err instanceof Error ? err.message : ""
			const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota")
			res.status(502).json({
				error: isQuota
					? "AI quota exceeded — please try again later"
					: "Food analysis failed — please try again",
			})
			return
		}

		const [inserted] = await db
			.insert(foodLogs)
			.values({
				userId,
				photoUrl,
				aiAnalysis: analysis,
				mealType: mealType as "breakfast" | "lunch" | "dinner" | "snack",
			})
			.$returningId()

		const [row] = await db
			.select()
			.from(foodLogs)
			.where(eq(foodLogs.id, inserted.id))

		// Food log badges
		const allLogs = await db
			.select({ loggedAt: foodLogs.loggedAt })
			.from(foodLogs)
			.where(eq(foodLogs.userId, userId))

		const today = new Date()
		const todayStart = startOfDayUtc(today)
		const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)

		const todayLogs = await db
			.select({ mealType: foodLogs.mealType })
			.from(foodLogs)
			.where(
				and(
					eq(foodLogs.userId, userId),
					gte(foodLogs.loggedAt, todayStart),
					lt(foodLogs.loggedAt, tomorrowStart),
				),
			)

		const newBadges = await checkAndAward(
			userId,
			{
				type: "food_log",
				totalLogs: allLogs.length,
				consecutiveDays: computeConsecutiveFoodDays(
					allLogs.map((l) => l.loggedAt),
					today,
				),
				todayMealTypes: todayLogs.map((l) => l.mealType),
			},
			db,
		)

		let gymXp = 5
		for (const _badge of newBadges) {
			gymXp += 10
		}
		await awardGymXp(userId, gymXp, "food_log", db)

		res.status(201).json({
			id: row.id,
			photoUrl: row.photoUrl,
			aiAnalysis: row.aiAnalysis,
			mealType: row.mealType,
			loggedAt: row.loggedAt,
			newBadges,
		})
	})

	return router
}
