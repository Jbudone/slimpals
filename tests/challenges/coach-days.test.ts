import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	challengeCoachLines,
	challenges,
	invites,
	userChallenges,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import { cleanCoachLines } from "../../shared/challenges/coachDays.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

describe("cleanCoachLines", () => {
	it("keeps good lines by day and drops the rest", () => {
		const out = cleanCoachLines(
			[
				"Day one. Easy does it, small steps count.",
				"",
				42,
				"Mind the scale today, champ.",
				"x",
				"A solid middle stretch. Keep your rhythm going.",
			],
			6,
		)
		expect(out).toEqual([
			"Day one. Easy does it, small steps count.",
			null,
			null,
			null, // body talk is not allowed
			null, // too short
			"A solid middle stretch. Keep your rhythm going.",
		])
	})

	it("always returns one slot per day, whatever the AI sent", () => {
		expect(cleanCoachLines("nope", 3)).toEqual([null, null, null])
		expect(cleanCoachLines(["A fine long enough line here."], 3)).toHaveLength(
			3,
		)
		expect(
			cleanCoachLines(new Array(40).fill("A decent line for the day."), 5),
		).toHaveLength(5)
		expect(cleanCoachLines(["y".repeat(300)], 1)).toEqual([null])
	})
})

const lines = (n: number) =>
	Array.from(
		{ length: n },
		(_, i) => `Day ${i + 1}: keep showing up, you are doing well.`,
	)

let aiCalls: { personality: string; title: string; days: number }[] = []
const stubAI = {
	generateChallengeCoachLines: async (
		personality: string,
		title: string,
		days: number,
	) => {
		aiCalls.push({ personality, title, days })
		return lines(days)
	},
} as unknown as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })
const failingApp = createApp({
	aiService: {
		generateChallengeCoachLines: async () => {
			throw new Error("down")
		},
	} as unknown as AIService,
})

let inviteN = 0
async function login(a = app) {
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "admin-001", email: "adm@x.test", name: "A" })
		.onDuplicateKeyUpdate({ set: { name: "A" } })
	const code = `COACHDAYS-${++inviteN}`
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
	const res = await request(a)
		.post("/api/auth/sign-up/email")
		.send({
			name: "Joiner",
			email: `joiner${inviteN}@slimpals.test`,
			password: "Password1!",
			inviteCode: code,
		})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
}

async function seedThisMonth() {
	const db = await getTestDb()
	const now = new Date()
	await db.insert(challenges).values({
		title: "Coach Days",
		description: "d",
		month: now.getUTCMonth() + 1,
		year: now.getUTCFullYear(),
		theme: "wellness",
		tasks: [
			{
				id: "goal_1",
				title: "G",
				description: "d",
				target: 10,
				unit: "x",
				dailyAmount: 1,
				dailyPrompt: "Did you?",
			},
		],
	})
	const [c] = await db
		.select()
		.from(challenges)
		.where(eq(challenges.title, "Coach Days"))
	return c
}

async function waitForLines(userChallengeId: number, n: number) {
	const db = await getTestDb()
	for (let i = 0; i < 40; i++) {
		const rows = await db
			.select()
			.from(challengeCoachLines)
			.where(eq(challengeCoachLines.userChallengeId, userChallengeId))
		if (rows.length >= n) return rows
		await new Promise((r) => setTimeout(r, 50))
	}
	return []
}

beforeAll(async () => {
	await resetSchema()
})
beforeEach(async () => {
	await truncateAll()
	aiCalls = []
})
afterAll(async () => {
	await closeTestDb()
})

describe("per-day coach lines on joining a challenge", () => {
	it("stores a line per day in the player's voice and shows today's", async () => {
		const cookie = await login()
		const c = await seedThisMonth()
		const join = await request(app)
			.post(`/api/challenges/${c.id}/join`)
			.set("Cookie", cookie)
		expect(join.status).toBe(201)
		const [uc] = await (await getTestDb()).select().from(userChallenges)
		const days = new Date(Date.UTC(c.year, c.month, 0)).getUTCDate()
		const rows = await waitForLines(uc.id, days)
		expect(rows).toHaveLength(days)
		expect(aiCalls[0]).toMatchObject({ title: "Coach Days", days })
		const today = new Date().getUTCDate()
		const cur = await request(app)
			.get("/api/challenges/current")
			.set("Cookie", cookie)
		expect(cur.body.coachToday).toBe(
			`Day ${today}: keep showing up, you are doing well.`,
		)
	})

	it("joins fine and shows no written line when the AI is down", async () => {
		const cookie = await login(failingApp)
		const c = await seedThisMonth()
		const join = await request(failingApp)
			.post(`/api/challenges/${c.id}/join`)
			.set("Cookie", cookie)
		expect(join.status).toBe(201)
		await new Promise((r) => setTimeout(r, 200))
		const cur = await request(failingApp)
			.get("/api/challenges/current")
			.set("Cookie", cookie)
		expect(cur.body.joined).toBe(true)
		expect(cur.body.coachToday).toBeNull()
	})

	it("is removed with the player's challenge (admin reset keeps working)", async () => {
		const cookie = await login()
		const c = await seedThisMonth()
		await request(app)
			.post(`/api/challenges/${c.id}/join`)
			.set("Cookie", cookie)
		const db = await getTestDb()
		const [uc] = await db.select().from(userChallenges)
		await waitForLines(uc.id, 1)
		await db.delete(userChallenges).where(eq(userChallenges.id, uc.id))
		expect(await db.select().from(challengeCoachLines)).toHaveLength(0)
	})
})
