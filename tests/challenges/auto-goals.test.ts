import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	challenges,
	invites,
	userChallenges,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { bumpAutoGoals } from "../../server/services/challenges/progress.js"
import { validateGeneratedChallenge } from "../../shared/challenges/validate.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const TINY_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
)

let nextRating = 9
const stubAI = {
	analyzeFood: async () => ({
		foodName: "Salad",
		macros: { calories: 300, protein: 10, carbs: 20, fat: 10 },
		coachMessage: "Nice.",
		alternatives: [],
		rating: nextRating,
	}),
} as unknown as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

const goal = (n: number, over: Record<string, unknown> = {}) => ({
	id: `goal_${n}`,
	title: `Goal ${n}`,
	description: "d",
	target: 5,
	unit: "x",
	dailyAmount: 1,
	dailyPrompt: "Did you?",
	...over,
})

describe("auto goals validation", () => {
	it("accepts a known auto kind and rejects an unknown one", () => {
		const base = {
			title: "Green Month",
			description: "d",
			theme: "greens",
		}
		const ok = validateGeneratedChallenge({
			...base,
			goals: [goal(1, { auto: "great_meal" }), goal(2)],
		})
		if (!ok.ok) throw new Error(ok.error)
		expect(ok.challenge.goals[0].auto).toBe("great_meal")
		expect(ok.challenge.goals[1].auto).toBeUndefined()
		const bad = validateGeneratedChallenge({
			...base,
			goals: [goal(1, { auto: "steps_from_space" })],
		})
		expect(bad.ok).toBe(false)
	})
})

let inviteN = 0
async function login() {
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "adm@x.test", name: "A" })
		.onDuplicateKeyUpdate({ set: { name: "A" } })
	const code = `AUTO-${++inviteN}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(app)
		.post("/api/auth/sign-up/email")
		.send({
			name: "Auto",
			email: `auto${inviteN}@slimpals.test`,
			password: "Password1!",
			inviteCode: code,
		})
	const cookies = res.headers["set-cookie"] as string[]
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId: res.body.user.id as string,
	}
}

async function seedAndJoin(cookie: string) {
	const db = await getTestDb()
	const now = new Date()
	await db.insert(challenges).values({
		title: "Auto Month",
		description: "d",
		month: now.getUTCMonth() + 1,
		year: now.getUTCFullYear(),
		theme: "greens",
		tasks: [
			goal(1, { auto: "great_meal" }),
			goal(2, { auto: "checkin" }),
			goal(3),
		],
	})
	const [c] = await db
		.select()
		.from(challenges)
		.where(eq(challenges.title, "Auto Month"))
	await request(app)
		.post(`/api/challenges/${c.id}/join`)
		.set("Cookie", cookie)
		.expect(201)
	return c
}

const progressOf = async (cookie: string) =>
	(await request(app).get("/api/challenges/current").set("Cookie", cookie)).body
		.progress as Record<string, number>

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
	nextRating = 9
})
afterAll(async () => {
	await closeTestDb()
})

describe("auto goals", () => {
	it("ignore the player's own taps and count what the app counts", async () => {
		const { cookie, userId } = await login()
		const c = await seedAndJoin(cookie)
		// tapping an auto goal does nothing, tapping a normal one works
		await request(app)
			.patch(`/api/challenges/${c.id}/progress`)
			.set("Cookie", cookie)
			.send({ dailyProgress: { goal_1: 5, goal_3: 2 } })
			.expect(200)
		expect(await progressOf(cookie)).toEqual({ goal_3: 2 })
		// the app's own bump moves only the matching goals
		const db = await getTestDb()
		await bumpAutoGoals(db, userId, "great_meal", 2)
		expect(await progressOf(cookie)).toEqual({ goal_3: 2, goal_1: 2 })
		await bumpAutoGoals(db, userId, "something_else")
		expect(await progressOf(cookie)).toEqual({ goal_3: 2, goal_1: 2 })
	})

	it("a great-rated meal photo counts, an ordinary one does not", async () => {
		const { cookie } = await login()
		await seedAndJoin(cookie)
		const post = () =>
			request(app)
				.post("/api/food/analyze")
				.set("Cookie", cookie)
				.field("mealType", "lunch")
				.attach("photo", TINY_PNG, "meal.png")
		nextRating = 9
		expect((await post()).status).toBe(201)
		expect((await progressOf(cookie)).goal_1).toBe(1)
		nextRating = 5
		expect((await post()).status).toBe(201)
		expect((await progressOf(cookie)).goal_1).toBe(1)
	})

	it("the daily check-in counts for a check-in goal", async () => {
		const { cookie } = await login()
		await seedAndJoin(cookie)
		await request(app)
			.post("/api/checkins")
			.set("Cookie", cookie)
			.send({})
			.expect(201)
		expect((await progressOf(cookie)).goal_2).toBe(1)
		// a second check-in the same day changes nothing
		await request(app).post("/api/checkins").set("Cookie", cookie).send({})
		expect((await progressOf(cookie)).goal_2).toBe(1)
	})

	it("does nothing without a joined challenge or after it is finished", async () => {
		const { cookie, userId } = await login()
		const db = await getTestDb()
		await bumpAutoGoals(db, userId, "great_meal")
		const c = await seedAndJoin(cookie)
		await db
			.update(userChallenges)
			.set({ completedAt: new Date() })
			.where(eq(userChallenges.challengeId, c.id))
		await bumpAutoGoals(db, userId, "great_meal")
		expect(await progressOf(cookie)).toEqual({})
	})
})
