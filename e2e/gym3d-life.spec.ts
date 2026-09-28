import {
	type APIRequestContext,
	type Browser,
	expect,
	type Page,
	request as pwRequest,
	type TestInfo,
	test,
} from "@playwright/test"
import mysql from "mysql2/promise"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

// 3D gym life (gym3d slice 3) on a phone: today's event by the entrance,
// a group class in its room, the tap chip (title, mood, activity,
// relationship) and Talk with the 3D portrait, speech bubbles, the cast
// lineup, and the upgrade-claim build ceremony played in place. Set
// GYM3D_SHOTS=<dir> to save screenshots.

const SHOTS = process.env.GYM3D_SHOTS ?? ""
const DB_URL =
	process.env.DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals"

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

async function adminContext(baseURL: string): Promise<APIRequestContext> {
	const admin = await pwRequest.newContext({ baseURL })
	const res = await admin.post("/api/auth/sign-in/email", {
		headers: { Origin: AUTH_ORIGIN },
		data: { email: "admin@slimpals.test", password: "AdminPass1!" },
	})
	if (!res.ok()) throw new Error(`admin sign-in failed: ${res.status()}`)
	return admin
}

/** A new member with `days` of progress, and a phone page for them. */
async function setup(
	request: APIRequestContext,
	browser: Browser,
	testInfo: TestInfo,
	days: number,
	tag: string,
) {
	const use = testInfo.project.use
	const baseURL = use.baseURL ?? "http://localhost:5173"
	const inviteCode = await mintInviteCode(request)
	const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
	await registerUser(request, {
		name: `Gym3D ${tag} ${runId}`,
		email: `e2e-gym3d-${tag}-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode,
	})
	const me = await (
		await request.get("/api/users/me", { headers: { Origin: AUTH_ORIGIN } })
	).json()
	const userId = (me.id ?? me.user?.id) as string
	const admin = await adminContext(baseURL)
	const prog = await admin.post(`/api/admin/users/${userId}/gym/progression`, {
		headers: { Origin: AUTH_ORIGIN },
		data: { daysElapsed: days },
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
	return { userId, admin, page, context }
}

async function tapPerson(page: Page, key: string) {
	const pt = await page.evaluate((k) => window.gym3d?.screenOf(k) ?? null, key)
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!pt || !box) throw new Error(`no ${key} on screen`)
	await page.mouse.click(box.x + pt.x, box.y + pt.y)
}

test("3D gym life: event, class, tap chip, bubbles and the cast lineup", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	// a gym with everything unlocked, at 6pm (the boxing class), with a
	// competition hosted by Marcus all day
	const { userId, admin, page } = await setup(
		request,
		browser,
		testInfo,
		700,
		"life",
	)
	const hdr = { headers: { Origin: AUTH_ORIGIN } }
	expect(
		(
			await admin.patch(`/api/admin/users/${userId}/gym/hour-override`, {
				...hdr,
				data: { hour: 18 },
			})
		).ok(),
	).toBe(true)
	expect(
		(
			await admin.post(`/api/admin/users/${userId}/gym/today-event`, {
				...hdr,
				data: {
					event: {
						type: "competition",
						title: "Plank-off",
						description: "Longest plank wins",
						npcKey: "trainer_marcus",
						activeHours: [0, 24],
						effects: { allNpcMoodBonus: 10, xpMultiplier: 2 },
					},
				},
			})
		).ok(),
	).toBe(true)
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(e.message))

	await page.goto("/")
	await waitReady(page)
	await page.waitForTimeout(1200)
	await shot(page, "01-start")

	const sim = await (await request.get("/api/gym/sim-state", hdr)).json()
	expect(sim.eventActive).toBe(true)

	// ── today's event: label + host by the entrance ──
	await expect(page.getByTestId("gym3d-event")).toContainText("Plank-off")
	const st = await page.evaluate(() => window.gym3d?.stats())
	expect(st?.event).toContain("Plank-off")
	const marcusIn = sim.npcs.some(
		(n: { npcKey: string; isPresent: boolean }) =>
			n.npcKey === "trainer_marcus" && n.isPresent,
	)
	if (marcusIn) {
		const info = await page.evaluate(() =>
			window.gym3d?.info("npc:trainer_marcus"),
		)
		expect(info?.doing).toContain("Plank-off")
	}

	// ── the 6pm boxing class in the boxing room ──
	const boxing = (sim.activeClasses ?? []).find(
		(c: { key: string }) => c.key === "boxing_6pm_class",
	)
	expect(boxing).toBeTruthy()
	await expect(page.getByTestId("gym3d-class")).toContainText("Boxing")
	const st2 = await page.evaluate(() => window.gym3d?.stats())
	expect(st2?.classes).toBe(1)
	expect(st2?.classPeople).toBeGreaterThanOrEqual(3)
	const L = await page.evaluate(() => window.gym3d?.layout())
	const box = L?.rooms.find((r) => r.type === "boxing")
	if (box) {
		const c = box.cells[0]
		await page.evaluate(([x, z]) => window.gym3d?.panTo(x, z), [
			c.px * 9 + 4.5,
			c.pz * 6 + 3,
		] as const)
		await page.waitForTimeout(900)
		await shot(page, "02-class")
	}

	// ── heroes on the stage get a tag when they visit ──
	const heroes = sim.npcs.filter(
		(n: { isHeroVisit: boolean; isPresent: boolean }) =>
			n.isHeroVisit && n.isPresent,
	)
	expect((await page.evaluate(() => window.gym3d?.stats()))?.heroes).toBe(
		heroes.length,
	)

	// ── tap chip on a named NPC: title, mood, activity, relationship ──
	const named = (await page.evaluate(() => window.gym3d?.people() ?? [])).find(
		(k) => k === "npc:receptionist_lisa",
	)
	const who =
		named ??
		(await page.evaluate(() => window.gym3d?.people() ?? [])).find((k) =>
			k.startsWith("npc:"),
		)
	expect(who).toBeTruthy()
	if (!who) return
	// Lisa works the front desk in the lobby, which a phone frames first
	await tapPerson(page, who)
	const chip = page.getByTestId("gym3d-chip")
	await expect(chip).toBeVisible()
	await expect(page.getByTestId("gym3d-chip-rel")).toContainText("·")
	await expect(page.getByTestId("gym3d-chip-doing")).toBeVisible()
	await shot(page, "03-chip")

	// Talk opens the dialog with the 3D look's picture (loading the dialog
	// itself needs the AI service when no batch is cached)
	await page.getByTestId("gym3d-talk").click()
	await expect(page.locator(".dialog-overlay")).toBeVisible()
	if (process.env.GEMINI_API_KEY) {
		const img = page.locator(".dialog-panel img.portrait")
		await expect(img).toBeVisible({ timeout: 20_000 })
		expect(await img.getAttribute("src")).toMatch(/^data:image\/png/)
	}
	await shot(page, "04-dialog")
	await page
		.locator(".dialog-panel button", { hasText: /close/i })
		.first()
		.click()
	await expect(page.locator(".dialog-overlay")).toHaveCount(0)

	// every cast member has a portrait of their 3D look
	const pics = await page.evaluate(() =>
		[
			"trainer_marcus",
			"receptionist_lisa",
			"regular_derek",
			"regular_priya",
			"regular_tom",
			"regular_elena",
			"specialist_coach",
			"specialist_nutritionist",
			"trainer_jordan",
			"manager_alex",
			"hero_bodybuilder_rex",
			"hero_influencer_maya",
		].map((k) => window.gym3d?.portrait(k) ?? ""),
	)
	for (const p of pics) expect(p).toMatch(/^data:image\/png/)
	if (SHOTS) {
		const sheet = await browser.newPage({
			viewport: { width: 780, height: 540 },
		})
		await sheet.setContent(
			`<body style="margin:0;display:flex;flex-wrap:wrap;background:#333">${pics
				.map((p) => `<img src="${p}" width="130" height="130">`)
				.join("")}</body>`,
		)
		await sheet.screenshot({ path: `${SHOTS}/04b-portraits.png` })
		await sheet.close()
	}

	// ── speech bubbles come and go, never more than three ── (chip closed:
	// a tap on the empty sky clears the selection)
	await page.evaluate(() => window.gym3d?.tap(4, 4))
	await expect(page.getByTestId("gym3d-chip")).toHaveCount(0)
	if (await page.getByTestId("gym3d-sheet").count())
		await page.getByRole("button", { name: "Close" }).click()
	await expect
		.poll(
			async () => (await page.evaluate(() => window.gym3d?.stats()))?.says,
			{
				timeout: 25_000,
			},
		)
		.toBeGreaterThan(0)
	expect(await page.locator(".g3d-say").count()).toBe(3)
	await shot(page, "05-bubbles")

	// ── the cast lineup (tooling) ──
	const cast = await page.evaluate(() => window.gym3d?.lineup(true) ?? [])
	expect(cast.length).toBe(12)
	await page.waitForTimeout(700)
	await shot(page, "06-lineup")
	await page.evaluate(() => window.gym3d?.lineup(false))

	const perf = await page.evaluate(() => window.gym3d?.stats())
	console.log("gym3d life stats", JSON.stringify(perf))
	expect(errors).toEqual([])
})

test("3D gym: claiming an upgrade builds it in place", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(150_000)
	const { userId, page } = await setup(request, browser, testInfo, 120, "claim")
	// one upgrade waits to be claimed (as after a real XP award)
	const conn = await mysql.createConnection(DB_URL)
	try {
		const [rows] = await conn.execute(
			"SELECT id FROM user_gyms WHERE user_id = ?",
			[userId],
		)
		const gymId = (rows as { id: number }[])[0].id
		await conn.execute(
			"DELETE FROM user_gym_upgrades WHERE gym_id = ? AND upgrade_key = ?",
			[gymId, "weights_smith"],
		)
		await conn.execute(
			"UPDATE user_gyms SET pending_upgrade_keys = ? WHERE id = ?",
			[JSON.stringify(["weights_smith"]), gymId],
		)
	} finally {
		await conn.end()
	}
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(e.message))
	await page.goto("/")
	await waitReady(page)
	const before = await page.evaluate(
		() =>
			window.gym3d
				?.layout()
				.pieces.filter((p) => p.upgradeKey === "weights_smith").length ?? -1,
	)
	expect(before).toBe(0)

	// the same mounted gym must survive the claim (no remount)
	await page.evaluate(() => {
		;(window.gym3d as unknown as { mark?: number }).mark = 1
	})
	await page.getByTestId("place-gear").click()
	await expect(
		page.getByText("Tap the gym to help build!").first(),
	).toBeVisible()
	await expect(page.getByTestId("gym3d-claim")).toBeVisible({ timeout: 10_000 })
	await page.waitForTimeout(900)
	await shot(page, "07-claim-build")
	// taps help (the canvas centre)
	const b = await page.locator("[data-testid=gym3d]").boundingBox()
	if (b)
		for (let i = 0; i < 8; i++) {
			await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
			await page.waitForTimeout(150)
		}
	// a slow (software GL) frame rate slows the crew's own progress down
	await expect(page.getByTestId("gym3d-claim")).toHaveCount(0, {
		timeout: 45_000,
	})
	await page.waitForTimeout(500)
	await shot(page, "08-claim-drop")
	// the ceremony is over once the piece has landed (the hint goes away)
	await expect(page.getByText("Tap the gym to help build!")).toHaveCount(0, {
		timeout: 20_000,
	})
	const after = await page.evaluate(
		() =>
			window.gym3d
				?.layout()
				.pieces.filter((p) => p.upgradeKey === "weights_smith").length ?? -1,
	)
	expect(after).toBe(1)
	// no remount: the same gym is still up
	expect(await page.evaluate(() => window.gym3d?.claiming())).toBe(false)
	expect(
		await page.evaluate(
			() => (window.gym3d as unknown as { mark?: number }).mark,
		),
	).toBe(1)
	await page.waitForTimeout(1200)
	await shot(page, "09-claim-done")
	expect(errors).toEqual([])
})
