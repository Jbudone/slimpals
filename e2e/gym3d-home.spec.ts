import {
	type APIRequestContext,
	expect,
	type Page,
	request as pwRequest,
	test,
} from "@playwright/test"
import {
	AUTH_ORIGIN,
	expectUncovered,
	mintInviteCode,
	registerUser,
} from "./helpers.js"

// Gym home on a phone: the HUD, the Today drawer (a tick flies Sweat into
// the HUD), coin bubbles and Collect all, the Slim Kitchen (Greens unlock a
// menu item), Welcome back after time away (an admin test tool moves the
// gym's clocks) and the four tabs. Set GYM3D_SHOTS=<dir> for screenshots.

const SHOTS = process.env.GYM3D_SHOTS ?? ""

async function shot(page: Page, name: string) {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-${name}.png` })
}

async function waitReady(page: Page) {
	await expect(page.locator("[data-testid=gym3d] canvas")).toBeVisible({
		timeout: 20_000,
	})
	await page.waitForFunction(() => window.gym3d?.ready === true, null, {
		timeout: 30_000,
	})
}

async function adminContext(baseURL: string): Promise<APIRequestContext> {
	const admin = await pwRequest.newContext({ baseURL })
	const res = await admin.post("/api/auth/sign-in/email", {
		headers: { Origin: AUTH_ORIGIN },
		data: { email: "admin@slimpals.test", password: "AdminPass1!" },
	})
	if (!res.ok()) throw new Error(`admin sign-in failed: ${res.status()}`)
	return admin
}

const hdr = { headers: { Origin: AUTH_ORIGIN } }

test("gym home: tick a task, collect coins, run the kitchen, come back", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? "http://localhost:5173"
	const inviteCode = await mintInviteCode(request)
	const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `Gym home ${runId}`,
		email: `e2e-gym3d-home-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const me = await (await request.get("/api/users/me", hdr)).json()
	const userId = (me.id ?? me.user?.id) as string
	const admin = await adminContext(baseURL)
	expect(
		(
			await admin.post(`/api/admin/users/${userId}/gym/progression`, {
				...hdr,
				data: { daysElapsed: 30 },
			})
		).ok(),
	).toBe(true)
	// an exercise task (Sweat) and a diet task (Greens)
	const walk = await request.post("/api/missions", {
		...hdr,
		data: { title: "20 minute walk", cadence: "daily", difficulty: "medium" },
	})
	expect(walk.ok()).toBe(true)
	expect((await walk.json()).kind).toBe("exercise")
	const salad = await request.post("/api/missions", {
		...hdr,
		data: { title: "Eat a big salad", cadence: "daily", difficulty: "hard" },
	})
	expect((await salad.json()).kind).toBe("diet")

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
	const pageErrors: string[] = []
	page.on("pageerror", (err) => pageErrors.push(err.message))

	await page.goto("/")
	await waitReady(page)
	await expect(page.getByTestId("hud-sweat")).toHaveText("3")
	await expect(page.getByTestId("drawer-count")).toContainText("0 of 3 done")
	await shot(page, "01-home")

	// ── the drawer opens; ticking the walk flies +2 Sweat into the HUD ──
	await page.getByTestId("drawer-head").click()
	await expect(page.getByTestId("today-drawer")).toHaveAttribute(
		"data-open",
		"true",
	)
	await shot(page, "02-drawer")
	const row = page.locator("li.task", { hasText: "20 minute walk" })
	await row.locator(".tick").click()
	await expect(page.locator("#fly-layer .fchip.sw")).toHaveCount(1)
	await shot(page, "03-tick-flying")
	await expect(page.getByTestId("hud-sweat")).toHaveText("5")
	await expect(page.getByTestId("drawer-count")).toContainText("1 of 3 done")
	// un-tick and tick again: Sweat is paid once per task and day
	await row.locator(".tick").click()
	await expect(row).not.toHaveClass(/done/)
	await row.locator(".tick").click()
	await expect(row).toHaveClass(/done/)
	await page.waitForTimeout(1500)
	await expect(page.getByTestId("hud-sweat")).toHaveText("5")
	// the salad pays Greens
	await page
		.locator("li.task", { hasText: "Eat a big salad" })
		.locator(".tick")
		.click()
	await expect(page.getByTestId("hud-greens")).toHaveText("5")
	await page.getByTestId("drawer-head").click()
	await expect(page.getByTestId("today-drawer")).toHaveAttribute(
		"data-open",
		"false",
	)

	// ── six hours away: bubbles fill, Welcome back on the next open ──
	expect(
		(
			await admin.post(`/api/admin/users/${userId}/gym/away`, {
				...hdr,
				data: { hours: 6 },
			})
		).ok(),
	).toBe(true)
	await page.reload()
	await waitReady(page)
	await expect(page.getByTestId("welcome-back")).toBeVisible()
	await shot(page, "04-welcome-back")
	await page.getByRole("button", { name: "Later" }).click()
	await expect(page.getByTestId("welcome-back")).toHaveCount(0)
	await page.waitForTimeout(600)
	const bubbles = await page.evaluate(() => window.gym3d?.coinBubbles() ?? [])
	expect(bubbles.length).toBeGreaterThanOrEqual(2)
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")
	// tap one bubble that is on screen (not under the HUD or the drawer)
	const one = bubbles.find(
		(b) =>
			b.x > 30 && b.x < box.width - 30 && b.y > 150 && b.y < box.height - 120,
	)
	expect(one).toBeTruthy()
	if (!one) return
	const coins0 = (await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0
	await page.locator(`[data-income="${one.key}"]`).click()
	await expect(page.locator("#fly-layer .fchip.co").first()).toBeVisible()
	await shot(page, "05-collect-one")
	await expect
		.poll(
			async () =>
				(await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0,
		)
		.toBeGreaterThanOrEqual(coins0 + one.coins)
	// Collect all empties the rest
	await page.getByTestId("collect-all").click()
	await shot(page, "06-collect-all")
	await expect(page.getByTestId("collect-all")).toHaveCount(0, {
		timeout: 10_000,
	})
	// the HUD settles on the gym's balance (read together, after the last
	// collect answer lands)
	await expect
		.poll(() =>
			page.evaluate(() => {
				const hud = document.querySelector("[data-testid=hud-coins]")
				const c = window.gym3d?.layout().coins ?? -1
				return hud?.textContent?.trim() === c.toLocaleString("en-US")
			}),
		)
		.toBe(true)

	// ── the Slim Kitchen: Greens put a new item on the menu ──
	const k = await page.evaluate(() => window.gym3d?.kitchen())
	if (!k) throw new Error("no kitchen")
	await page.mouse.click(box.x + k.x, box.y + k.y)
	await expect(page.getByTestId("gym3d-sheet")).toHaveAttribute(
		"data-sheet",
		"kitchen",
	)
	// the drawer steps aside while a sheet is up
	await expect(page.getByTestId("today-drawer")).toHaveClass(/gone/)
	await expect(page.getByTestId("kitchen-rate")).toContainText("8")
	// the whole sheet sits above the tab bar, its last button uncovered
	await page.getByTestId("kitchen-collect").scrollIntoViewIfNeeded()
	await expectUncovered(page, "kitchen-collect")
	await shot(page, "07-kitchen")
	await page.getByTestId("kitchen-add-protein").click()
	await expect(page.getByTestId("kitchen-rate")).toContainText("14")
	await expect(page.getByTestId("hud-greens")).toHaveText("3")
	await page.getByTestId("kitchen-rush").click()
	await expect(page.getByTestId("kitchen-rate")).toContainText("28")
	await expect(page.getByTestId("hud-greens")).toHaveText("2")
	await shot(page, "08-kitchen-rush")
	await page.getByRole("button", { name: "Close" }).click()

	// ── the tabs ──
	await page.getByTestId("tab-today").click()
	await expect(page.getByRole("heading", { name: "Today" })).toBeVisible()
	await expect(page.getByTestId("checkin-card")).toBeVisible()
	await shot(page, "09-tab-today")
	await page.getByTestId("tab-progress").click()
	await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible()
	await page.getByRole("tab", { name: "Gym levels" }).click()
	await expect(page).toHaveURL(/\/upgrades$/)
	await shot(page, "10-tab-progress")
	await page.getByTestId("tab-social").click()
	await expect(page.getByRole("heading", { name: "Social" })).toBeVisible()
	await page.getByRole("tab", { name: "Badges" }).click()
	await expect(page).toHaveURL(/\/badges$/)
	await shot(page, "11-tab-social")
	await page.getByTestId("tab-gym").click()
	await expect
		.poll(() => page.evaluate(() => window.gym3d?.stats().running))
		.toBe(true)

	expect(pageErrors).toEqual([])
	await admin.dispose()
	await context.close()
})
