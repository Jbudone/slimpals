import { expect, type Page, test } from "@playwright/test"
import { mintInviteCode, registerUser } from "./helpers.js"

// The 3D gym is home (three.js at /). Smoke only: it boots under the HUD,
// a tap names a person, nothing errors, it pauses on other tabs, and
// mounting it again and again does not leak WebGL contexts or grow GPU
// memory. The canvas is checked through window.gym3d, not the DOM.

const DRAW_CALL_BUDGET = 250

// Counts WebGL2 contexts created and lost (forceContextLoss on dispose fires
// webglcontextlost), so a remount that forgets to free its renderer shows up.
// Only webgl2 (three.js always asks for it; Home's WebGL2 probe frees its
// context at once, so it counts as made and lost).
const COUNT_CONTEXTS = () => {
	const w = window as unknown as { __gl: { made: number; lost: number } }
	w.__gl = { made: 0, lost: 0 }
	const orig = HTMLCanvasElement.prototype.getContext
	HTMLCanvasElement.prototype.getContext = function (
		this: HTMLCanvasElement,
		type: string,
		...rest: unknown[]
	) {
		const ctx = (orig as (...a: unknown[]) => unknown).call(this, type, ...rest)
		if (ctx && type === "webgl2" && !this.dataset.glCounted) {
			this.dataset.glCounted = "1"
			w.__gl.made++
			this.addEventListener("webglcontextlost", () => {
				w.__gl.lost++
			})
		}
		return ctx
	} as typeof orig
}

async function newUserPage(
	request: Parameters<typeof mintInviteCode>[0],
	browser: import("@playwright/test").Browser,
	tag: string,
	use: import("@playwright/test").TestInfo["project"]["use"],
) {
	const inviteCode = await mintInviteCode(request)
	const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	const name = `Gym3D ${tag} ${runId}`
	await registerUser(request, {
		name,
		email: `e2e-gym3d-${tag}-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const storageState = await request.storageState()
	const context = await browser.newContext({
		baseURL: use.baseURL,
		viewport: use.viewport,
		deviceScaleFactor: use.deviceScaleFactor,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
		userAgent: use.userAgent,
		storageState,
	})
	await context.addInitScript(COUNT_CONTEXTS)
	const page = await context.newPage()
	const consoleErrors: string[] = []
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text())
	})
	const pageErrors: string[] = []
	page.on("pageerror", (err) => pageErrors.push(err.message))
	return { context, page, name, consoleErrors, pageErrors }
}

async function waitReady(page: Page) {
	await expect(page.locator("[data-testid=gym3d] canvas")).toBeVisible({
		timeout: 20_000,
	})
	await page.waitForFunction(() => window.gym3d?.ready === true, null, {
		timeout: 30_000,
	})
}

test("3D gym boots, names a tapped person, and does not leak on remount", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(120_000)
	const { context, page, consoleErrors, pageErrors } = await newUserPage(
		request,
		browser,
		"smoke",
		testInfo.project.use,
	)

	await page.goto("/")
	await waitReady(page)
	// the HUD is on top and the Today drawer peeks above the tabs
	await expect(page.getByTestId("hud")).toBeVisible()
	await expect(page.getByTestId("hud-coins")).toHaveText("1,500")
	await expect(page.getByTestId("hud-sweat")).toHaveText("3")
	await expect(page.getByTestId("hud-greens")).toHaveText("2")
	await expect(page.getByTestId("drawer-count")).toBeVisible()
	await expect(page.getByTestId("tab-gym")).toHaveAttribute(
		"aria-current",
		"page",
	)

	// let a few frames render, then read the renderer's own counters
	await page.waitForTimeout(1500)
	const stats = await page.evaluate(() => window.gym3d?.stats())
	expect(stats).toBeTruthy()
	expect(stats?.rooms ?? 0).toBeGreaterThanOrEqual(1)
	expect(stats?.pieces ?? 0).toBeGreaterThanOrEqual(2)
	expect(stats?.drawCalls ?? 0).toBeGreaterThan(0)
	expect(stats?.drawCalls ?? Number.POSITIVE_INFINITY).toBeLessThan(
		DRAW_CALL_BUDGET,
	)
	expect(stats?.running).toBe(true)

	// tap a person who is on screen, staff first (a real pointer tap on the
	// canvas at the person's screen point), and expect a name chip
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym box")
	const pt = await page.evaluate(
		({ w, h }) => {
			const g = window.gym3d
			if (!g) return null
			const keys = g.people()
			const order = [
				...keys.filter((k) => k.startsWith("staff:")),
				...keys.filter((k) => !k.startsWith("staff:")),
			]
			for (const k of order) {
				const p = g.screenOf(k)
				if (p && p.x > 40 && p.x < w - 40 && p.y > 170 && p.y < h - 120)
					return p
			}
			return null
		},
		{ w: box.width, h: box.height },
	)
	expect(pt).toBeTruthy()
	if (!pt) return
	await page.mouse.click(box.x + pt.x, box.y + pt.y)
	await expect(page.locator(".g3d-chip")).toBeVisible()
	await expect(page.locator(".g3d-chip-name")).not.toHaveText("")

	// the gym stays mounted on other tabs, hidden, and stops rendering
	await page.getByTestId("tab-today").click()
	await expect(page.getByRole("heading", { name: "Today" })).toBeVisible()
	await expect
		.poll(() => page.evaluate(() => window.gym3d?.stats().running))
		.toBe(false)
	await page.getByTestId("tab-gym").click()
	await expect
		.poll(() => page.evaluate(() => window.gym3d?.stats().running))
		.toBe(true)

	// remount three times: every mount builds the same gym, every unmount
	// frees its WebGL context
	const first = {
		geometries: stats?.geometries ?? 0,
		textures: stats?.textures ?? 0,
	}
	for (let i = 0; i < 3; i++) {
		await page.evaluate(() => window.spRemountGym?.())
		// context loss events arrive asynchronously
		await expect
			.poll(() =>
				page.evaluate(() => {
					const g = (
						window as unknown as { __gl: { made: number; lost: number } }
					).__gl
					return g.made - g.lost
				}),
			)
			.toBeLessThanOrEqual(1)
		await waitReady(page)
		await page.waitForTimeout(1500)
		const s = await page.evaluate(() => window.gym3d?.stats())
		expect(s?.rooms).toBe(stats?.rooms)
		expect(s?.pieces).toBe(stats?.pieces)
		// people come and go, so allow a little drift, but no growth per mount
		expect(s?.geometries ?? 0).toBeLessThanOrEqual(first.geometries * 1.25 + 10)
		expect(s?.textures ?? 0).toBeLessThanOrEqual(first.textures + 4)
	}
	const gl = await page.evaluate(
		() => (window as unknown as { __gl: { made: number; lost: number } }).__gl,
	)
	// only the live gym's context is still open
	expect(gl.made - gl.lost).toBe(1)

	expect(consoleErrors).toEqual([])
	expect(pageErrors).toEqual([])
	await context.close()
})

test("old gym links go home, and no WebGL2 shows a friendly card", async ({
	request,
	browser,
}, testInfo) => {
	const { context, page, pageErrors } = await newUserPage(
		request,
		browser,
		"nogl",
		testInfo.project.use,
	)
	await page.addInitScript(() => {
		const orig = HTMLCanvasElement.prototype.getContext
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...rest: unknown[]
		) {
			if (type === "webgl2") return null
			return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest)
		} as typeof orig
	})
	await page.goto("/gym/canvas")
	await expect(page).toHaveURL(/\/$/)
	await expect(page.getByTestId("gym-fallback")).toBeVisible()
	await expect(page.locator("[data-testid=gym3d]")).toHaveCount(0)
	// the day's tasks still work without the gym
	await page.getByTestId("drawer-head").click()
	await expect(page.getByTestId("checkin-card")).toBeVisible()
	expect(pageErrors).toEqual([])
	await context.close()
})
