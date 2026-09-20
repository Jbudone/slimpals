import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
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
import { invites, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const FRIENDLY_MD_PATH = join(
	process.cwd(),
	"server/services/ai/prompts/friendly.md",
)
let originalFriendlyDoc: string

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async (userName) => `Congrats ${userName}!`,
	generateWeeklyInspiration: async (userName) => `Great week ${userName}!`,
	generateMonthlyChallenge: async (month, year) => ({
		title: `Test Challenge ${month}/${year}`,
		description: "A test challenge",
		theme: "wellness",
		goals: [],
	}),
	generateNpcDialogs: async () => [],
	generateCoachSample: async (_systemInstruction, scenarioText) =>
		`response to: ${scenarioText}`,
	refineTuningDoc: async ({ currentDoc }) => ({
		updatedDoc: `${currentDoc}\n(refined for revert test)`,
		changelog: "Test refinement applied",
	}),
} as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
}

async function createInvite(code: string) {
	const db = await getTestDb()
	await db.insert(invites).values({
		code,
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

let inviteCounter = 0

async function registerAndLogin(email: string, name: string) {
	const inviteCode = `CT-RV-INVITE-${++inviteCounter}`
	await createInvite(inviteCode)
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode,
	})
	const cookies = res.headers["set-cookie"] as string[]
	const userId = res.body.user.id as string
	return {
		cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies,
		userId,
	}
}

async function makeAdmin(userId: string) {
	const db = await getTestDb()
	await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId))
}

beforeAll(async () => {
	await resetSchema()
	originalFriendlyDoc = readFileSync(FRIENDLY_MD_PATH, "utf-8")
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

afterEach(() => {
	writeFileSync(FRIENDLY_MD_PATH, originalFriendlyDoc, "utf-8")
})

afterAll(async () => {
	writeFileSync(FRIENDLY_MD_PATH, originalFriendlyDoc, "utf-8")
	await closeTestDb()
})

describe("POST /api/admin/content-tuning/:type/:subcategory/revert/:feedbackId", () => {
	it("restores the doc to its state before the given feedback entry", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-revert@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const before = readFileSync(FRIENDLY_MD_PATH, "utf-8")

		const feedbackRes = await request(app)
			.post("/api/admin/content-tuning/coach_personality/friendly/feedback")
			.set("Cookie", cookie)
			.send({
				contextParams: { scenario: "healthy_salad" },
				sample: "Nice work!",
				tags: ["Perfect"],
				note: null,
				noteScope: "sample",
			})
		expect(feedbackRes.status).toBe(200)
		expect(readFileSync(FRIENDLY_MD_PATH, "utf-8")).not.toBe(before)

		const historyRes = await request(app)
			.get("/api/admin/content-tuning/coach_personality/friendly/history")
			.set("Cookie", cookie)
		expect(historyRes.status).toBe(200)
		const feedbackId = historyRes.body[0].id as number

		const revertRes = await request(app)
			.post(
				`/api/admin/content-tuning/coach_personality/friendly/revert/${feedbackId}`,
			)
			.set("Cookie", cookie)
		expect(revertRes.status).toBe(200)
		expect(revertRes.body.doc).toBe(before.trim())

		const docRes = await request(app)
			.get("/api/admin/content-tuning/coach_personality/friendly/tuning-doc")
			.set("Cookie", cookie)
		expect(docRes.body.doc).toBe(before.trim())
		expect(readFileSync(FRIENDLY_MD_PATH, "utf-8").trim()).toBe(before.trim())
	})

	it("returns 404 for an unknown feedback id", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-revert-404@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post(
				"/api/admin/content-tuning/coach_personality/friendly/revert/999999",
			)
			.set("Cookie", cookie)
		expect(res.status).toBe(404)
	})
})
