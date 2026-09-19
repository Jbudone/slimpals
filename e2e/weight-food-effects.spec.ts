import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

// Minimal valid 1×1 PNG, same fixture used by tests/food/food.test.ts.
const TINY_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	"base64",
)

async function getGymXp(
	request: import("@playwright/test").APIRequestContext,
): Promise<number> {
	const res = await request.get("/api/gym", {
		headers: { Origin: AUTH_ORIGIN },
	})
	expect(res.ok()).toBeTruthy()
	const body = await res.json()
	return body.gym.xp as number
}

test("logging weight triggers auto-checkin, a badge, and a feed post", async ({
	request,
	browser,
}) => {
	const inviteCode = await mintInviteCode(request)
	const runId = Date.now()
	const uniqueEmail = `e2e-weight-${runId}@slimpals.test`
	const uniqueName = `Weight Effects Tester ${runId}`
	await registerUser(request, {
		name: uniqueName,
		email: uniqueEmail,
		password: "E2ePassword1!",
		inviteCode,
	})

	const xpBefore = await getGymXp(request)

	const storageState = await request.storageState()
	const context = await browser.newContext({ storageState })
	const page = await context.newPage()

	await page.goto("/")
	await expect(page.getByText(/keep the fire going/i)).toBeVisible()

	await page.goto("/weight")
	await page.getByLabel("Weight (kg)", { exact: true }).fill("82.5")
	const today = new Date().toISOString().slice(0, 10)
	await page.getByLabel("Date", { exact: true }).fill(today)
	await page.getByRole("button", { name: "Save", exact: true }).click()

	// The weight route awards the "First Weigh-In" badge and auto-checks-in.
	await page.goto("/badges")
	await expect(
		page.locator(".ui-pill", { hasText: "First Weigh-In" }),
	).toBeVisible()

	await page.goto("/social")
	// Scoped by author name too — the feed is shared across all users, so
	// repeated e2e runs otherwise accumulate multiple matching posts.
	const myPost = page
		.locator(".ui-card", { hasText: uniqueName })
		.filter({ hasText: "First Weigh-In" })
	await expect(myPost).toBeVisible()

	await page.goto("/")
	await expect(page.getByText(/you've checked in today/i)).toBeVisible()

	const xpAfterWeight = await getGymXp(request)
	expect(xpAfterWeight).toBeGreaterThan(xpBefore)

	await context.close()
})

test("logging food awards gym XP and a badge", async ({ request, browser }) => {
	const inviteCode = await mintInviteCode(request)
	const uniqueEmail = `e2e-food-${Date.now()}@slimpals.test`
	await registerUser(request, {
		name: "Food Effects Tester",
		email: uniqueEmail,
		password: "E2ePassword1!",
		inviteCode,
	})

	const xpBefore = await getGymXp(request)

	const storageState = await request.storageState()
	const context = await browser.newContext({ storageState })
	const page = await context.newPage()

	const photoPath = join(tmpdir(), `e2e-meal-${Date.now()}.png`)
	await writeFile(photoPath, TINY_PNG)

	await page.goto("/food")
	await page.locator('input[type="file"]').setInputFiles(photoPath)
	await expect(page.locator(".preview-img")).toBeVisible()

	const analyzeBtn = page.getByRole("button", { name: /analyse meal/i })
	await expect(analyzeBtn).toBeEnabled()
	await analyzeBtn.click()
	await expect(page.getByRole("button", { name: /analysing/i })).toBeVisible()
	await expect(analyzeBtn).toBeVisible({ timeout: 30_000 })

	await page.goto("/badges")
	await expect(
		page.locator(".ui-pill", { hasText: "First Bite" }),
	).toBeVisible()

	const xpAfter = await getGymXp(request)
	expect(xpAfter).toBeGreaterThan(xpBefore)

	await context.close()
})
