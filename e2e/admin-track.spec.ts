import { expect, test } from "@playwright/test"
import { AUTH_ORIGIN } from "./helpers.js"

// Admin authors the reward track: set a theme and a step payout, see the
// effective result, then clear it (the seeded admin account).
test("admin authors this month's reward track and clears it", async ({
	page,
}) => {
	const res = await page.request.post("/api/auth/sign-in/email", {
		headers: { Origin: AUTH_ORIGIN },
		data: { email: "admin@slimpals.test", password: "AdminPass1!" },
	})
	expect(res.ok()).toBe(true)
	await page.goto("/admin")
	const card = page.getByTestId("admin-track-authoring")
	await expect(card).toBeVisible()
	await card.getByTestId("admin-track-theme").fill("E2E Month")
	await card.getByTestId("admin-track-steps").fill('{"1": {"coins": 321}}')
	await card.getByTestId("admin-track-save").click()
	await expect(card).toContainText("Saved.")
	await expect(card).toContainText("Theme: E2E Month")
	await expect(card).toContainText("Step 1 pays 321 coins")
	// bad payouts are refused with the reason
	await card.getByTestId("admin-track-steps").fill('{"1": {"coins": -1}}')
	await card.getByTestId("admin-track-save").click()
	await expect(card).toContainText("coins must be a whole number")
	await card.getByTestId("admin-track-clear").click()
	await expect(card).toContainText("Cleared.")
	await expect(card).toContainText("Step 1 pays 60 coins")
})
