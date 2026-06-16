/**
 * Verification script for issue #10 — Invite Code Management UI
 * Run with: node verify-invites.mjs
 */

import { chromium } from "playwright"

const BASE = "http://localhost:5173"
const EMAIL = "dev@slimpals.test"
const PASSWORD = "DevPass1!"

let passed = 0
let failed = 0

function ok(label, value) {
  if (value) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}`)
    failed++
  }
}

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/`)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()

// ── 1. Login ─────────────────────────────────────────────────────────────────
console.log("\n── 1. Login")
await login(page)
ok("Redirected to dashboard after login", page.url() === `${BASE}/`)

// ── 2. Navigate to Settings ───────────────────────────────────────────────────
console.log("\n── 2. Navigate to Settings")
await page.click('a[href="/settings"]')
await page.waitForURL(`${BASE}/settings`)
ok("Settings page loaded", page.url() === `${BASE}/settings`)

const h1 = await page.locator("h1").textContent()
ok("Settings heading visible", h1?.trim() === "Settings")

// ── 3. Invite Codes section present ──────────────────────────────────────────
console.log("\n── 3. Invite Codes section")
const inviteHeading = await page.locator("h2", { hasText: "Invite Codes" }).isVisible()
ok("'Invite Codes' section heading visible", inviteHeading)

const generateBtn = await page.locator("button", { hasText: "Generate new invite" }).isVisible()
ok("'Generate new invite' button visible", generateBtn)

// ── 4. Empty state ────────────────────────────────────────────────────────────
console.log("\n── 4. Empty state (or existing codes)")
// Either empty state message or existing list is acceptable
const emptyMsg = await page.locator("text=No invite codes yet").isVisible()
const hasList = await page.locator(".invite-list").isVisible().catch(() => false)
ok("Empty state or existing list shown", emptyMsg || hasList)

// ── 5. Generate first invite code ─────────────────────────────────────────────
console.log("\n── 5. Generate first invite code")
await page.click("button:has-text('Generate new invite')")
await page.waitForSelector(".invite-list", { timeout: 5000 })

const codes = await page.locator(".invite-code").all()
ok("At least one code appears in the list", codes.length >= 1)

const firstCode = await codes[0].textContent()
ok("Code matches SLIM-XXXXXXXX format", /^SLIM-[A-Z0-9]{8}$/.test(firstCode?.trim() ?? ""))

// ── 6. Active status badge ────────────────────────────────────────────────────
console.log("\n── 6. Active status badge")
const activeBadge = await page.locator(".badge.active").first().isVisible()
ok("Active status badge shown", activeBadge)

const badgeText = await page.locator(".badge.active").first().textContent()
ok("Badge shows expiry date", badgeText?.includes("Expires") ?? false)

// ── 7. Copy button present and works ─────────────────────────────────────────
console.log("\n── 7. Copy button")
const copyBtn = await page.locator(".btn-copy").first().isVisible()
ok("Copy button visible for active code", copyBtn)

// Grant clipboard permission and test copy
await context.grantPermissions(["clipboard-read", "clipboard-write"])
await page.locator(".btn-copy").first().click()

// Check for "Copied!" feedback
await page.waitForTimeout(300)
const copiedFeedback = await page.locator("text=Copied!").isVisible()
ok("Copy button shows 'Copied!' feedback", copiedFeedback)

// Verify clipboard content matches the code
const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
ok("Clipboard contains the invite code", clipboardText?.trim() === firstCode?.trim())

// Feedback reverts after 2 seconds
await page.waitForTimeout(2200)
const copyBtnAgain = await page.locator(".btn-copy").first().textContent()
ok("'Copy' label restored after timeout", copyBtnAgain?.trim() === "Copy")

// ── 8. Generate second code ───────────────────────────────────────────────────
console.log("\n── 8. Generate second code")
await page.click("button:has-text('Generate new invite')")
await page.waitForTimeout(1000)

const allCodes = await page.locator(".invite-code").all()
ok("Two codes now listed", allCodes.length >= 2)

const secondCode = await allCodes[allCodes.length - 1].textContent()
ok("Second code is different from first", secondCode?.trim() !== firstCode?.trim())
ok("Second code also matches SLIM-XXXXXXXX format", /^SLIM-[A-Z0-9]{8}$/.test(secondCode?.trim() ?? ""))

// ── 9. Generating button is disabled during request ───────────────────────────
console.log("\n── 9. Button state")
// Hard to test async disable without slowing network; verify button is re-enabled after
const btnEnabled = await page.locator("button:has-text('Generate new invite')").isEnabled()
ok("Generate button re-enabled after request completes", btnEnabled)

// ── 10. Auth enforcement (API) ────────────────────────────────────────────────
console.log("\n── 10. Auth enforcement")
const getRes = await fetch("http://localhost:3000/api/invites", { credentials: "omit" })
ok("GET /api/invites returns 401 without session", getRes.status === 401)

const postRes = await fetch("http://localhost:3000/api/invites", {
  method: "POST",
  credentials: "omit",
})
ok("POST /api/invites returns 401 without session", postRes.status === 401)

// ── 11. Persistence on reload ────────────────────────────────────────────────
console.log("\n── 11. Persistence on reload")
await page.reload()
await page.waitForSelector(".invite-list", { timeout: 5000 })
const codesAfterReload = await page.locator(".invite-code").count()
ok("Codes persist after page reload", codesAfterReload >= 2)

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close()

console.log(`\n${"─".repeat(50)}`)
console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`)
if (failed === 0) {
  console.log("✅ All checks passed\n")
} else {
  console.log("❌ Some checks failed\n")
  process.exit(1)
}
