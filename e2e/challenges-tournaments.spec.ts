import { expect, test } from "@playwright/test"
import mysql from "mysql2/promise"
import { AUTH_ORIGIN, mintInviteCode, registerUser } from "./helpers.js"

const DB_URL =
	process.env.DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals"

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(n: number): Date {
	return new Date(Date.now() - n * DAY_MS)
}

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10)
}

async function getGymXp(
	request: import("@playwright/test").APIRequestContext,
): Promise<number> {
	const res = await request.get("/api/gym", {
		headers: { Origin: AUTH_ORIGIN },
	})
	expect(res.ok()).toBeTruthy()
	const body = await res.json()
	return body.gym.xp as number
}

async function getUserId(
	request: import("@playwright/test").APIRequestContext,
): Promise<string> {
	const res = await request.get("/api/users/me", {
		headers: { Origin: AUTH_ORIGIN },
	})
	expect(res.ok()).toBeTruthy()
	return (await res.json()).id as string
}

test("completing a monthly challenge shows the celebration, awards the badge, and grants 200 gym XP", async ({
	request,
	browser,
}) => {
	const inviteCode = await mintInviteCode(request)
	const runId = Date.now()
	const uniqueEmail = `e2e-challenge-${runId}@slimpals.test`
	await registerUser(request, {
		name: `Challenge Tester ${runId}`,
		email: uniqueEmail,
		password: "E2ePassword1!",
		inviteCode,
	})

	const xpBefore = await getGymXp(request)

	// Seed a challenge row directly for the current month/year — bypassing the
	// AI-backed /challenges/generate endpoint (slow/nondeterministic, and not
	// what this scenario is testing). Challenges are global (not per-user), so
	// clear out any pre-existing row for this month/year first to keep the
	// scenario deterministic across repeated e2e runs.
	const now = new Date()
	const month = now.getUTCMonth() + 1
	const year = now.getUTCFullYear()
	const goals = [
		{
			id: "goal_hydrate",
			title: "Drink water",
			description: "Stay hydrated",
			target: 1,
			unit: "times",
			dailyAmount: 1,
			dailyPrompt: "Log a glass of water",
		},
		{
			id: "goal_move",
			title: "Move your body",
			description: "Get active",
			target: 1,
			unit: "times",
			dailyAmount: 1,
			dailyPrompt: "Log a workout",
		},
	]

	const conn = await mysql.createConnection(DB_URL)
	try {
		await conn.execute(
			"DELETE FROM user_challenges WHERE challenge_id IN (SELECT id FROM challenges WHERE month = ? AND year = ?)",
			[month, year],
		)
		await conn.execute("DELETE FROM challenges WHERE month = ? AND year = ?", [
			month,
			year,
		])
		await conn.execute(
			"INSERT INTO challenges (title, description, month, year, theme, ai_generated, tasks) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[
				`E2E Challenge ${runId}`,
				"Seeded directly for e2e coverage",
				month,
				year,
				"e2e",
				false,
				JSON.stringify(goals),
			],
		)
	} finally {
		await conn.end()
	}

	const storageState = await request.storageState()
	const context = await browser.newContext({ storageState })
	const page = await context.newPage()

	await page.goto("/challenges")
	await expect(
		page.getByRole("button", { name: "Join Challenge" }),
	).toBeVisible()
	await page.getByRole("button", { name: "Join Challenge" }).click()

	for (const goal of goals) {
		const card = page.locator(".ui-card", { hasText: goal.title })
		await card.getByRole("button", { name: goal.dailyPrompt }).click()
		await expect(card.locator(".done-badge")).toBeVisible()
	}

	await expect(page.getByText("Challenge Complete!")).toBeVisible()

	await page.goto("/badges")
	await expect(
		page.locator(".badge-card.earned", { hasText: "Challenge Accepted" }),
	).toBeVisible()

	const xpAfter = await getGymXp(request)
	expect(xpAfter - xpBefore).toBe(200)

	await context.close()
})

test("completing a weekly sprint shows the completion message and grants 50 gym XP", async ({
	request,
	browser,
}) => {
	const inviteCode = await mintInviteCode(request)
	const runId = Date.now()
	const uniqueEmail = `e2e-sprint-${runId}@slimpals.test`
	await registerUser(request, {
		name: `Sprint Tester ${runId}`,
		email: uniqueEmail,
		password: "E2ePassword1!",
		inviteCode,
	})

	const userId = await getUserId(request)
	const xpBefore = await getGymXp(request)

	// Monday of the current UTC week, mirroring getMondayOfWeek() in
	// server/routes/sprints.ts, so the seeded row matches what /sprints/current
	// looks up. Sprints are per-user, so no cross-run cleanup is needed.
	const weekStart = new Date()
	weekStart.setUTCHours(0, 0, 0, 0)
	const day = weekStart.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	weekStart.setUTCDate(weekStart.getUTCDate() - diff)

	const tasks = [
		{ id: "task_meals", title: "Log 3 meals this week" },
		{ id: "task_checkins", title: "Check in 3 times" },
	]

	const conn = await mysql.createConnection(DB_URL)
	try {
		await conn.execute(
			"INSERT INTO sprints (user_id, week_start, title, tasks) VALUES (?, ?, ?, ?)",
			[userId, weekStart, `E2E Sprint ${runId}`, JSON.stringify(tasks)],
		)
	} finally {
		await conn.end()
	}

	const storageState = await request.storageState()
	const context = await browser.newContext({ storageState })
	const page = await context.newPage()

	await page.goto("/challenges")
	await expect(page.getByText(`E2E Sprint ${runId}`)).toBeVisible()

	for (const t of tasks) {
		const item = page.locator(".sprint-task", { hasText: t.title })
		await item.locator(".sprint-task-btn").click()
		await expect(item).toHaveClass(/checked/)
	}

	await expect(page.getByText(/Sprint complete/i)).toBeVisible()

	const xpAfter = await getGymXp(request)
	expect(xpAfter - xpBefore).toBe(50)

	await context.close()
})

test("a tournament resolves on leaderboard view, marking the winner and awarding the badge", async ({
	request,
	browser,
}) => {
	const runId = Date.now()
	const inviteCodeA = await mintInviteCode(request)
	const inviteCodeB = await mintInviteCode(request)

	const contextA = await browser.newContext()
	const contextB = await browser.newContext()

	const nameA = `Tournament Winner ${runId}`
	await registerUser(contextA.request, {
		name: nameA,
		email: `e2e-tourney-a-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode: inviteCodeA,
	})
	await registerUser(contextB.request, {
		name: `Tournament Runner-up ${runId}`,
		email: `e2e-tourney-b-${runId}@slimpals.test`,
		password: "E2ePassword1!",
		inviteCode: inviteCodeB,
	})

	const userAId = await getUserId(contextA.request)
	const userBId = await getUserId(contextB.request)

	// Create through the real UI, well within a valid (non-past) date range —
	// the end date gets backdated directly in the DB afterward to simulate the
	// tournament having ended, mirroring the backdated-checkins technique
	// already used in checkin-badge-social.spec.ts.
	const tournamentName = `Step Sprint ${runId}`
	const pageA = await contextA.newPage()
	await pageA.goto("/tournaments")
	await pageA.getByRole("button", { name: "+ Start a new tournament" }).click()
	await pageA.getByLabel("Name").fill(tournamentName)
	await pageA.getByLabel("Type").selectOption("step_count")
	await pageA.getByLabel("Start Date").fill(isoDate(daysAgo(3)))
	await pageA.getByLabel("End Date").fill(isoDate(daysAgo(-7)))
	await pageA.getByRole("button", { name: "Create Tournament" }).click()
	await expect(
		pageA.locator(".ui-card", { hasText: tournamentName }),
	).toBeVisible()

	const listRes = await contextA.request.get("/api/tournaments", {
		headers: { Origin: AUTH_ORIGIN },
	})
	const list = (await listRes.json()) as { id: number; name: string }[]
	const found = list.find((t) => t.name === tournamentName)
	expect(found).toBeDefined()
	const tournamentId = (found as { id: number; name: string }).id

	const joinRes = await contextB.request.post(
		`/api/tournaments/${tournamentId}/join`,
		{ headers: { Origin: AUTH_ORIGIN } },
	)
	expect(joinRes.ok()).toBeTruthy()

	// Step records within the tournament's original (pre-backdate) window, and
	// before the soon-to-be-backdated end date, so they still count toward
	// the score once the tournament is resolved.
	const recordedAt = daysAgo(2)
	const conn = await mysql.createConnection(DB_URL)
	try {
		await conn.execute(
			"INSERT INTO step_records (user_id, steps, recorded_at) VALUES (?, ?, ?)",
			[userAId, 10000, recordedAt],
		)
		await conn.execute(
			"INSERT INTO step_records (user_id, steps, recorded_at) VALUES (?, ?, ?)",
			[userBId, 3000, recordedAt],
		)
		await conn.execute("UPDATE tournaments SET end_date = ? WHERE id = ?", [
			daysAgo(1),
			tournamentId,
		])
	} finally {
		await conn.end()
	}

	// Leaderboards render inline and reload with the page (end date is in the
	// past now, so this reload lazily resolves the tournament). Every
	// tournament (including ones left over from earlier test runs) renders
	// inline on this one page, so every assertion below is scoped to this
	// test's own card by name rather than matching page-wide.
	await pageA.goto("/tournaments")
	const tournamentCard = pageA.locator(".ui-card", { hasText: tournamentName })

	// pageA is the winner viewing their own row, which renders as "You" (not
	// their registered name) — identify the row by being both .winner and
	// .is-me rather than by name text.
	const winnerRow = tournamentCard.locator(".leaderboard-row.winner.is-me")
	await expect(winnerRow).toBeVisible()
	await expect(winnerRow.locator(".rank")).toHaveText("🏆")
	await expect(
		tournamentCard.locator(".victory-banner .victory-msg"),
	).toBeVisible()

	await pageA.goto("/badges")
	await expect(
		pageA.locator(".badge-card.earned", { hasText: "Tournament Champion" }),
	).toBeVisible()

	await contextA.close()
	await contextB.close()
})
