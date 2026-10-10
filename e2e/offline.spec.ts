import { expect, test } from "@playwright/test"
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
