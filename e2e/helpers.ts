import type { APIRequestContext } from "@playwright/test"

// better-auth rejects state-changing requests without an Origin header
// matching its trustedOrigins (CSRF protection) — matches scripts/seed-dev.ts's
// convention. Playwright's APIRequestContext doesn't send one automatically
// for direct API calls (only real browser-driven navigation/fetch does).
export const AUTH_ORIGIN = "http://localhost:5173"

export const SEEDED_EMAIL = "dev@slimpals.test"
export const SEEDED_PASSWORD = "DevPass1!"

/** Signs in as the seeded dev account and mints a fresh invite code. */
export async function mintInviteCode(
	request: APIRequestContext,
): Promise<string> {
	const signIn = await request.post("/api/auth/sign-in/email", {
		headers: { Origin: AUTH_ORIGIN },
		data: { email: SEEDED_EMAIL, password: SEEDED_PASSWORD },
	})
	if (!signIn.ok()) {
		throw new Error(
			`Could not sign in as ${SEEDED_EMAIL} to mint an invite code — run \`npm run seed\` first. Status: ${signIn.status()}`,
		)
	}

	const invite = await request.post("/api/invites", {
		headers: { Origin: AUTH_ORIGIN },
	})
	if (!invite.ok()) {
		throw new Error(
			`Could not create an invite code. Status: ${invite.status()}`,
		)
	}
	const body = await invite.json()
	return body.code as string
}

export async function registerUser(
	request: APIRequestContext,
	params: { name: string; email: string; password: string; inviteCode: string },
): Promise<void> {
	const res = await request.post("/api/auth/sign-up/email", {
		headers: { Origin: AUTH_ORIGIN },
		data: params,
	})
	if (!res.ok()) {
		const body = await res.text()
		throw new Error(
			`Registration failed for ${params.email}. Status: ${res.status()}. Body: ${body}`,
		)
	}
}
