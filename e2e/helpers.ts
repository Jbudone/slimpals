import { type APIRequestContext, expect, type Page } from "@playwright/test"

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

/** The element is on screen above the tab bar and nothing covers it (its
 * middle and near its bottom corners, clear of the rounding, hit the element itself). */
export async function expectUncovered(page: Page, testId: string) {
	await page.waitForTimeout(500) // sheet and drawer transitions settle
	const res = await page.evaluate((id) => {
		const el = document.querySelector(`[data-testid="${id}"]`)
		if (!el) return "missing"
		const r = el.getBoundingClientRect()
		const tab = document.querySelector("[data-testid=tab-gym]")
		const tabTop = tab
			? (tab.closest("nav") ?? tab).getBoundingClientRect().top
			: innerHeight
		if (r.top < 0 || r.bottom > tabTop + 0.5)
			return `off screen: ${r.top}..${r.bottom}, tab bar at ${tabTop}`
		const pts: [number, number][] = [
			[r.left + r.width / 2, r.top + r.height / 2],
			[r.left + 14, r.bottom - 4],
			[r.right - 14, r.bottom - 4],
		]
		for (const [x, y] of pts) {
			const hit = document.elementFromPoint(x, y)
			if (!hit || !(hit === el || el.contains(hit)))
				return `covered at ${Math.round(x)},${Math.round(y)} by ${hit?.className}`
		}
		return "ok"
	}, testId)
	expect(res).toBe("ok")
}

/** Two on-screen boxes do not overlap (the coach's bubble vs a job card).
 * Both are read in one go, as soon as both are there. */
export async function expectNoOverlap(page: Page, a: string, b: string) {
	await expect
		.poll(() =>
			page.evaluate(
				([a, b]) => {
					const ea = document.querySelector(a)
					const eb = document.querySelector(b)
					if (!ea || !eb) return `missing ${ea ? b : a}`
					const ra = ea.getBoundingClientRect()
					const rb = eb.getBoundingClientRect()
					const hit =
						ra.left < rb.right &&
						rb.left < ra.right &&
						ra.top < rb.bottom &&
						rb.top < ra.bottom
					return hit
						? `overlap ${a} ${ra.top}..${ra.bottom} vs ${b} ${rb.top}..${rb.bottom}`
						: "ok"
				},
				[a, b],
			),
		)
		.toBe("ok")
}
