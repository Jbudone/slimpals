import { expect, test } from "@playwright/test"

// Requires `npm run seed` to have been run at least once (needs the
// dev@slimpals.test account it creates) against the same DATABASE_URL the
// e2e-spawned server will use.
const SEEDED_EMAIL = "dev@slimpals.test"
const SEEDED_PASSWORD = "DevPass1!"

async function createInviteCode(
	request: import("@playwright/test").APIRequestContext,
): Promise<string> {
	const signIn = await request.post("/api/auth/sign-in/email", {
		data: { email: SEEDED_EMAIL, password: SEEDED_PASSWORD },
	})
	if (!signIn.ok()) {
		throw new Error(
			`Could not sign in as ${SEEDED_EMAIL} to mint an invite code — run \`npm run seed\` first. Status: ${signIn.status()}`,
		)
	}

	const invite = await request.post("/api/invites")
	expect(invite.ok()).toBeTruthy()
	const body = await invite.json()
	return body.code as string
}

test("register with invite code, logout, and log back in", async ({
	request,
	browser,
}) => {
	const inviteCode = await createInviteCode(request)

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
