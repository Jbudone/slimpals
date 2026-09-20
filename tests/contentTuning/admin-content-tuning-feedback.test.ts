import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { and, eq } from "drizzle-orm"
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
import {
	contentTuningFeedback,
	invites,
	users,
} from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

// This exercises the real filesystem read/write path
// (server/services/contentTuning/fs.ts), so it touches the actual repo
// file — snapshot + restore around every test to avoid corrupting it.
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
		updatedDoc: `${currentDoc}\n(refined for test)`,
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
	const inviteCode = `CT-FB-INVITE-${++inviteCounter}`
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

describe("POST /api/admin/content-tuning/:type/:subcategory/feedback", () => {
	it("returns 400 without a sample", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-fb-400@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)
		const res = await request(app)
			.post("/api/admin/content-tuning/coach_personality/friendly/feedback")
			.set("Cookie", cookie)
			.send({ tags: ["Too soft"] })
		expect(res.status).toBe(400)
	})

	it("ingests feedback, rewrites the doc on disk, records an audit row, and returns a new sample", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-fb@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.post("/api/admin/content-tuning/coach_personality/friendly/feedback")
			.set("Cookie", cookie)
			.send({
				contextParams: { scenario: "healthy_salad" },
				sample: "Great choice, keep it up!",
				tags: ["Too generic"],
				note: "Mention the specific food next time",
				noteScope: "global",
			})

		expect(res.status).toBe(200)
		expect(res.body.updatedDoc).toContain("(refined for test)")
		expect(res.body.changelog).toBeTruthy()
		expect(res.body.newSample).toContain("response to: Grilled chicken salad")

		const onDisk = readFileSync(FRIENDLY_MD_PATH, "utf-8")
		expect(onDisk).toContain("(refined for test)")

		const db = await getTestDb()
		const [row] = await db
			.select()
			.from(contentTuningFeedback)
			.where(
				and(
					eq(contentTuningFeedback.contentType, "coach_personality"),
					eq(contentTuningFeedback.subcategory, "friendly"),
				),
			)
		expect(row).toBeTruthy()
		expect(row.noteScope).toBe("global")
		expect(row.tags).toEqual(["Too generic"])
		expect(row.createdBy).toBe(userId)
		expect(row.tuningDocAfter).toContain("(refined for test)")
	})
})
