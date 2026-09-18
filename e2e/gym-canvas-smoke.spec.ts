import { expect, test } from "@playwright/test"
import { mintInviteCode, registerUser } from "./helpers.js"

// Render smoke test only — confirms the Phaser canvas actually boots and the
// GymScene becomes active. Does not click NPCs or exercise ceremonies; see
// CLAUDE.md's canvas-testing notes for why DOM tools don't reach inside it.

test("gym canvas renders and GymScene becomes active with no console errors", async ({
	request,
	browser,
}) => {
	const inviteCode = await mintInviteCode(request)

	const runId = Date.now()
	const uniqueEmail = `e2e-gym-${runId}@slimpals.test`
	const uniqueName = `Gym Canvas Tester ${runId}`
	await registerUser(request, {
		name: uniqueName,
		email: uniqueEmail,
		password: "E2ePassword1!",
		inviteCode,
	})

	const storageState = await request.storageState()
	const context = await browser.newContext({ storageState })
	const page = await context.newPage()

	// PreloadScene deliberately falls back to placeholder textures and logs via
	// console.error when generated sprite art isn't present locally (see
	// PreloadScene.ts's reportMissingSprites) — expected given this repo's
	// current, intentionally-incomplete art asset set, not a bug this smoke
	// test should catch. Phaser's own loader also logs a "Failed to process
	// file" spritesheet error for each 404'd asset underlying that fallback.
	const KNOWN_MISSING_ASSET_ERROR =
		/\[gym\]|check-assets|→ public\/assets\/gym\/|Failed to process file.*spritesheet/
	const consoleErrors: string[] = []
	page.on("console", (msg) => {
		if (msg.type() === "error" && !KNOWN_MISSING_ASSET_ERROR.test(msg.text())) {
			consoleErrors.push(msg.text())
		}
	})
	const pageErrors: string[] = []
	page.on("pageerror", (err) => pageErrors.push(err.message))

	await page.goto("/gym/canvas")

	await expect(
		page.locator(".gym-name", { hasText: `${uniqueName}'s Gym` }),
	).toBeVisible()

	const canvas = page.locator(".phaser-container canvas")
	await expect(canvas).toBeVisible()
	const box = await canvas.boundingBox()
	expect(box?.width ?? 0).toBeGreaterThan(0)
	expect(box?.height ?? 0).toBeGreaterThan(0)

	await page.waitForFunction(
		() => window.game?.scene?.isActive("GymScene") === true,
		{ timeout: 10_000 },
	)

	expect(consoleErrors).toEqual([])
	expect(pageErrors).toEqual([])

	await context.close()
})
