// The cron-style generation endpoints skip session auth (OPEN_ROUTES) and
// spend AI credits, so every one of them must demand X-Cron-Secret and fail
// closed when CRON_SECRET is not configured (gh-122).
import request from "supertest"
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest"
import { users } from "../../server/db/schema.js"
import { hasValidCronSecret } from "../../server/middleware/requireCronSecret.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

let aiCalls: string[] = []

const stubAI = {
	generateMonthlyChallenge: async () => {
		aiCalls.push("challenge")
		return {
			title: "Stub Challenge",
			description: "stub",
			theme: "wellness",
			goals: [],
		}
	},
	generateWeeklySprint: async () => {
		aiCalls.push("sprint")
		return { title: "Stub Sprint", tasks: [] }
	},
	generateWeeklyInspiration: async () => {
		aiCalls.push("inspiration")
		return "Keep going!"
	},
	generateNpcDialogs: async () => {
		aiCalls.push("dialog")
		return []
	},
	generateGymEvent: async () => {
		aiCalls.push("event")
		throw new Error("no events in this test")
	},
	generateNpcPortrait: async () => null,
	generateVictoryMessage: async () => "won",
} as unknown as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

const SECRET = "s3cret-for-tests"
const ENDPOINTS = [
	"/api/challenges/generate",
	"/api/sprints/generate",
	"/api/inspiration/generate",
	"/api/gym/cron/generate-content",
]

const savedSecret = process.env.CRON_SECRET

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	const db = await getTestDb()
	await db
		.insert(users)
		.values({ id: "cron-user-1", email: "cron1@sp.test", name: "Cron One" })
	aiCalls = []
	process.env.CRON_SECRET = SECRET
})

afterEach(() => {
	if (savedSecret === undefined) delete process.env.CRON_SECRET
	else process.env.CRON_SECRET = savedSecret
})

afterAll(async () => {
	await closeTestDb()
})

describe("hasValidCronSecret", () => {
	const req = (value?: string) => ({
		headers: value === undefined ? {} : { "x-cron-secret": value },
	})

	it("rejects a missing header", () => {
		expect(hasValidCronSecret(req(), "abc")).toBe(false)
	})

	it("rejects a wrong secret (including a prefix of the right one)", () => {
		expect(hasValidCronSecret(req("abd"), "abc")).toBe(false)
		expect(hasValidCronSecret(req("ab"), "abc")).toBe(false)
		expect(hasValidCronSecret(req(""), "abc")).toBe(false)
	})

	it("accepts the right secret", () => {
		expect(hasValidCronSecret(req("abc"), "abc")).toBe(true)
	})

	it("fails closed when no secret is configured", () => {
		expect(hasValidCronSecret(req("anything"), undefined)).toBe(false)
		expect(hasValidCronSecret(req(""), "")).toBe(false)
	})
})

describe.each(ENDPOINTS)("POST %s", (path) => {
	it("401 without the X-Cron-Secret header", async () => {
		const res = await request(app).post(path)
		expect(res.status).toBe(401)
		expect(aiCalls).toEqual([])
	})

	it("401 with a wrong secret", async () => {
		const res = await request(app).post(path).set("x-cron-secret", "nope")
		expect(res.status).toBe(401)
		expect(aiCalls).toEqual([])
	})

	it("401 when CRON_SECRET is unset, whatever the header says", async () => {
		delete process.env.CRON_SECRET
		const res = await request(app).post(path).set("x-cron-secret", "")
		expect(res.status).toBe(401)
		const res2 = await request(app).post(path).set("x-cron-secret", "undefined")
		expect(res2.status).toBe(401)
		expect(aiCalls).toEqual([])
	})

	it("runs with the right secret and no session", async () => {
		const res = await request(app).post(path).set("x-cron-secret", SECRET)
		expect([200, 201]).toContain(res.status)
	})
})
