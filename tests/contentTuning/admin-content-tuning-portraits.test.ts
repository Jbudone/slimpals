import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { invites, users } from "../../server/db/schema.js"
import type { AIService } from "../../server/services/ai/index.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const PREVIEW_DIR = join(
	process.cwd(),
	"public/assets/gym/portraits/_tuning-preview",
)

const stubAI: AIService = {
	analyzeFood: async () => ({
		foodName: "Test Food",
		macros: { calories: 200, protein: 10, carbs: 20, fat: 8 },
		coachMessage: "Good job!",
		alternatives: [],
		rating: 7,
	}),
	generateVictoryMessage: async () => "Victory!",
	generateWeeklyInspiration: async () => "Inspiration!",
	generateMonthlyChallenge: async () => ({
		title: "Challenge",
		description: "desc",
		theme: "wellness",
		goals: [],
	}),
	generateWeeklySprint: async () => ({ title: "Sprint", tasks: [] }),
	generateNpcDialogs: async () => [],
	generateGymEvent: async () => ({
		type: "class",
		title: "Event",
		description: "desc",
		npcKey: null,
		activeHours: [7, 9],
		effects: {},
	}),
	generateNpcPortrait: async (_prompt, outputPath) => {
		const { mkdir, writeFile } = await import("node:fs/promises")
		const { dirname } = await import("node:path")
		await mkdir(dirname(outputPath), { recursive: true })
		await writeFile(outputPath, Buffer.from("fake-png-bytes"))
		return outputPath
	},
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
	const inviteCode = `CT-PORTRAIT-INVITE-${++inviteCounter}`
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
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

afterAll(async () => {
	if (existsSync(PREVIEW_DIR)) rmSync(PREVIEW_DIR, { recursive: true })
	await closeTestDb()
})

describe("POST /api/admin/content-tuning/npc_portraits/default/generate", () => {
	it("writes a preview file and returns a servable, cache-busted URL", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-portrait-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.post("/api/admin/content-tuning/npc_portraits/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { npcPreset: "trainer", stage: "3" } })

		expect(res.status).toBe(200)
		expect(res.body.sample).toMatch(
			/^\/assets\/gym\/portraits\/_tuning-preview\/trainer-stage3\.png\?v=\d+$/,
		)
		expect(existsSync(join(PREVIEW_DIR, "trainer-stage3.png"))).toBe(true)
	})

	it("overwrites the same file on a second generate rather than accumulating", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-portrait-gen2@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		await request(app)
			.post("/api/admin/content-tuning/npc_portraits/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { npcPreset: "receptionist", stage: "2" } })
		await request(app)
			.post("/api/admin/content-tuning/npc_portraits/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { npcPreset: "receptionist", stage: "2" } })

		const { readdirSync } = await import("node:fs")
		const files = readdirSync(PREVIEW_DIR).filter((f) =>
			f.startsWith("receptionist-stage2"),
		)
		expect(files).toEqual(["receptionist-stage2.png"])
	})
})
