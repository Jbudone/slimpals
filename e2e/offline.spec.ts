import { expect, request as pwRequest, test } from "@playwright/test"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

// Offline-first: a tap with no connection shows at once and is kept in a queue
// on the device; the player only hears about it after a few seconds of trouble,
// and the queue is sent when the connection is back.
test("a task ticked offline is queued, shown, and sent when the connection returns", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(120_000)
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? AUTH_ORIGIN
	const inviteCode = await mintInviteCode(request)
	const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `Offline ${id}`,
		email: `e2e-offline-${id}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const mission = await request.post("/api/missions", {
		headers: { Origin: AUTH_ORIGIN },
		data: {
			title: "Offline walk",
			cadence: "daily",
			difficulty: "easy",
			kind: "exercise",
		},
	})
	expect(mission.ok()).toBe(true)
	const missionId = (await mission.json()).id as number

	const context = await browser.newContext({
		baseURL,
		viewport: use.viewport,
		storageState: await request.storageState(),
	})
	const page = await context.newPage()
	await page.goto("/today")
	const task = page.getByTestId(`task-${missionId}`)
	await expect(task).toBeVisible()
	// let the first loads settle (and be remembered) before the signal drops
	await page.waitForTimeout(1500)

	await context.setOffline(true)
	await task.getByRole("button", { name: /done/ }).click()
	// the tick stands at once, nothing is thrown at the player
	await expect(task).toHaveClass(/done/)
	await expect(page.getByTestId("net-banner")).toHaveCount(0)
	// a few seconds on, it is a real problem: say so, and how much is waiting
	await expect(page.getByTestId("net-banner")).toContainText("1 change", {
		timeout: 20_000,
	})

	// the queue survives a closed app: it is in IndexedDB, not just memory
	const saved = await page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const req = indexedDB.open("slimpals-net", 1)
				req.onsuccess = () => {
					const get = req.result.transaction("kv").objectStore("kv").getAll()
					get.onsuccess = () =>
						resolve(
							(get.result as unknown[]).filter(
								(v) => Array.isArray(v) && v.length > 0,
							).length,
						)
				}
				req.onerror = () => resolve(-1)
			}),
	)
	expect(saved).toBeGreaterThan(0)

	await context.setOffline(false)
	await expect(page.getByTestId("net-banner")).toContainText("caught up", {
		timeout: 30_000,
	})
	await expect(page.getByTestId("net-banner")).toHaveCount(0, {
		timeout: 10_000,
	})

	// the server has it
	const missions = await request.get("/api/missions")
	const all = (await missions.json()) as {
		daily: { id: number; completedThisPeriod: boolean }[]
	}
	expect(all.daily.find((m) => m.id === missionId)?.completedThisPeriod).toBe(
		true,
	)
	await context.close()
})

test("coins collected offline show at once and reach the server when the connection returns", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(150_000)
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? AUTH_ORIGIN
	const inviteCode = await mintInviteCode(request)
	const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `OfflineCoins ${id}`,
		email: `e2e-offcoins-${id}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const me = await (
		await request.get("/api/users/me", { headers: { Origin: AUTH_ORIGIN } })
	).json()
	const userId = (me.id ?? me.user?.id) as string
	const admin = await pwRequest.newContext({ baseURL })
	const signIn = await admin.post("/api/auth/sign-in/email", {
		headers: { Origin: AUTH_ORIGIN },
		data: { email: "admin@slimpals.test", password: "AdminPass1!" },
	})
	expect(signIn.ok()).toBe(true)
	for (const [path, data] of [
		["progression", { daysElapsed: 30 }],
		["away", { hours: 6 }],
	] as const)
		expect(
			(
				await admin.post(`/api/admin/users/${userId}/gym/${path}`, {
					headers: { Origin: AUTH_ORIGIN },
					data,
				})
			).ok(),
		).toBe(true)

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
	await page.goto("/")
	await expect(page.locator("[data-testid=gym3d] canvas")).toBeVisible({
		timeout: 20_000,
	})
	await page.waitForFunction(() => window.gym3d?.ready === true, null, {
		timeout: 30_000,
	})
	await page.getByRole("button", { name: "Later" }).click()
	await page.waitForTimeout(800)
	const hud = async () =>
		Number(
			(await page.getByTestId("hud-coins").innerText()).replace(/[^0-9]/g, ""),
		)
	const coins0 = await hud()
	await expect
		.poll(() => page.evaluate(() => window.gym3d?.coinsWaiting() ?? 0))
		.toBeGreaterThan(50)

	await context.setOffline(true)
	await page.evaluate(() => window.gym3d?.collectAll())
	// the coins arrive on screen at once, with no connection
	await expect.poll(hud, { timeout: 10_000 }).toBeGreaterThan(coins0)
	const shown = await hud()

	await context.setOffline(false)
	await expect(page.getByTestId("net-banner")).toHaveCount(0, {
		timeout: 40_000,
	})
	// the server agrees with what the HUD showed (its numbers may be a touch
	// higher: income that built up while offline)
	await expect
		.poll(
			async () => {
				const w = await (await request.get("/api/gym/wallet")).json()
				return w.coins as number
			},
			{ timeout: 30_000 },
		)
		.toBeGreaterThanOrEqual(shown - 5)
	await context.close()
	await admin.dispose()
})
