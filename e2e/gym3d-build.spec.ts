import {
	type APIRequestContext,
	expect,
	type Page,
	request as pwRequest,
	test,
} from "@playwright/test"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

// 3D gym building on a phone: buy a For Sale plot, speed the construction
// up with Sweat (one hour, then finish), choose the room type, move a piece
// with tap-move-tap, and upgrade it (coins and Sweat granted by an admin). The canvas is
// driven through window.gym3d (screen points of world positions) and real
// pointer taps. Set GYM3D_SHOTS=<dir> to save screenshots of each step.

const SHOTS = process.env.GYM3D_SHOTS ?? ""

async function shot(page: Page, name: string) {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function waitReady(page: Page) {
	await expect(page.locator("[data-testid=gym3d] canvas")).toBeVisible({
		timeout: 20_000,
	})
	await page.waitForFunction(() => window.gym3d?.ready === true, null, {
		timeout: 30_000,
	})
}

/** Frames a world point, then taps the canvas there. */
async function tapWorld(page: Page, x: number, y: number, z: number) {
	await page.evaluate(([a, c]) => window.gym3d?.panTo(a, c), [x, z] as const)
	await page.waitForTimeout(700)
	const pt = await page.evaluate(
		([a, b, c]) => window.gym3d?.screenAt(a, b, c) ?? null,
		[x, y, z] as const,
	)
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!pt || !box) throw new Error("no gym")
	await page.mouse.click(box.x + pt.x, box.y + pt.y)
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

const layoutOf = (page: Page) =>
	page.evaluate(() => {
		const l = window.gym3d?.layout()
		if (!l) throw new Error("no layout")
		return l
	})

test("3D gym: buy a plot, finish it, pick its type, move and upgrade gear", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? "http://localhost:5173"

	// a new user whose gym has a few weeks of unlocks (admin progression)
	const inviteCode = await mintInviteCode(request)
	const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `Gym3D build ${runId}`,
		email: `e2e-gym3d-build-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const me = await (
		await request.get("/api/users/me", { headers: { Origin: AUTH_ORIGIN } })
	).json()
	const userId = (me.id ?? me.user?.id) as string
	expect(userId).toBeTruthy()
	const admin = await adminContext(baseURL)
	const prog = await admin.post(`/api/admin/users/${userId}/gym/progression`, {
		headers: { Origin: AUTH_ORIGIN },
		data: { daysElapsed: 30 },
	})
	expect(prog.ok()).toBe(true)

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
	await page.waitForTimeout(800)
	await shot(page, "01-start")

	// starter coins and lots for sale next to the building
	let L = await layoutOf(page)
	expect(L.coins).toBeGreaterThanOrEqual(1500)
	const coins0 = L.coins
	await expect(page.getByTestId("hud-coins")).toHaveText(
		coins0.toLocaleString("en-US"),
	)
	expect(L.sweat).toBe(3)
	const lot = L.lots
		.filter((l) => l.shape === "normal")
		.sort((a, b) => a.price - b.price)[0]
	expect(lot).toBeTruthy()
	if (!lot) return
	expect(lot.price).toBeLessThanOrEqual(coins0)

	// ── buy ── (tap the back of the lot: room badges float over its front)
	const cell = lot.cells[0]
	await tapWorld(page, cell.px * 9 + 5.5, 0.2, cell.pz * 6 + 1.2)
	await expect(page.getByTestId("gym3d-sheet")).toHaveAttribute(
		"data-sheet",
		"lot",
	)
	await shot(page, "02-lot-sheet")
	await page.getByTestId("gym3d-buy").click()
	await expect(page.locator(".g3d-bub")).toHaveCount(1)
	L = await layoutOf(page)
	expect(L.coins).toBe(coins0 - lot.price)
	const job = L.jobs.find((j) => j.kind === "plot" && j.status === "active")
	expect(job).toBeTruthy()
	await page.waitForTimeout(900)
	await shot(page, "03-building")

	// ── Sweat: one hour off (timer bubble), then finish ──
	const grantSweat = await admin.post(`/api/admin/users/${userId}/gym/sweat`, {
		headers: { Origin: AUTH_ORIGIN },
		data: { amount: 20 },
	})
	expect(grantSweat.ok()).toBe(true)
	await page.reload()
	await waitReady(page)
	L = await layoutOf(page)
	expect(L.sweat).toBe(23)
	await expect(page.getByTestId("hud-sweat")).toHaveText("23")
	const end0 = Date.parse(L.jobs.find((j) => j.id === job?.id)?.endsAt ?? "")
	await page.locator(".g3d-bub [data-testid=job-sweat]").click()
	await expect.poll(async () => (await layoutOf(page)).sweat).toBe(22)
	L = await layoutOf(page)
	const end1 = Date.parse(L.jobs.find((j) => j.id === job?.id)?.endsAt ?? "")
	expect(end0 - end1).toBeGreaterThan(3_500_000)
	await expect(page.getByTestId("hud-sweat")).toHaveText("22")
	await shot(page, "03b-sweat-hour")
	const coins1 = L.coins
	await page.locator(".g3d-bub .g3d-fin").click()
	await expect(page.locator(".g3d-bub")).toHaveCount(0)
	L = await layoutOf(page)
	// Sweat finishes jobs now; coins are left alone
	expect(L.coins).toBe(coins1)
	expect(L.sweat).toBeLessThan(22)
	expect(L.jobs.find((j) => j.id === job?.id)?.status).toBe("done")
	await page.waitForTimeout(1300)
	await shot(page, "04-ribbon")

	// ── pick the room type (the sheet opens after the ribbon) ──
	await expect(page.getByTestId("gym3d-sheet")).toHaveAttribute(
		"data-sheet",
		"type",
		{ timeout: 10_000 },
	)
	await shot(page, "05-type-sheet")
	await page.getByTestId("gym3d-type-cardio").click()
	await page.getByTestId("gym3d-type-ok").click()
	await expect(page.getByTestId("gym3d-sheet")).toHaveAttribute(
		"data-sheet",
		"room",
	)
	L = await layoutOf(page)
	const newRoom = L.rooms.find((r) => r.id === job?.roomId)
	expect(newRoom?.type).toBe("cardio")
	await page.waitForTimeout(600)
	await shot(page, "06-new-room")

	// admin grants coins for the upgrade (the next action returns them)
	const grant = await admin.post(`/api/admin/users/${userId}/gym/coins`, {
		headers: { Origin: AUTH_ORIGIN },
		data: { amount: 5000 },
	})
	expect(grant.ok()).toBe(true)

	// ── move a cardio piece into the new room (tap, Move, tap a spot) ──
	const piece = L.pieces.find(
		(p) =>
			p.roomType === "cardio" &&
			p.status === "placed" &&
			p.roomId !== newRoom?.id &&
			p.size === 2,
	)
	expect(piece).toBeTruthy()
	if (!piece) return
	await page.getByRole("button", { name: "Close" }).click()
	await tapWorld(page, piece.x, 0.6, piece.z)
	await shot(page, "07a-piece-tapped")
	await expect(page.getByTestId("gym3d-sheet")).toHaveAttribute(
		"data-sheet",
		"piece",
	)
	await shot(page, "07-piece-sheet")
	await page.getByTestId("gym3d-move").click()
	await expect(page.locator(".g3d-banner")).toBeVisible()
	const targets = await page.evaluate(() => window.gym3d?.moveTargets() ?? [])
	const target = targets.find((t) => t.roomId === newRoom?.id)
	expect(target).toBeTruthy()
	if (!target) return
	await shot(page, "08-move-targets")
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")
	await page.mouse.click(box.x + target.x, box.y + target.y)
	await expect
		.poll(async () => {
			const l = await layoutOf(page)
			const p = l.pieces.find((q) => q.id === piece.id)
			return p ? `${p.roomId}:${p.spotIndex}` : ""
		})
		.toBe(`${target.roomId}:${target.spot}`)
	L = await layoutOf(page)
	expect(L.coins).toBeGreaterThanOrEqual(5000)
	await expect(page.getByTestId("gym3d-sheet")).toHaveAttribute(
		"data-sheet",
		"piece",
	)
	await shot(page, "09-moved")

	// ── upgrade it to tier 2, then finish now ──
	await page.getByTestId("gym3d-upgrade").click()
	await expect
		.poll(async () => {
			const l = await layoutOf(page)
			return l.pieces.find((q) => q.id === piece.id)?.status
		})
		.toBe("upgrading")
	await page.waitForTimeout(900)
	await shot(page, "10-upgrading")
	await page.getByTestId("gym3d-finish").click()
	await expect
		.poll(async () => {
			const l = await layoutOf(page)
			return l.pieces.find((q) => q.id === piece.id)?.tier
		})
		.toBe(2)
	await page.waitForTimeout(1300)
	await shot(page, "11-tier2")

	const stats = await page.evaluate(() => window.gym3d?.stats())
	expect(stats?.drawCalls ?? 999).toBeLessThan(250)
	if (SHOTS) console.log("gym3d stats", JSON.stringify(stats))
	expect(pageErrors).toEqual([])
	await admin.dispose()
	await context.close()
})
