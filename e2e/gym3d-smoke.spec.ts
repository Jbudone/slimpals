import { expect, type Page, test } from "@playwright/test"
import { mintInviteCode, registerUser } from "./helpers.js"

// Beta 3D gym (three.js, behind ?gym3d=1 / Settings). Smoke only: it boots,
// shows the gym, a tap names a person, nothing errors, and mounting it again
// and again does not leak WebGL contexts or grow GPU memory. See CLAUDE.md's
// canvas notes: the canvas is checked through window.gym3d, not the DOM.

const DRAW_CALL_BUDGET = 250

// Counts WebGL2 contexts created and lost (forceContextLoss on dispose fires
// webglcontextlost), so a remount that forgets to free its renderer shows up.
// Only webgl2: Phaser (in the main bundle) probes a plain webgl context at
// import time and never frees it; three.js always asks for webgl2.
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

/** Client-side navigation through the app's router (no page reload). */
async function clientNav(page: Page, path: string) {
	await page.evaluate((p) => {
		history.pushState(null, "", p)
		dispatchEvent(new PopStateEvent("popstate", { state: null }))
	}, path)
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
	const { context, page, name, consoleErrors, pageErrors } = await newUserPage(
		request,
		browser,
		"smoke",
		testInfo.project.use,
	)

	await page.goto("/gym/canvas?gym3d=1")
	await expect(
		page.locator(".gym-name", { hasText: `${name}'s Gym` }),
	).toBeVisible()
	await waitReady(page)
	// the 2D gym is not mounted alongside
	await expect(page.locator(".phaser-container")).toHaveCount(0)

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

	// tap the staff member at the reception desk (a real pointer tap on the
	// canvas at the person's screen point) and expect a name chip
	const keys = await page.evaluate(() => window.gym3d?.people() ?? [])
	const staffKey = keys.find((k) => k.startsWith("staff:")) ?? keys[0]
	expect(staffKey).toBeTruthy()
	const pt = await page.evaluate(
		(k) => window.gym3d?.screenOf(k) ?? null,
		staffKey,
	)
	expect(pt).toBeTruthy()
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box || !pt) throw new Error("no gym box or person point")
	await page.mouse.click(box.x + pt.x, box.y + pt.y)
	await expect(page.locator(".g3d-chip")).toBeVisible()
	await expect(page.locator(".g3d-chip-name")).not.toHaveText("")

	// navigate away and back three times: every mount builds the same gym,
	// every unmount frees its WebGL context and clears window.gym3d
	const first = {
		geometries: stats?.geometries ?? 0,
		textures: stats?.textures ?? 0,
	}
	for (let i = 0; i < 3; i++) {
		await clientNav(page, "/")
		await expect(page.locator("[data-testid=gym3d]")).toHaveCount(0)
		expect(await page.evaluate(() => window.gym3d === undefined)).toBe(true)
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
			.toBe(0)

		await clientNav(page, "/gym/canvas")
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

test("?gym3d=0 turns the 3D gym off again and shows the 2D gym", async ({
	request,
	browser,
}, testInfo) => {
	const { context, page, pageErrors } = await newUserPage(
		request,
		browser,
		"off",
		testInfo.project.use,
	)
	await page.addInitScript(() => localStorage.setItem("sp:gym3d", "1"))
	await page.goto("/gym/canvas?gym3d=0")
	await expect(page.locator(".phaser-container canvas")).toBeVisible()
	await expect(page.locator("[data-testid=gym3d]")).toHaveCount(0)
	expect(await page.evaluate(() => localStorage.getItem("sp:gym3d"))).toBe("0")
	expect(pageErrors).toEqual([])
	await context.close()
})
