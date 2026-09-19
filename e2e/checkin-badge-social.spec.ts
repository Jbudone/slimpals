import { expect, test } from "@playwright/test"
import mysql from "mysql2/promise"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

const DB_URL =
	process.env.DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals"

function startOfDayUtc(offsetDays: number): Date {
	const d = new Date()
	d.setUTCHours(0, 0, 0, 0)
	d.setUTCDate(d.getUTCDate() + offsetDays)
	return d
}

test("checkin crossing a badge threshold shows the badge and posts to the feed", async ({
	request,
	browser,
}) => {
	// ── Setup (API + direct DB — the real UI action under test is the final checkin) ──
	const inviteCode = await mintInviteCode(request)

	const runId = Date.now()
	const uniqueEmail = `e2e-checkin-${runId}@slimpals.test`
	const uniqueName = `Checkin Badge Tester ${runId}`
	await registerUser(request, {
		name: uniqueName,
		email: uniqueEmail,
		password: "E2ePassword1!",
		inviteCode,
	})

	const meRes = await request.get("/api/users/me", {
		headers: { Origin: AUTH_ORIGIN },
	})
	expect(meRes.ok()).toBeTruthy()
	const userId = (await meRes.json()).id as string

	// Seed 2 consecutive prior days (ending yesterday, not today) so today's
	// real UI checkin is the 3rd consecutive day, crossing the streak_3
	// badge threshold. The admin seed endpoint always seeds through today,
	// which would leave nothing for the UI action to do — so this inserts
	// directly instead.
	const conn = await mysql.createConnection(DB_URL)
	try {
		await conn.execute(
			"INSERT INTO daily_checkins (user_id, date, streak_count) VALUES (?, ?, ?), (?, ?, ?)",
			[userId, startOfDayUtc(-2), 1, userId, startOfDayUtc(-1), 2],
		)
	} finally {
		await conn.end()
	}

	// ── The actual behavior under test, through the real UI ──
	const storageState = await request.storageState()
	const context = await browser.newContext({ storageState })
	const page = await context.newPage()

	await page.goto("/")
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()

	await page.getByRole("button", { name: "Check in now" }).click()
	await expect(page.getByText(/Checked in!/i)).toBeVisible()

	await page.goto("/badges")
	const badgeCard = page.locator(".ui-pill", { hasText: "3-Day Streak" })
	await expect(badgeCard).toBeVisible()

	await page.goto("/social")
	// Scoped by author name too — the feed is shared across all users, so
	// repeated e2e runs otherwise accumulate multiple matching posts.
	const myPost = page
		.locator(".ui-card", { hasText: uniqueName })
		.filter({ hasText: "3-Day Streak" })
	await expect(myPost).toBeVisible()

	await context.close()
})
