import { expect, test } from "@playwright/test"
import { mintInviteCode } from "./helpers.js"

// Requires `npm run seed` to have been run at least once (needs the
// dev@slimpals.test account it creates) against the same DATABASE_URL the
// e2e-spawned server will use.

test("register with invite code, logout, and log back in", async ({
	request,
	browser,
}) => {
	const inviteCode = await mintInviteCode(request)

	// A fresh, cookie-less context so the invite-minting session above
	// doesn't leak into the actual UI-driven flow being tested.
	const context = await browser.newContext()
	const freshPage = await context.newPage()

	const uniqueEmail = `e2e-${Date.now()}@slimpals.test`

	await freshPage.goto("/register")
	await expect(
		freshPage.getByRole("heading", { name: "Join SlimPals" }),
	).toBeVisible()

	await freshPage.getByLabel("Name").fill("E2E Test User")
	await freshPage.getByLabel("Email").fill(uniqueEmail)
	await freshPage.getByLabel("Password").fill("E2ePassword1!")
	await freshPage.getByLabel("Invite code").fill(inviteCode)
	await freshPage.getByRole("button", { name: /create account/i }).click()

	await expect(
		freshPage.getByRole("heading", { name: "Dashboard" }),
	).toBeVisible()

	// Sign out lives on the Settings page, not the top-nav — the bottom
	// tab bar (gh-73) replaced the nav that used to have it directly, and
	// avatar-menu/quick-access-to-settings lands in a later slice (gh-75).
	await freshPage.goto("/settings")
	await freshPage.getByRole("button", { name: "Sign out" }).click()
	await expect(freshPage).toHaveURL(/\/login/)
	await expect(
		freshPage.getByRole("heading", { name: "Sign in to SlimPals" }),
	).toBeVisible()

	await freshPage.getByLabel("Email").fill(uniqueEmail)
	await freshPage.getByLabel("Password").fill("E2ePassword1!")
	await freshPage.getByRole("button", { name: "Sign in" }).click()

	await expect(
		freshPage.getByRole("heading", { name: "Dashboard" }),
	).toBeVisible()

	await context.close()
})
