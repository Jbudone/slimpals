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
import {
	type EquipmentRoomType,
	PD,
	PW,
	roomSpots,
} from "../shared/gym3d/rooms.js"
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
	// generous: a software renderer in CI-like boxes can take a while to boot
	await expect(page.locator("[data-testid=gym3d] canvas")).toBeVisible({
		timeout: 45_000,
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
		// phones: the 390x844 the gym is designed for
		viewport: use.isMobile ? { width: 390, height: 844 } : use.viewport,
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

type Box = {
	kind: string
	x: number
	y: number
	w: number
	h: number
	text: string
}

function overlapping(bs: Box[]): string | null {
	for (let i = 0; i < bs.length; i++)
		for (let j = i + 1; j < bs.length; j++) {
			const a = bs[i]
			const b = bs[j]
			if (
				a.x < b.x + b.w &&
				b.x < a.x + a.w &&
				a.y < b.y + b.h &&
				b.y < a.y + a.h
			)
				return `${a.kind} "${a.text}" over ${b.kind} "${b.text}"`
		}
	return null
}

const bubblesNow = (page: Page) =>
	page.evaluate(() => (window.gym3d?.bubbles() ?? []) as Box[])

/** A canvas point (CSS px in the gym) clear of bubbles and people. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
	const pt = await page.evaluate(() => {
		const g = window.gym3d
		const host = document.querySelector("[data-testid=gym3d]")
		if (!g || !host) return null
		const r = host.getBoundingClientRect()
		const people = g
			.people()
			.map((k) => g.screenOf(k))
			.filter((p): p is { x: number; y: number } => !!p)
		const bs = g.bubbles()
		for (let y = r.height * 0.3; y < r.height * 0.7; y += 23)
			for (let x = 40; x < r.width - 40; x += 29) {
				const hit = document.elementFromPoint(r.left + x, r.top + y)
				if (hit?.tagName !== "CANVAS") continue
				if (people.some((p) => Math.hypot(p.x - x, p.y - y) < 70)) continue
				if (
					bs.some(
						(b) =>
							x > b.x - 20 &&
							x < b.x + b.w + 20 &&
							y > b.y - 20 &&
							y < b.y + b.h + 20,
					)
				)
					continue
				return { x, y }
			}
		return null
	})
	if (!pt) throw new Error("no empty spot on the gym")
	return pt
}

const hasLine = async (page: Page, text: string) =>
	(await bubblesNow(page)).some((b) => b.text.includes(text))

test("3D gym bubbles: no overlap, tap to pop, the stat card closes", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { userId, admin, page } = await setup(
		request,
		browser,
		testInfo,
		700,
		"bub",
	)
	const hdr = { headers: { Origin: AUTH_ORIGIN } }
	// 6pm: the named cast is in (Marcus, Tom, Jordan...)
	expect(
		(
			await admin.patch(`/api/admin/users/${userId}/gym/hour-override`, {
				...hdr,
				data: { hour: 18 },
			})
		).ok(),
	).toBe(true)
	// coins waiting in every bubble too
	expect(
		(
			await admin.post(`/api/admin/users/${userId}/gym/away`, {
				...hdr,
				data: { hours: 6 },
			})
		).ok(),
	).toBe(true)
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(e.message))
	await page.goto("/")
	await waitReady(page)
	if (await page.getByTestId("welcome-back").count())
		await page.getByRole("button", { name: "Later" }).click()
	await page.waitForTimeout(800)
	const gym = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!gym) throw new Error("no gym")
	const phone = gym.width < 520
	const touch = !!testInfo.project.use.hasTouch

	// ── many lines at once, crowded with coin bubbles: none overlap ──
	const onScreen = await page.evaluate(
		([w, h]) => {
			const g = window.gym3d
			if (!g) return []
			return g.people().filter((k) => {
				const p = g.screenOf(k)
				return p && p.x > 40 && p.x < w - 40 && p.y > 200 && p.y < h - 200
			})
		},
		[gym.width, gym.height] as const,
	)
	expect(onScreen.length).toBeGreaterThanOrEqual(3)
	await page.evaluate((keys) => {
		keys.slice(0, 5).forEach((k, i) => {
			window.gym3d?.say(k, `Busy line number ${i + 1}!`)
		})
	}, onScreen)
	const kinds = new Set<string>()
	for (let i = 0; i < 10; i++) {
		const bs = await bubblesNow(page)
		expect(overlapping(bs)).toBeNull()
		for (const b of bs) {
			kinds.add(b.kind)
			// on screen, below the HUD
			expect(b.x).toBeGreaterThanOrEqual(0)
			expect(b.x + b.w).toBeLessThanOrEqual(gym.width + 0.5)
			expect(b.y).toBeGreaterThan(40)
		}
		const talk = bs.filter((b) => b.kind === "speech" || b.kind === "ambient")
		expect(talk.length).toBeLessThanOrEqual(phone ? 2 : 3)
		await page.waitForTimeout(200)
	}
	expect(kinds.has("speech")).toBe(true)
	expect(kinds.has("coin")).toBe(true)
	await shot(page, "10-bubbles-crowd")

	// ── a short tap pops a line (and selects nothing) ──
	await page.waitForTimeout(6500) // the busy lines run out
	const key = onScreen[0]
	await page.evaluate((k) => window.gym3d?.say(k, "Pop me!"), key)
	await expect.poll(() => hasLine(page, "Pop me!")).toBe(true)
	await page.waitForTimeout(250) // the entry animation settles
	const pop = (await bubblesNow(page)).find((b) => b.text.includes("Pop me!"))
	if (!pop) throw new Error("no line to pop")
	await shot(page, "11-before-pop")
	const px = gym.x + pop.x + pop.w / 2
	const py = gym.y + pop.y + pop.h / 2
	if (touch) await page.touchscreen.tap(px, py)
	else await page.mouse.click(px, py)
	await page.waitForTimeout(90)
	await shot(page, "12-popping")
	await expect
		.poll(() => hasLine(page, "Pop me!"), { timeout: 4000 })
		.toBe(false)
	await expect(page.getByTestId("gym3d-chip")).toHaveCount(0)
	await expect(page.getByTestId("gym3d-sheet")).toHaveCount(0)

	// ── a drag that starts on a bubble pans the camera ──
	await page.evaluate((k) => window.gym3d?.say(k, "Drag from me"), key)
	await expect.poll(() => hasLine(page, "Drag from me")).toBe(true)
	await page.waitForTimeout(250)
	const dragB = (await bubblesNow(page)).find((b) =>
		b.text.includes("Drag from me"),
	)
	if (!dragB) throw new Error("no line to drag")
	const before = await page.evaluate(() => window.gym3d?.screenAt(13, 0, 10))
	const sx = gym.x + dragB.x + dragB.w / 2
	const sy = gym.y + dragB.y + dragB.h / 2
	await page.mouse.move(sx, sy)
	await page.mouse.down()
	await page.mouse.move(sx + 20, sy + 40, { steps: 4 })
	await page.mouse.move(sx + 40, sy + 120, { steps: 8 })
	await page.mouse.up()
	const after = await page.evaluate(() => window.gym3d?.screenAt(13, 0, 10))
	if (!before || !after) throw new Error("no screen point")
	expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(60)
	// the drag did not pop it (or tap anything under it)
	expect(
		(await page.evaluate(() => window.gym3d?.stats()))?.says,
	).toBeGreaterThan(0)
	await expect(page.getByTestId("gym3d-chip")).toHaveCount(0)
	await expect(page.getByTestId("gym3d-sheet")).toHaveCount(0)
	await page.evaluate(() => window.gym3d?.panTo(13, 10))
	await page.waitForTimeout(700)

	// ── the tap chip is a stat card: labeled rows, never body weight ──
	const npcOnScreen = async () =>
		page.evaluate(
			([w, h]) => {
				const g = window.gym3d
				if (!g) return null
				return (
					g.people().find((k) => {
						const p = g.screenOf(k)
						return (
							k.startsWith("npc:") &&
							p &&
							p.x > 50 &&
							p.x < w - 50 &&
							p.y > 260 &&
							p.y < h - 220
						)
					}) ?? null
				)
			},
			[gym.width, gym.height] as const,
		)
	const npc = (await npcOnScreen()) ?? "npc:receptionist_lisa"
	const chip = page.getByTestId("gym3d-chip")
	await tapPerson(page, npc)
	await expect(chip).toBeVisible()
	await expect(chip.locator("dt", { hasText: "Role" })).toBeVisible()
	await expect(chip.locator("dt", { hasText: "Doing" })).toBeVisible()
	// named NPCs (Talk) show the relationship too
	if (await chip.getByTestId("gym3d-talk").count())
		await expect(chip.locator("dt", { hasText: "Bond" })).toBeVisible()
	expect(await chip.textContent()).not.toMatch(/\b(kg|lbs?|weight)\b/i)
	await page.waitForTimeout(300)
	const withChip = await bubblesNow(page)
	expect(withChip.some((b) => b.kind === "info")).toBe(true)
	expect(overlapping(withChip)).toBeNull()
	await shot(page, "13-stat-card")

	// a tap outside closes it, and only that (no sheet opens)
	const out = await emptySpot(page)
	if (touch) await page.touchscreen.tap(gym.x + out.x, gym.y + out.y)
	else await page.mouse.click(gym.x + out.x, gym.y + out.y)
	await expect(chip).toHaveCount(0)
	await expect(page.getByTestId("gym3d-sheet")).toHaveCount(0)

	// a pan closes it
	const npc2 = (await npcOnScreen()) ?? npc
	await tapPerson(page, npc2)
	await expect(chip).toBeVisible()
	const from = await emptySpot(page)
	await page.mouse.move(gym.x + from.x, gym.y + from.y)
	await page.mouse.down()
	await page.mouse.move(gym.x + from.x - 50, gym.y + from.y + 20, {
		steps: 6,
	})
	await page.mouse.up()
	await expect(chip).toHaveCount(0)
	await page.evaluate(() => window.gym3d?.panTo(13, 10))
	await page.waitForTimeout(700)

	// and it closes by itself after a while
	const npc3 = (await npcOnScreen()) ?? npc
	await tapPerson(page, npc3)
	await expect(chip).toBeVisible()
	await expect(chip).toHaveCount(0, { timeout: 25_000 })

	const perf = await page.evaluate(() => window.gym3d?.stats())
	console.log("gym3d bubbles stats", JSON.stringify(perf))
	expect(errors).toEqual([])
})

test("3D gym staff: tapping a staff member shows a card and training levels them up", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { userId, admin, page } = await setup(
		request,
		browser,
		testInfo,
		700,
		"staff",
	)
	// 6pm: the staff are on the floor
	expect(
		(
			await admin.patch(`/api/admin/users/${userId}/gym/hour-override`, {
				headers: { Origin: AUTH_ORIGIN },
				data: { hour: 18 },
			})
		).ok(),
	).toBe(true)
	await page.goto("/")
	await waitReady(page)
	const staffKeys = ["npc:receptionist_lisa", "npc:trainer_marcus"]
	await page.waitForFunction(
		(want) => (window.gym3d?.people() ?? []).some((k) => want.includes(k)),
		staffKeys,
		{ timeout: 40_000 },
	)
	const keys = await page.evaluate(() => window.gym3d?.people() ?? [])
	const who = staffKeys.find((k) => keys.includes(k))
	expect(who).toBeTruthy()
	if (!who) return
	await tapPerson(page, who)
	const card = page.getByTestId("gym3d-staff-card")
	await expect(card).toBeVisible()
	await expect(page.getByTestId("gym3d-staff-level")).toHaveText("Level 1")
	await shot(page, "07-staff-card")

	const coins0 = (await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0
	await page.getByTestId("gym3d-train").click()
	await expect(page.getByTestId("gym3d-staff-level")).toHaveText("Level 2")
	await expect
		.poll(
			async () =>
				(await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0,
		)
		.toBeLessThan(coins0)
	await shot(page, "08-staff-trained")
	const cards = (await page.request.get("/api/gym/staff")).ok()
	expect(cards).toBe(true)
})

test("3D gym spots: a locked spot shows how close it is, an open one shows gear pictures", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { page } = await setup(request, browser, testInfo, 30, "spots")
	await page.goto("/")
	await waitReady(page)
	const L = await page.evaluate(() => window.gym3d?.layout())
	expect(L).toBeTruthy()
	if (!L) return
	const taken = new Set(
		L.pieces
			.filter((p) => p.roomId != null && p.spotIndex != null)
			.map((p) => `${p.roomId}:${p.spotIndex}`),
	)
	type Pick = { x: number; z: number; type: string; size: number }
	let locked: Pick | null = null
	let open: (Pick & { hasGear: boolean }) | null = null
	for (const r of L.rooms) {
		if (r.building || r.type === "lobby" || r.type === "empty") continue
		for (const s of roomSpots(r.type as EquipmentRoomType, r.cells)) {
			if (taken.has(`${r.id}:${s.index}`)) continue
			const where = { x: s.x, z: s.z, type: r.type, size: s.size }
			if (r.level < s.unlock) locked ??= where
			else if (!open) {
				const hasGear =
					L.lockedGear.some(
						(g) => g.roomType === r.type && g.size === s.size,
					) ||
					L.pieces.some(
						(p) =>
							p.status === "stored" &&
							p.roomType === r.type &&
							p.size === s.size,
					)
				open = { ...where, hasGear }
			}
		}
	}

	const tapAt = async (x: number, z: number) => {
		await page.evaluate(([a, c]) => window.gym3d?.panTo(a, c), [x, z] as const)
		await page.waitForTimeout(700)
		const pt = await page.evaluate(
			([a, c]) => window.gym3d?.screenAt(a, 0.05, c) ?? null,
			[x, z] as const,
		)
		const box = await page.locator("[data-testid=gym3d]").boundingBox()
		if (!pt || !box) throw new Error("no gym")
		await page.mouse.click(box.x + pt.x, box.y + pt.y)
	}
	const sheet = page.getByTestId("gym3d-sheet")

	// a locked spot: points of the room towards the level it needs
	expect(locked).toBeTruthy()
	if (locked) {
		await tapAt(locked.x, locked.z)
		await expect(sheet).toHaveAttribute("data-sheet", "spot")
		await expect(page.getByTestId("gym3d-spot-progress")).toContainText(
			"points for Lv",
		)
		await shot(page, "09-locked-spot")
		await page.getByRole("button", { name: "Close" }).click()
	}

	// an open empty spot: every machine that fits has a picture
	expect(open).toBeTruthy()
	if (open?.hasGear) {
		const gpu = () =>
			page.evaluate(() => {
				const st = window.gym3d?.stats()
				return { geometries: st?.geometries ?? 0, textures: st?.textures ?? 0 }
			})
		await tapAt(open.x, open.z)
		await expect(sheet).toHaveAttribute("data-sheet", "spot")
		const pics = page.getByTestId("gym3d-gearpic")
		await expect(pics.first()).toBeVisible()
		const src = await pics.first().getAttribute("src")
		expect(src).toMatch(/^data:image\/png/)
		await shot(page, "10-gear-previews")
		// the pictures are drawn once: opening the sheet again allocates no
		// new models (a re-draw would add dozens of geometries)
		const once = await gpu()
		await page.getByRole("button", { name: "Close" }).click()
		// (a member may walk over the spot: try the tap again)
		for (let i = 0; i < 4; i++) {
			await tapAt(open.x, open.z)
			if (
				await pics
					.first()
					.isVisible({ timeout: 2500 })
					.catch(() => false)
			)
				break
			await page.waitForTimeout(1200)
		}
		await expect(pics.first()).toBeVisible()
		const again = await gpu()
		expect(again.geometries).toBe(once.geometries)
		// a new member's outfit print may add a texture meanwhile
		expect(again.textures).toBeLessThanOrEqual(once.textures + 2)
	}
})

test("3D gym hustle: tapping a working member until they finish pays a small coin bonus", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(240_000)
	const { userId, admin, page } = await setup(
		request,
		browser,
		testInfo,
		30,
		"hustle",
	)
	// 6pm: the gym is busy, so someone is working out
	expect(
		(
			await admin.patch(`/api/admin/users/${userId}/gym/hour-override`, {
				headers: { Origin: AUTH_ORIGIN },
				data: { hour: 18 },
			})
		).ok(),
	).toBe(true)
	await page.goto("/")
	await waitReady(page)
	const L = await page.evaluate(() => window.gym3d?.layout())
	if (!L) throw new Error("no layout")
	const centers = L.rooms
		.filter((r) => !r.building && r.type !== "empty")
		.map((r) => ({
			x: r.cells[0].px * PW + PW / 2,
			z: r.cells[0].pz * PD + PD / 2,
		}))
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")

	// find a member who is working out and on screen
	const findWorker = async (): Promise<string | null> => {
		for (const c of centers) {
			await page.evaluate(([a, b]) => window.gym3d?.panTo(a, b), [
				c.x,
				c.z,
			] as const)
			await page.waitForTimeout(500)
			const key = await page.evaluate(
				({ w, h }) => {
					const g = window.gym3d
					for (const k of g?.people() ?? []) {
						if (!k.startsWith("member:")) continue
						const doing = g?.info(k)?.doing ?? ""
						if (!doing || /move|home/i.test(doing)) continue
						const pt = g?.screenOf(k)
						if (
							pt &&
							pt.x > 20 &&
							pt.x < w - 20 &&
							pt.y > 120 &&
							pt.y < h - 160
						)
							return k
					}
					return null
				},
				{ w: box.width, h: box.height },
			)
			if (key) return key
		}
		return null
	}
	let who: string | null = null
	for (let i = 0; i < 12 && !who; i++) {
		who = await findWorker()
		if (!who) await page.waitForTimeout(2500)
	}
	expect(who).toBeTruthy()
	if (!who) return

	const coins0 = (await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0
	// the first tap opens their machine; quick taps after it hurry them along
	// (tapped through the gym's own hook, in one go, so the gaps between taps
	// do not depend on how slowly a software renderer draws frames)
	await page.evaluate(async (k) => {
		const g = window.gym3d
		for (let i = 0; i < 12; i++) {
			const pt = g?.screenOf(k)
			if (!pt) break
			g?.tap(pt.x, pt.y)
			await new Promise((r) => setTimeout(r, 100))
		}
	}, who)
	await shot(page, "11-hustled")
	await expect
		.poll(
			async () =>
				(await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0,
			{
				timeout: 15_000,
			},
		)
		.toBeGreaterThan(coins0)
})

/** Taps a room's floor (a few points: a member may stand on one) until its
 * menu opens. */
async function openRoomMenu(
	page: Page,
	room: { cells: { px: number; pz: number }[] },
) {
	const cx = room.cells[0].px * PW + PW / 2
	const cz = room.cells[0].pz * PD + PD / 2
	const sheet = page.getByTestId("gym3d-sheet")
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")
	for (const [dx, dz] of [
		[0, 0],
		[0.4, 0],
		[-0.4, 0.1],
		[0, -0.2],
	]) {
		await page.evaluate(([a, b]) => window.gym3d?.panTo(a, b), [
			cx,
			cz,
		] as const)
		await page.waitForTimeout(600)
		const pt = await page.evaluate(
			([a, b]) => window.gym3d?.screenAt(a, 0.02, b) ?? null,
			[cx + dx, cz + dz] as const,
		)
		if (!pt) continue
		await page.mouse.click(box.x + pt.x, box.y + pt.y)
		const on = await sheet
			.getAttribute("data-sheet", { timeout: 1500 })
			.catch(() => null)
		if (on === "room") break
	}
	await expect(sheet).toHaveAttribute("data-sheet", "room")
}

test("3D gym walls: knocking out a wall between two rooms joins them and scores", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { page } = await setup(request, browser, testInfo, 30, "walls")
	await page.goto("/")
	await waitReady(page)
	const L0 = await page.evaluate(() => window.gym3d?.layout())
	if (!L0) throw new Error("no layout")
	expect(L0.openWalls).toEqual([])
	const room = L0.rooms.find(
		(r) => r.type !== "lobby" && r.type !== "empty" && !r.building,
	)
	expect(room).toBeTruthy()
	if (!room) return
	await openRoomMenu(page, room)
	await page.getByTestId("room-walls").click()
	await expect(page.getByTestId("room-walls-list")).toBeVisible()
	await shot(page, "12-walls-menu")

	await page.getByTestId("gym3d-open-wall").first().click()
	await expect
		.poll(
			async () =>
				(await page.evaluate(() => window.gym3d?.layout().openWalls.length)) ??
				0,
		)
		.toBe(1)
	const L1 = await page.evaluate(() => window.gym3d?.layout())
	expect(L1?.nextWallCost).toBeGreaterThan(L0.nextWallCost)
	expect(L1?.coins).toBeLessThan(L0.coins)
	await page.waitForTimeout(600)
	await shot(page, "13-wall-open")
})

test("3D gym hiring: a hire walks in, stands in the room and can be trained", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { page } = await setup(request, browser, testInfo, 30, "hire")
	await page.goto("/")
	await waitReady(page)
	const L0 = await page.evaluate(() => window.gym3d?.layout())
	if (!L0) throw new Error("no layout")
	expect(L0.hires).toEqual([])
	const room = L0.rooms.find(
		(r) => r.type !== "lobby" && r.type !== "empty" && !r.building,
	)
	expect(room).toBeTruthy()
	if (!room) return

	await openRoomMenu(page, room)
	await page.getByTestId("room-staff").click()
	await page.getByTestId("gym3d-hire").click()
	await expect
		.poll(
			async () =>
				(await page.evaluate(() => window.gym3d?.layout().hires.length)) ?? 0,
		)
		.toBe(1)
	const L1 = await page.evaluate(() => window.gym3d?.layout())
	const hired = L1?.hires[0]
	expect(hired?.roomId).toBe(room.id)
	expect(L1?.coins).toBeLessThan(L0.coins)
	await shot(page, "14-hired")

	// they are in the gym: tap them for the staff card, then train them
	const key = `hire:${hired?.id}`
	await expect
		.poll(async () =>
			page.evaluate((k) => (window.gym3d?.people() ?? []).includes(k), key),
		)
		.toBe(true)
	await page.evaluate(() => window.gym3d?.lineup(false))
	await page.getByRole("button", { name: "Close" }).click()
	// walk in: wait for them to reach their post, then tap them
	await page.waitForTimeout(6000)
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")
	let card = false
	for (let i = 0; i < 6 && !card; i++) {
		const pt = await page.evaluate(
			(k) => window.gym3d?.screenOf(k) ?? null,
			key,
		)
		if (pt) await page.mouse.click(box.x + pt.x, box.y + pt.y)
		card = await page
			.getByTestId("gym3d-staff-card")
			.isVisible()
			.catch(() => false)
		if (!card) await page.waitForTimeout(1500)
	}
	expect(card).toBe(true)
	await expect(page.getByTestId("gym3d-staff-level")).toHaveText("Level 1")
	await page.getByTestId("gym3d-train").click()
	await expect(page.getByTestId("gym3d-staff-level")).toHaveText("Level 2")
	await shot(page, "15-hire-trained")
})

test("3D gym customize: a style repaints the room and a vibe tints its floor", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { page } = await setup(request, browser, testInfo, 30, "style")
	await page.goto("/")
	await waitReady(page)
	const L0 = await page.evaluate(() => window.gym3d?.layout())
	if (!L0) throw new Error("no layout")
	const room = L0.rooms.find(
		(r) => r.type !== "lobby" && r.type !== "empty" && !r.building,
	)
	expect(room).toBeTruthy()
	if (!room) return

	await openRoomMenu(page, room)
	await page.getByTestId("room-customize").click()
	await page.getByTestId("room-style-zen").click()
	await expect
		.poll(async () =>
			page.evaluate(
				(id) =>
					window.gym3d?.layout().rooms.find((r) => r.id === id)?.paint.wall,
				room.id,
			),
		)
		.toBe("#fff1e0")

	const coins0 = (await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0
	await page.getByTestId("room-vibe-hype").click()
	await expect
		.poll(async () =>
			page.evaluate(
				(id) => window.gym3d?.layout().rooms.find((r) => r.id === id)?.vibe,
				room.id,
			),
		)
		.toBe("hype")
	expect(
		(await page.evaluate(() => window.gym3d?.layout().coins)) ?? 0,
	).toBeLessThan(coins0)
	await page.waitForTimeout(800)
	await shot(page, "16-style-vibe")
	// with the sheet closed, the room shows its new look and glow
	await page.getByRole("button", { name: "Close" }).click()
	await page.waitForTimeout(800)
	await shot(page, "17-style-vibe-room")
})

test("3D gym cosmetics: an owned lantern goes on show in a room and comes down", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(180_000)
	const { userId, page } = await setup(request, browser, testInfo, 30, "cosm")
	// the gym owns a lantern (as after day 7 of October's track)
	const conn = await mysql.createConnection(DB_URL)
	try {
		const [rows] = await conn.execute(
			"SELECT id FROM user_gyms WHERE user_id = ?",
			[userId],
		)
		const gymId = (rows as { id: number }[])[0].id
		await conn.execute(
			"INSERT INTO gym_cosmetics (gym_id, cosmetic_key, source) VALUES (?, ?, ?), (?, ?, ?)",
			[gymId, "halloween_lantern", "e2e", gymId, "halloween_hat", "e2e"],
		)
	} finally {
		await conn.end()
	}
	await page.goto("/")
	await waitReady(page)
	// the coach wears the owned witch hat
	await expect(
		page.locator('[data-testid=coach] ellipse[fill="#3b2a55"]'),
	).toHaveCount(1)
	const L0 = await page.evaluate(() => window.gym3d?.layout())
	const room = L0?.rooms.find(
		(r) => r.type !== "lobby" && r.type !== "empty" && !r.building,
	)
	if (!room) throw new Error("no room")

	await openRoomMenu(page, room)
	await page.getByTestId("room-customize").click()
	await page.getByTestId("cosmetic-place-halloween_lantern").click()
	await expect
		.poll(async () =>
			page.evaluate(() =>
				window.gym3d
					?.layout()
					.pieces.some((p) => p.upgradeKey === "cosmetic:halloween_lantern"),
			),
		)
		.toBe(true)
	await page.waitForTimeout(800)
	await shot(page, "18-lantern-placed")
	await page.getByTestId("cosmetic-remove-halloween_lantern").click()
	await expect
		.poll(async () =>
			page.evaluate(() =>
				window.gym3d
					?.layout()
					.pieces.some((p) => p.upgradeKey === "cosmetic:halloween_lantern"),
			),
		)
		.toBe(false)
})

test("3D gym ghost: the October ghost floats in the lobby (forced on with ?ghost=1)", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(150_000)
	const { page } = await setup(request, browser, testInfo, 30, "ghost")
	await page.goto("/?ghost=1")
	await waitReady(page)
	await expect
		.poll(async () => page.evaluate(() => window.gym3d?.stats().ghost))
		.toBe(1)
	await page.waitForTimeout(1200)
	await shot(page, "19-ghost")
	// and off again with ?ghost=0
	await page.goto("/?ghost=0")
	await waitReady(page)
	expect(await page.evaluate(() => window.gym3d?.stats().ghost)).toBe(0)
})
