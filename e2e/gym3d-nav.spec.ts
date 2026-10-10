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

	// Today is the gym's drawer now: the old link opens it
	await page.goto("/today")
	await expect(page).toHaveURL(/\/$/)
	await expect(page.getByTestId("today-drawer")).toHaveAttribute(
		"data-open",
		"true",
	)
	// four tabs: Today is no longer one of them
	await expect(page.locator("nav[aria-label=Primary] .tab")).toHaveCount(4)
	await expect(page.getByTestId("tab-today")).toHaveCount(0)

	// the road ahead and the month's track sit in the drawer's Rewards tab
	await page.getByTestId("drawer-tab-rewards").click()
	await expect(page.getByTestId("reward-track")).toBeVisible()
	await expect(page.getByTestId("track-node-1")).toBeVisible()
	await expect(page.getByTestId("unlock-track")).toBeVisible()
	// reveal three, hint one, hide the rest
	const cards = page.getByTestId("unlock-rail").locator("li")
	await expect(cards).toHaveCount(4)
	await expect(page.getByTestId("unlock-hint")).toHaveCount(1)
	await expect(page.getByTestId("unlock-hint")).toContainText("Level")
	// the coach has a tab too
	await page.getByTestId("drawer-tab-coach").click()
	await expect(page.getByTestId("drawer-coach")).toBeVisible()
	// and the next unlock is a bubble on the gym, which opens that tab
	await expect(page.getByTestId("upnext")).toBeVisible()
	await page.getByTestId("drawer-tab-tasks").click()
	await page.getByTestId("drawer-head").click()
	await page.getByTestId("upnext").click()
	await expect(page.getByTestId("today-drawer")).toHaveAttribute(
		"data-open",
		"true",
	)
	await expect(page.getByTestId("reward-track")).toBeVisible()

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

	// ── swipes: Compete (challenges -> tournaments) -> Progress and back ──
	await page.getByTestId("tab-compete").click()
	await expect(page).toHaveURL(/\/challenges$/)
	await swipe(page, ".hub-page h1", 320, 110)
	await expect(page).toHaveURL(/\/tournaments$/)
	await swipe(page, ".hub-page h1", 320, 110)
	await expect(page).toHaveURL(/\/weight$/)
	// and back the other way
	await swipe(page, "main h1", 100, 330)
	await expect(page).toHaveURL(/\/challenges$/)
	await swipe(page, ".hub-page h1", 100, 330)
	await expect(page).toHaveURL(/\/$/)
	expect(errors).toEqual([])
})

test("event looks: a themed backdrop with an accent, off in the gym and when switched off", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(120_000)
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? "http://localhost:5173"
	const inviteCode = await mintInviteCode(request)
	const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `Look ${runId}`,
		email: `e2e-look-${runId}@slimpals.test`,
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
	const look = () =>
		page.evaluate(() => document.documentElement.dataset.event ?? "")

	// forced with ?event=: the backdrop is there, the root carries the look
	await page.goto("/challenges?event=arcade")
	await expect(page.getByTestId("theme-layer")).toHaveAttribute(
		"data-event",
		"arcade",
	)
	expect(await look()).toBe("arcade")
	// it takes no taps and sits behind the content
	expect(
		await page.evaluate(
			() =>
				getComputedStyle(
					document.querySelector("[data-testid=theme-layer]") as Element,
				).pointerEvents,
		),
	).toBe("none")
	// a tiny event drifts past within a few seconds (not under reduced motion)
	await expect
		.poll(() => page.locator("[data-testid=theme-layer] .ev").count(), {
			timeout: 20_000,
		})
		.toBeGreaterThan(0)

	// "none" turns it off
	await page.goto("/challenges?event=none")
	await expect(page.getByTestId("theme-layer")).toHaveCount(0)
	expect(await look()).toBe("")

	// the gym gets weather over the scene (not a page backdrop), and the accent follows
	await page.goto("/?event=winter")
	await expect(
		page.locator("[data-testid=theme-layer][data-over=true]"),
	).toHaveCount(1)
	await expect(
		page.locator("[data-testid=theme-layer][data-over=false]"),
	).toHaveCount(0)
	expect(await look()).toBe("winter")
	// the HUD wears it: the accent glow is part of its shadow
	const hudShadow = await page
		.locator(".hud")
		.first()
		.evaluate((el) => getComputedStyle(el).boxShadow)
	expect(hudShadow).toContain("0px 0px 16px -4px")
	// and its level ring wears the look's skin (winter blue, not the default green)
	const ring = await page
		.locator(".lvring .fg")
		.first()
		.evaluate((el) => getComputedStyle(el).stroke)
	expect(ring).toBe("rgb(111, 195, 255)")

	// Settings has a switch for the season's and challenge's look
	await page.goto("/settings")
	const toggle = page.getByTestId("event-theme-toggle")
	await expect(toggle).toBeChecked()
	await toggle.uncheck()
	await expect(page.getByTestId("theme-layer")).toHaveCount(0)
	expect(await look()).toBe("")
	await toggle.check()
	expect(errors).toEqual([])
})
