import { expect, test } from "@playwright/test"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

// What changed is told once: a "What's new" card, then never again until
// there is something newer.
test("the What's new card shows once and stays away after Got it", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(90_000)
	const use = testInfo.project.use
	const inviteCode = await mintInviteCode(request)
	const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `News ${id}`,
		email: `e2e-news-${id}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const context = await browser.newContext({
		baseURL: use.baseURL ?? AUTH_ORIGIN,
		viewport: use.viewport,
		storageState: await request.storageState(),
	})
	const page = await context.newPage()
	await page.goto("/challenges?news=1")
	const card = page.getByTestId("whats-new")
	await expect(card).toBeVisible({ timeout: 15_000 })
	await expect(card).toContainText("What's new")
	await page.getByTestId("whats-new-ok").click()
	await expect(card).toHaveCount(0)
	await page.reload()
	await page.waitForTimeout(4500)
	await expect(page.getByTestId("whats-new")).toHaveCount(0)
	await context.close()
})
