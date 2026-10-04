import { expect, type Page, test } from "@playwright/test"
import { mintInviteCode, registerUser } from "./helpers.js"

// Navigation on a phone: five tabs (Gym, Today, Compete, Progress, Social),
// challenges and tournaments one tap away under Compete, and a sideways swipe
// walks the tabs (and the segments inside Compete and Social).

/** A one-finger swipe from `fromX` to `toX` on the element at `selector`. */
async function swipe(page: Page, selector: string, fromX: number, toX: number) {
	await page.evaluate(
		([sel, a, b]) => {
			const el = document.querySelector(sel as string)
			if (!el) throw new Error(`no ${sel}`)
			const touch = (x: number, y: number) =>
				new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
			const fire = (type: string, x: number, y: number, ends = false) =>
				el.dispatchEvent(
					new TouchEvent(type, {
						bubbles: true,
						cancelable: true,
						touches: ends ? [] : [touch(x, y)],
						changedTouches: [touch(x, y)],
					}),
				)
			fire("touchstart", a as number, 400)
			fire("touchend", b as number, 410, true)
		},
		[selector, fromX, toX] as const,
	)
}

test("navigation: Compete holds challenges and tournaments, and swipes walk the tabs", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(120_000)
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? "http://localhost:5173"
	const inviteCode = await mintInviteCode(request)
	const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `Nav ${runId}`,
		email: `e2e-nav-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const context = await browser.newContext({
		baseURL,
		viewport: use.viewport,
		deviceScaleFactor: use.deviceScaleFactor,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
		userAgent: use.userAgent,
		storageState: await request.storageState(),
	})
	const page = await context.newPage()
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(e.message))

	await page.goto("/today")
	await expect(page.getByRole("heading", { name: "Today" })).toBeVisible()
	// five tabs, Compete among them
	await expect(page.locator("nav[aria-label=Primary] .tab")).toHaveCount(5)

	// ── Rewards: from Today, the month's track and what unlocks next ──
	await page.getByTestId("today-rewards").click()
	await expect(page).toHaveURL(/\/rewards$/)
	await expect(page.getByRole("heading", { name: "Rewards" })).toBeVisible()
	await expect(page.getByTestId("reward-track")).toBeVisible()
	await expect(page.getByTestId("track-node-1")).toBeVisible()
	await expect(page.getByTestId("unlock-track")).toBeVisible()
	// it stays under the Today tab
	await expect(page.getByTestId("tab-today")).toHaveClass(/active/)
	await page.getByTestId("tab-today").click()

	// ── Compete: one tap to the challenge, one more to tournaments ──
	await page.getByTestId("tab-compete").click()
	await expect(page.getByRole("heading", { name: "Compete" })).toBeVisible()
	await expect(page).toHaveURL(/\/challenges$/)
	await page.getByRole("tab", { name: "Tournaments" }).click()
	await expect(page).toHaveURL(/\/tournaments$/)
	await expect(page.getByTestId("tab-compete")).toHaveClass(/active/)

	// ── Social keeps the feed and badges ──
	await page.getByTestId("tab-social").click()
	await expect(page.getByRole("heading", { name: "Social" })).toBeVisible()
	await expect(page.getByRole("tab", { name: "Feed" })).toBeVisible()
	await expect(page.getByRole("tab", { name: "Badges" })).toBeVisible()
	await expect(page.getByRole("tab", { name: "Challenge" })).toHaveCount(0)

	// ── swipes: Today -> Compete (challenges -> tournaments) -> Progress ──
	await page.getByTestId("tab-today").click()
	await expect(page.getByRole("heading", { name: "Today" })).toBeVisible()
	await swipe(page, ".dashboard h1", 320, 110)
	await expect(page).toHaveURL(/\/challenges$/)
	await swipe(page, ".hub-page h1", 320, 110)
	await expect(page).toHaveURL(/\/tournaments$/)
	await swipe(page, ".hub-page h1", 320, 110)
	await expect(page).toHaveURL(/\/weight$/)
	// and back the other way
	await swipe(page, "main h1", 100, 330)
	await expect(page).toHaveURL(/\/challenges$/)
	await swipe(page, ".hub-page h1", 100, 330)
	await expect(page).toHaveURL(/\/today$/)
	await swipe(page, ".dashboard h1", 100, 330)
	await expect(page).toHaveURL(/\/$/)
	expect(errors).toEqual([])
})
