import {
	type APIRequestContext,
	type Browser,
	expect,
	type Page,
	request as pwRequest,
	type TestInfo,
	test,
} from "@playwright/test"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

// Tap feedback and the room action menu (gym polish G9, #136), plus the
// event / class tags in the bubble layout (#137): a tap on a room opens its
// menu (never paint first), Customize reaches paint, every tap shows a
// marker and a ripple, a drag never selects anything, and the 6pm class
// banner stays inside the screen and clear of bubbles. GYM3D_SHOTS=<dir>
// saves screenshots.

const SHOTS = process.env.GYM3D_SHOTS ?? ""

async function shot(page: Page, name: string) {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/tap-${name}.png` })
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

/** A new member with `days` of progress at 6pm, and a phone page. */
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
	const me = await (await request.get("/api/users/me", hdr)).json()
	const userId = (me.id ?? me.user?.id) as string
	const admin = await adminContext(baseURL)
	expect(
		(
			await admin.post(`/api/admin/users/${userId}/gym/progression`, {
				...hdr,
				data: { daysElapsed: days },
			})
		).ok(),
	).toBe(true)
	// 6pm: the boxing class is on and the cast is in
	expect(
		(
			await admin.patch(`/api/admin/users/${userId}/gym/hour-override`, {
				...hdr,
				data: { hour: 18 },
			})
		).ok(),
	).toBe(true)
	const context = await browser.newContext({
		baseURL,
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

type Sel = { kind: string; roomId?: number } | null

/** Frames a room and finds a canvas point on it that a tap would read as
 * the room itself (its floor or wall: no person or gear in the way). */
async function roomPoint(
	page: Page,
	roomId: number,
): Promise<{ x: number; y: number }> {
	const L = await page.evaluate(() => window.gym3d?.layout())
	const r = L?.rooms.find((q) => q.id === roomId)
	if (!r) throw new Error(`no room ${roomId}`)
	const c = r.cells[0]
	await page.evaluate(([x, z]) => window.gym3d?.panTo(x, z), [
		c.px * 9 + 4.5,
		c.pz * 6 + 3,
	] as const)
	await page.waitForTimeout(800)
	// floor points around the room's edges (spots fill the middle), the
	// back first: it stays in view above the menu sheet
	const pts: [number, number][] = []
	for (const [fx, fz] of [
		[0.5, 0.12],
		[0.2, 0.15],
		[0.8, 0.15],
		[0.08, 0.5],
		[0.92, 0.5],
		[0.08, 0.85],
		[0.92, 0.85],
		[0.5, 0.92],
		[0.3, 0.9],
		[0.7, 0.9],
	])
		pts.push([c.px * 9 + fx * 9, c.pz * 6 + fz * 6])
	// then anywhere on a grid over the cell
	for (let fx = 0.1; fx < 1; fx += 0.2)
		for (let fz = 0.1; fz < 1; fz += 0.2)
			pts.push([c.px * 9 + fx * 9, c.pz * 6 + fz * 6])
	for (const [x, z] of pts) {
		const res = await page.evaluate(
			([x, z, id]) => {
				const g = window.gym3d
				if (!g) return null
				const p = g.screenAt(x, 0.02, z)
				const host = document.querySelector("[data-testid=gym3d]")
				if (!host) return null
				const b = host.getBoundingClientRect()
				if (p.x < 30 || p.x > b.width - 30 || p.y < 140 || p.y > b.height - 170)
					return null
				const hit = document.elementFromPoint(b.left + p.x, b.top + p.y)
				if (hit?.tagName !== "CANVAS") return null
				const s = g.pick(p.x, p.y) as Sel
				return s?.kind === "room" && s.roomId === id ? p : null
			},
			[x, z, roomId] as const,
		)
		if (res) return res
	}
	throw new Error(`no clear point on room ${roomId}`)
}

async function tapAt(page: Page, touch: boolean, x: number, y: number) {
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")
	if (touch) await page.touchscreen.tap(box.x + x, box.y + y)
	else await page.mouse.click(box.x + x, box.y + y)
}

const stats = (page: Page) => page.evaluate(() => window.gym3d?.stats())

/** Taps a room as a player does and waits for its tap feedback. An NPC's
 * line can pop up over the point between finding it and the tap (the tap
 * then pops the line, as it should): find a point and try again. */
async function tapRoom(page: Page, touch: boolean, roomId: number) {
	for (let i = 0; i < 5; i++) {
		const p = await roomPoint(page, roomId)
		const n0 = (await stats(page))?.taps ?? 0
		await tapAt(page, touch, p.x, p.y)
		const ok = await expect
			.poll(async () => (await stats(page))?.taps, { timeout: 2500 })
			.toBe(n0 + 1)
			.then(
				() => true,
				() => false,
			)
		// a tap that popped a speech line (or hit a person) counts as a tap but
		// does not select the room: try another point
		if (ok && (await stats(page))?.mark === "outline") return p
	}
	throw new Error(`room ${roomId} never took a tap`)
}

test("3D gym: tap feedback, the room menu, Customize, and drags never select", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(300_000)
	const { page } = await setup(request, browser, testInfo, 700, "tap")
	const touch = !!testInfo.project.use.hasTouch
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(e.message))
	await page.goto("/")
	await waitReady(page)
	if (await page.getByTestId("welcome-back").count())
		await page.getByRole("button", { name: "Later" }).click()
	await page.waitForTimeout(800)
	const sheet = page.getByTestId("gym3d-sheet")

	const L = await page.evaluate(() => window.gym3d?.layout())
	const room =
		L?.rooms.find((r) => r.type === "cardio" && !r.building) ??
		L?.rooms.find(
			(r) => r.type !== "lobby" && r.type !== "empty" && !r.building,
		)
	expect(room).toBeTruthy()
	if (!room) return

	// idle: nothing marked, and the draw calls to compare with
	expect((await stats(page))?.mark).toBeNull()
	const calls0 = (await stats(page))?.drawCalls ?? 0

	// ── a tap on the room: the action menu, a marker, a ripple ──
	// (one tap feedback played: a counter, since a slow headless frame rate
	// can finish the ripple itself before the test looks)
	await tapRoom(page, touch, room.id)
	await shot(page, "01-ripple")
	expect((await stats(page))?.mark).toBe("outline")
	await expect(sheet).toHaveAttribute("data-sheet", "room")
	await expect(page.getByTestId("room-menu")).toBeVisible()
	await expect(page.getByTestId("room-info")).toBeVisible()
	for (const id of ["room-gear", "room-staff", "room-customize"])
		await expect(page.getByTestId(id)).toBeVisible()
	// never paint first
	await expect(page.locator(".g3d-sheet .sw2")).toHaveCount(0)
	await shot(page, "02-room-menu")
	// the ripple ends; the marker stays while the room is selected. It is
	// one mesh: draw calls stay near idle (and in the phone budget); they
	// move a little anyway as people walk in and out of view
	await expect.poll(async () => (await stats(page))?.rippling).toBe(false)
	const calls1 = (await stats(page))?.drawCalls ?? 0
	console.log(`gym3d tap draw calls: idle ${calls0}, room selected ${calls1}`)
	expect(calls1 - calls0).toBeLessThan(20)
	// the phone budget: a fully built gym with the street (cars, bus, shops)
	// is about 265 draw calls; it was 250 before the street was added
	if (testInfo.project.use.isMobile) {
		expect(calls0).toBeLessThan(300)
		expect(calls1).toBeLessThan(300)
	}

	// ── Customize reaches paint (and Back returns to the menu) ──
	await page.getByTestId("room-customize").click()
	await expect(sheet).toHaveAttribute("data-sheet", "paint")
	await expect(page.locator(".g3d-sheet .sw2").first()).toBeVisible()
	await page.waitForTimeout(300)
	await shot(page, "03-customize")
	const wall0 = room.paint.wall
	const swatch = page.locator(".g3d-sheet .sw2:not(.on)").first()
	await swatch.click()
	await expect
		.poll(async () => {
			const l = await page.evaluate(() => window.gym3d?.layout())
			return l?.rooms.find((r) => r.id === room.id)?.paint.wall
		})
		.not.toBe(wall0)
	await page.getByTestId("room-back").click()
	await expect(sheet).toHaveAttribute("data-sheet", "room")

	// ── Upgrade gear lists the room's pieces; a piece opens its sheet ──
	await page.getByTestId("room-gear").click()
	await expect(sheet).toHaveAttribute("data-sheet", "room-gear")
	await expect(page.getByTestId("room-gear-list")).toBeVisible()
	await page.waitForTimeout(300)
	await shot(page, "04-upgrade-gear")
	const gearBtn = page.getByTestId("room-gear-piece").first()
	if (await gearBtn.count()) {
		await gearBtn.click()
		await expect(sheet).toHaveAttribute("data-sheet", "piece")
		await expect.poll(async () => (await stats(page))?.mark).toBe("ring")
	}

	// ── Staff shows what exists today ──
	await page.getByRole("button", { name: "Close" }).click()
	await expect(sheet).toHaveCount(0)
	await expect.poll(async () => (await stats(page))?.mark).toBeNull()
	await tapRoom(page, touch, room.id)
	await expect(sheet).toHaveAttribute("data-sheet", "room")
	await page.getByTestId("room-staff").click()
	await expect(sheet).toHaveAttribute("data-sheet", "room-staff")
	await expect(page.getByTestId("room-staff-list")).toBeVisible()
	await page.getByRole("button", { name: "Close" }).click()
	await expect(sheet).toHaveCount(0)

	// ── a drag is never a tap: from a room, from a person ──
	const pt3 = await roomPoint(page, room.id)
	const box = await page.locator("[data-testid=gym3d]").boundingBox()
	if (!box) throw new Error("no gym")
	const drag = async (x: number, y: number, dx: number, dy: number) => {
		await page.mouse.move(box.x + x, box.y + y)
		await page.mouse.down()
		await page.mouse.move(box.x + x + dx / 2, box.y + y + dy / 2, {
			steps: 3,
		})
		await page.mouse.move(box.x + x + dx, box.y + y + dy, { steps: 3 })
		await page.mouse.up()
		await page.waitForTimeout(250)
		await expect(sheet).toHaveCount(0)
		await expect(page.getByTestId("gym3d-chip")).toHaveCount(0)
		expect((await stats(page))?.mark).toBeNull()
	}
	// a short drag, just past the pan threshold, and a long one (each from
	// the room again: a drag pans the view, and a held press on gear is the
	// deliberate hold-to-move)
	await drag(pt3.x, pt3.y, 9, 0)
	const pt4 = await roomPoint(page, room.id)
	await drag(pt4.x, pt4.y, 60, 40)
	// and one that ends back where it began (it panned: still not a tap)
	const pt5 = await roomPoint(page, room.id)
	await page.mouse.move(box.x + pt5.x, box.y + pt5.y)
	await page.mouse.down()
	await page.mouse.move(box.x + pt5.x + 40, box.y + pt5.y, { steps: 4 })
	await page.mouse.move(box.x + pt5.x, box.y + pt5.y, { steps: 4 })
	await page.mouse.up()
	await page.waitForTimeout(250)
	await expect(sheet).toHaveCount(0)
	expect((await stats(page))?.mark).toBeNull()
	// from a person
	const who = await page.evaluate(() => {
		const g = window.gym3d
		const host = document.querySelector("[data-testid=gym3d]")
		if (!g || !host) return null
		const b = host.getBoundingClientRect()
		// a named NPC: a press on a member working out lands on their gear,
		// where holding still is the deliberate hold-to-move
		for (const k of g.people()) {
			if (!k.startsWith("npc:")) continue
			const p = g.screenOf(k)
			if (
				p &&
				p.x > 60 &&
				p.x < b.width - 60 &&
				p.y > 200 &&
				p.y < b.height - 260
			)
				return p
		}
		return null
	})
	if (who) await drag(who.x, who.y, -50, 30)

	// ── a tap on a person: a ring follows them ──
	if (who) {
		const p2 = await page.evaluate(() => {
			const g = window.gym3d
			const host = document.querySelector("[data-testid=gym3d]")
			if (!g || !host) return null
			const b = host.getBoundingClientRect()
			for (const k of g.people()) {
				if (!k.startsWith("npc:")) continue
				const p = g.screenOf(k)
				if (
					p &&
					p.x > 60 &&
					p.x < b.width - 60 &&
					p.y > 200 &&
					p.y < b.height - 260
				)
					return p
			}
			return null
		})
		if (p2) {
			await tapAt(page, touch, p2.x, p2.y)
			await expect(page.getByTestId("gym3d-chip")).toBeVisible()
			expect((await stats(page))?.mark).toBe("ring")
		}
	}
	if (SHOTS) {
		// the ripple lasts half a second and a headless run draws a few frames
		// a second: tap through the hook and shoot straight away
		await page.evaluate(() => window.gym3d?.tap(4, 4))
		await page.waitForTimeout(300)
		const p = await roomPoint(page, room.id)
		await page.evaluate(([x, y]) => window.gym3d?.tap(x, y), [
			p.x,
			p.y,
		] as const)
		await page.screenshot({ path: `${SHOTS}/tap-01b-ripple.png` })
	}
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

test("3D gym: the class banner stays on screen and clear of bubbles", async ({
	request,
	browser,
}, testInfo) => {
	test.setTimeout(300_000)
	const { page } = await setup(request, browser, testInfo, 700, "banner")
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(e.message))
	await page.goto("/")
	await waitReady(page)
	if (await page.getByTestId("welcome-back").count())
		await page.getByRole("button", { name: "Later" }).click()
	const banner = page.getByTestId("gym3d-class")
	await expect(banner).toContainText("Boxing")
	const L = await page.evaluate(() => window.gym3d?.layout())
	const boxing = L?.rooms.find((r) => r.type === "boxing")
	expect(boxing).toBeTruthy()
	if (!boxing) return
	const c = boxing.cells[0]
	const cx = c.px * 9 + 4.5
	const cz = c.pz * 6 + 3
	const vw = await page.evaluate(() => innerWidth)
	// slide the room across the screen: whenever the banner shows, all of
	// it is inside the screen (it is clamped, never cut off at an edge)
	let seen = 0
	for (const [dx, dz] of [
		[0, 0],
		[4, -4],
		[-4, 4],
		[7, -7],
		[-7, 7],
		[3, 3],
		[-3, -3],
		[9, -9],
		[-9, 9],
	]) {
		await page.evaluate(([x, z]) => window.gym3d?.panTo(x, z), [
			cx + dx,
			cz + dz,
		] as const)
		await page.waitForTimeout(650)
		if (!(await banner.isVisible())) continue
		const r = await banner.boundingBox()
		if (!r) continue
		seen++
		expect(r.x).toBeGreaterThanOrEqual(0)
		expect(r.x + r.width).toBeLessThanOrEqual(vw + 0.5)
		const bs = (await page.evaluate(
			() => window.gym3d?.bubbles() ?? [],
		)) as Box[]
		expect(overlapping(bs)).toBeNull()
	}
	expect(seen).toBeGreaterThanOrEqual(3)

	// a crowd: lines over the class people, coins, the banner and the event
	await page.evaluate(([x, z]) => window.gym3d?.panTo(x, z), [cx, cz] as const)
	await page.waitForTimeout(700)
	await page.evaluate(() => {
		const g = window.gym3d
		if (!g) return
		const keys = g
			.people()
			.filter((k) => k.startsWith("class:") || k.startsWith("npc:"))
		keys.slice(0, 4).forEach((k, i) => {
			g.say(
				k,
				[
					"Jab, jab, cross!",
					"Keep those hands up!",
					"Feel the burn!",
					"One more round!",
				][i],
			)
		})
	})
	for (let i = 0; i < 8; i++) {
		const bs = (await page.evaluate(
			() => window.gym3d?.bubbles() ?? [],
		)) as Box[]
		expect(overlapping(bs)).toBeNull()
		expect(bs.some((b) => b.kind === "tag")).toBe(true)
		for (const b of bs) {
			expect(b.x).toBeGreaterThanOrEqual(0)
			expect(b.x + b.w).toBeLessThanOrEqual(vw + 0.5)
		}
		if (i === 2) await shot(page, "05-crowd-banner")
		await page.waitForTimeout(250)
	}
	expect(errors).toEqual([])
})
