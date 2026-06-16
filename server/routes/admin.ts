import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { asc, eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "../db/index.js"
import {
	accounts,
	badges,
	dailyCheckins,
	foodLogs,
	sessions,
	userBadges,
	users,
	weightEntries,
} from "../db/schema.js"
import { requireAdmin } from "../middleware/requireAdmin.js"

export const adminRouter = Router()
adminRouter.use(requireAdmin)

adminRouter.get("/admin/users", async (_req, res) => {
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			isAdmin: users.isAdmin,
			createdAt: users.createdAt,
		})
		.from(users)
		.orderBy(asc(users.createdAt))
	res.json(rows)
})

adminRouter.post("/admin/users", async (req, res) => {
	const {
		name,
		email,
		password = "TestPass1!",
	} = req.body as { name?: string; email?: string; password?: string }

	const ts = Date.now()
	const resolvedEmail = email ?? `test-${ts}@slimpals.test`
	const resolvedName = name ?? `Test User ${ts}`

	const userId = randomUUID()
	const accountId = randomUUID()
	const hashedPassword = await hashPassword(password)

	await db
		.insert(users)
		.values({ id: userId, email: resolvedEmail, name: resolvedName })
	await db.insert(accounts).values({
		id: accountId,
		accountId: userId,
		providerId: "credential",
		userId,
		password: hashedPassword,
	})

	res
		.status(201)
		.json({ id: userId, name: resolvedName, email: resolvedEmail, password })
})

adminRouter.delete("/admin/users/:id", async (req, res) => {
	await db.delete(users).where(eq(users.id, req.params.id))
	res.json({ success: true })
})

adminRouter.post("/admin/impersonate/:id", async (req, res) => {
	const { id } = req.params
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, id))
	if (!user) {
		res.status(404).json({ error: "User not found" })
		return
	}

	const token = randomBytes(32).toString("hex")
	const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-please-change"

	await db.insert(sessions).values({
		id: randomUUID(),
		token,
		userId: id,
		expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	})

	const signature = createHmac("sha256", secret).update(token).digest("base64")
	const cookieValue = encodeURIComponent(`${token}.${signature}`)

	res.setHeader(
		"Set-Cookie",
		`better-auth.session_token=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
	)
	res.json({ success: true })
})

adminRouter.post("/admin/seed/:id/checkins", async (req, res) => {
	const { id } = req.params
	const { days = 7 } = req.body as { days?: number }

	await db.delete(dailyCheckins).where(eq(dailyCheckins.userId, id))

	const now = new Date()
	const inserts = []
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now)
		d.setUTCHours(0, 0, 0, 0)
		d.setUTCDate(d.getUTCDate() - i)
		inserts.push({ userId: id, date: d, streakCount: days - i })
	}
	await db.insert(dailyCheckins).values(inserts)
	res.json({ seeded: days })
})

adminRouter.post("/admin/seed/:id/weight", async (req, res) => {
	const { id } = req.params
	const {
		count = 5,
		startKg = 90,
		endKg = 85,
	} = req.body as { count?: number; startKg?: number; endKg?: number }

	const inserts = []
	for (let i = 0; i < count; i++) {
		const fraction = count === 1 ? 0 : i / (count - 1)
		const weightKg = startKg + (endKg - startKg) * fraction
		const d = new Date()
		d.setUTCDate(d.getUTCDate() - (count - 1 - i))
		inserts.push({
			userId: id,
			weightKg: Math.round(weightKg * 10),
			recordedAt: d,
		})
	}
	await db.insert(weightEntries).values(inserts)
	res.json({ seeded: count })
})

adminRouter.post("/admin/seed/:id/badges", async (req, res) => {
	const { id } = req.params
	const { keys = [] } = req.body as { keys?: string[] }

	if (keys.length === 0) {
		res.json({ awarded: 0 })
		return
	}

	const badgeRows = await db
		.select({ id: badges.id, key: badges.key })
		.from(badges)
	const keyToId = new Map(badgeRows.map((b) => [b.key, b.id]))

	const earned = await db
		.select({ badgeId: userBadges.badgeId })
		.from(userBadges)
		.where(eq(userBadges.userId, id))
	const earnedIds = new Set(earned.map((e) => e.badgeId))

	const toInsert = keys
		.map((k) => keyToId.get(k))
		.filter(
			(badgeId): badgeId is number =>
				badgeId !== undefined && !earnedIds.has(badgeId),
		)
		.map((badgeId) => ({ userId: id, badgeId }))

	if (toInsert.length > 0) {
		await db.insert(userBadges).values(toInsert)
	}
	res.json({ awarded: toInsert.length })
})

adminRouter.post("/admin/seed/:id/food", async (req, res) => {
	const { id } = req.params
	const { count = 3 } = req.body as { count?: number }

	const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const
	const inserts = []
	for (let i = 0; i < count; i++) {
		const d = new Date()
		d.setUTCDate(d.getUTCDate() - (count - 1 - i))
		inserts.push({
			userId: id,
			photoUrl: "/uploads/admin-seed-food.jpg",
			aiAnalysis: {
				foods: ["chicken", "broccoli"],
				macros: { calories: 420, protein: 40, carbs: 28, fat: 14 },
				coachMessage: "Solid macros!",
				alternatives: [],
			},
			mealType: mealTypes[i % mealTypes.length],
			loggedAt: d,
		})
	}
	await db.insert(foodLogs).values(inserts)
	res.json({ seeded: count })
})
