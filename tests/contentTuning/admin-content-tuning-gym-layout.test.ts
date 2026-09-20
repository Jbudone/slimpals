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
	generateGymLayout: async (prompt) => {
		// Echo back one grid position per item key mentioned in the prompt,
		// so the test can assert the catalog was actually threaded through.
		const keys = [...prompt.matchAll(/^(\S+) \(/gm)].map((m) => m[1])
		const layout: Record<string, { x: number; y: number }> = {}
		keys.forEach((key, i) => {
			layout[key] = { x: i, y: i }
		})
		return layout
	},
} as AIService

const { createApp } = await import("../../server/app.js")
const app = createApp({ aiService: stubAI })

// truncateAll() (called in beforeEach below) already reseeds
// gym_upgrades_catalog via the real seedGymUpgrades() — cardio_treadmill
// is requiredXp: 0 and boxing_ring is requiredXp: 3500 there, which is
// what the assertions below rely on.
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
	const inviteCode = `CT-LAYOUT-INVITE-${++inviteCounter}`
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
	await closeTestDb()
})

describe("POST /api/admin/content-tuning/gym_layout/default/generate", () => {
	it("only includes items unlocked at the requested progression tier", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-layout-gen@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.post("/api/admin/content-tuning/gym_layout/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { levelTier: "early_game" } })

		expect(res.status).toBe(200)
		const parsed = JSON.parse(res.body.sample) as {
			layout: Record<string, { x: number; y: number }>
			items: { key: string; category: string }[]
		}
		const keys = parsed.items.map((i) => i.key)
		expect(keys).toEqual(
			expect.arrayContaining(["cardio_treadmill", "weights_dumbbells"]),
		)
		expect(keys).not.toContain("boxing_ring")
		expect(parsed.layout.cardio_treadmill).toBeDefined()
	})

	it("includes high-requiredXp items at the late-game tier", async () => {
		const { cookie, userId } = await registerAndLogin(
			"admin-layout-gen2@slimpals.test",
			"Admin",
		)
		await makeAdmin(userId)

		const res = await request(app)
			.post("/api/admin/content-tuning/gym_layout/default/generate")
			.set("Cookie", cookie)
			.send({ contextParams: { levelTier: "late_game" } })

		expect(res.status).toBe(200)
		const parsed = JSON.parse(res.body.sample) as {
			items: { key: string }[]
		}
		expect(parsed.items.map((i) => i.key)).toContain("boxing_ring")
	})
})
