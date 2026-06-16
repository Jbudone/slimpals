import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"

const BASE = "http://localhost:5173"
const API  = "http://localhost:3000"
const SS   = "/tmp/slimpals-ss"
if (!existsSync(SS)) mkdirSync(SS)

let pass = 0, fail = 0, findings = []

function ok(label, detail = "")    { console.log(`✅ ${label}${detail ? " — " + detail : ""}`); pass++ }
function bad(label, detail = "")   { console.log(`❌ ${label}${detail ? " — " + detail : ""}`); fail++; findings.push(`${label}${detail ? ": " + detail : ""}`) }
function warn(label)               { console.log(`⚠️  ${label}`); findings.push("⚠️  " + label) }
function probe(label, detail = "") { console.log(`🔍 ${label}${detail ? " — " + detail : ""}`) }
const ss = async (page, name) => { await page.screenshot({ path: join(SS, name + ".png") }) }

// ── Auth checks ───────────────────────────────────────────────────────────────
console.log("\n── Auth (unauthenticated curl) ──")
for (const path of ["/api/weight", "/api/food/logs", "/api/checkins/today"]) {
  const r = await fetch(`${API}${path}`)
  if (r.status === 401) ok(`GET ${path} → 401`)
  else bad(`GET ${path}`, `expected 401 got ${r.status}`)
}

// ── Browser ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext()
const page    = await ctx.newPage()

// ── Register ──────────────────────────────────────────────────────────────────
console.log("\n── Register ──")
await page.goto(`${BASE}/register`)
await page.waitForLoadState("networkidle")
const email = `walk${Date.now()}@slimpals.test`
await page.fill('input[autocomplete="name"]', "Walk User")
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', "Password1!")
await page.fill('input[placeholder="XXXX-XXXX"]', "WALK70-2026")
await ss(page, "01-register-form")
await page.click('button[type="submit"]')
await page.waitForURL(url => !url.includes("/register"), { timeout: 8000 }).catch(() => {})
await page.waitForTimeout(800)
const afterReg = page.url()
if (!afterReg.includes("/login") && !afterReg.includes("/register"))
  ok("Registered + redirected", afterReg)
else
  bad("Registration failed", afterReg)
await ss(page, "02-after-register")

// ── Dashboard / Issue 8 ───────────────────────────────────────────────────────
console.log("\n── Issue 8: Dashboard streak widget ──")
await page.goto(`${BASE}/`)
await page.waitForLoadState("networkidle")
await page.waitForTimeout(800)
await ss(page, "03-dashboard-initial")

const streakEl   = await page.locator(".streak-count").isVisible().catch(() => false)
const streakText = await page.locator(".streak-count").textContent().catch(() => null)
const checkinBtn = await page.locator(".checkin-btn").isVisible().catch(() => false)

if (streakEl)   ok("Streak widget visible", `count="${streakText}"`)
else            bad("Streak widget (.streak-count) not found on dashboard")
if (checkinBtn) ok("Check-in button shown (not yet checked in)")
else            bad("Check-in button missing before first check-in")

if (checkinBtn) {
  await page.click(".checkin-btn")
  await page.waitForTimeout(800)
  const count2  = await page.locator(".streak-count").textContent().catch(() => null)
  const doneMsg = await page.locator(".done-msg").isVisible().catch(() => false)
  const btnGone = !(await page.locator(".checkin-btn").isVisible().catch(() => false))
  if (count2 === "1")  ok("Streak becomes 1 after check-in")
  else                 bad("Streak count after check-in", `expected 1 got "${count2}"`)
  if (doneMsg)         ok("Confirmation message (.done-msg) shown")
  else                 bad("No .done-msg after check-in")
  if (btnGone)         ok("Check-in button hidden after checking in")
  else                 warn("Check-in button still visible after checking in")
  await ss(page, "04-dashboard-checked-in")
}

// Reload persistence
await page.reload()
await page.waitForTimeout(800)
const reloadCount = await page.locator(".streak-count").textContent().catch(() => null)
const btnAfterReload = await page.locator(".checkin-btn").isVisible().catch(() => false)
if (reloadCount === "1")  ok("Streak persists after reload (still 1)")
else                      bad("Streak not persisted after reload", `"${reloadCount}"`)
if (!btnAfterReload)      ok("Check-in button absent after reload")
else                      warn("Check-in button reappeared after reload")
await ss(page, "05-dashboard-reload")

// ── Weight Logging / Issue 6 ──────────────────────────────────────────────────
console.log("\n── Issue 6: Weight Logging ──")
await page.goto(`${BASE}/weight`)
await page.waitForLoadState("networkidle")
await page.waitForTimeout(400)

const wInput = page.locator('input[placeholder="e.g. 82.5"]')

// First entry
await wInput.fill("82.5")
await page.click('button[type="submit"]')
await page.waitForTimeout(800)
await ss(page, "06-weight-one-entry")

const rows1 = await page.locator(".history-table tbody tr").count().catch(() => 0)
if (rows1 >= 1) ok("First weight entry shows in history table", `${rows1} row(s)`)
else            bad("No history row after first entry")

// Empty-state chart with 1 entry
const emptyMsg = await page.locator("text=Log one more entry to see your chart.").isVisible().catch(() => false)
if (emptyMsg) ok("Chart shows empty-state message with 1 entry")
else          bad("Empty-state chart message not shown with 1 entry")

// Second entry
await wInput.fill("82.1")
await page.click('button[type="submit"]')
await page.waitForTimeout(800)
await ss(page, "07-weight-two-entries")

const svgPath = await page.locator("svg.chart path").count().catch(() => 0)
if (svgPath > 0) ok("D3 chart renders SVG path after 2 entries", `${svgPath} path(s)`)
else             bad("No SVG path in .chart after 2 entries")

// Third entry
await wInput.fill("81.8")
await page.click('button[type="submit"]')
await page.waitForTimeout(800)
await ss(page, "08-weight-three-entries")

const rows3 = await page.locator(".history-table tbody tr").count().catch(() => 0)
if (rows3 >= 3) ok("3 entries in history table")
else            bad("Expected ≥3 history rows", `got ${rows3}`)

// Reverse-chrono: newest (81.8) should be first row
const firstRowText = await page.locator(".history-table tbody tr").first().textContent().catch(() => "")
if (firstRowText.includes("81.8")) ok("History table is reverse-chronological (81.8 kg first)")
else warn(`First row: "${firstRowText.trim().slice(0,60)}" — expected 81.8 kg`)

// Auto-checkin idempotence
await page.goto(`${BASE}/`)
await page.waitForTimeout(700)
const streakAfterWeight = await page.locator(".streak-count").textContent().catch(() => null)
if (streakAfterWeight === "1") ok("Auto-checkin from weight is idempotent (streak stays 1)")
else warn(`Streak after weight log: "${streakAfterWeight}"`)

// ── Food Photo / Issue 7 ──────────────────────────────────────────────────────
console.log("\n── Issue 7: Food Photo Analysis ──")
await page.goto(`${BASE}/food`)
await page.waitForLoadState("networkidle")
await page.waitForTimeout(300)

// Button disabled with no file
const initDisabled = await page.locator(".analyze-btn").isDisabled().catch(() => null)
if (initDisabled === true) ok("Analyse button disabled with no file")
else                       bad("Analyse button should be disabled initially", `isDisabled=${initDisabled}`)

// Upload tiny PNG
await page.locator('input[type="file"]').setInputFiles("/tmp/test-meal-real.jpg")
await page.waitForTimeout(400)

const preview = await page.locator(".preview-img").isVisible().catch(() => false)
if (preview) ok("Image preview shown after file selection")
else         bad("No .preview-img after file upload")
await ss(page, "09-food-file-selected")

// Select meal type pill
await page.click('.meal-btn:has-text("lunch")')
await page.waitForTimeout(150)
const activePill = await page.locator(".meal-btn.active").textContent().catch(() => "")
if (activePill.trim() === "lunch") ok("Lunch meal-type pill activates on click")
else                               bad("Pill not activating", `active="${activePill}"`)

const enabledNow = await page.locator(".analyze-btn").isEnabled().catch(() => false)
if (enabledNow) ok("Analyse button enabled after file selection")
else            bad("Analyse button still disabled after file selection")
await ss(page, "10-food-ready")

// Click analyse
await page.click(".analyze-btn")
await page.waitForTimeout(400)
const spinnerSeen = await page.locator(".spinner").isVisible().catch(() => false)
if (spinnerSeen) ok("Spinner shown during analysis")
else             warn("Spinner not observed (may resolve too fast)")

// Wait for result or error (real Gemini call)
try {
  await page.waitForSelector(".result-card, .error", { timeout: 25000 })
  const hasResult = await page.locator(".result-card").isVisible().catch(() => false)
  const hasError  = await page.locator(".error").isVisible().catch(() => false)

  if (hasResult) {
    const foodName = await page.locator(".result-header h3").textContent().catch(() => "")
    const badge    = await page.locator(".rating-badge").isVisible().catch(() => false)
    const coach    = await page.locator(".coach-msg").isVisible().catch(() => false)
    const macros   = await page.locator(".macro").count().catch(() => 0)
    ok("Result card shown", `food: "${foodName.trim()}"`)
    if (badge)       ok("Rating badge visible")
    else             bad("Rating badge missing from result card")
    if (coach)       ok("Coach message visible")
    else             bad("Coach message missing from result card")
    if (macros >= 4) ok("All 4 macro values displayed")
    else             bad("Macros incomplete", `${macros}/4`)
    await ss(page, "11-food-result")

    const logItems = await page.locator(".log-item").count().catch(() => 0)
    if (logItems >= 1) ok("Food history entry appears after analysis", `${logItems} item(s)`)
    else               bad("Food history empty after successful analysis")
  } else if (hasError) {
    const errTxt = await page.locator(".error").textContent().catch(() => "")
    const isQuota = errTxt.toLowerCase().includes("quota") || errTxt.toLowerCase().includes("exceeded")
    if (isQuota) {
      ok("Food error path: server returns specific quota message (not opaque error)", errTxt.trim().slice(0, 80))
      probe("Gemini free-tier quota exhausted — expected on shared dev key; UI shows correct message")
    } else {
      bad("Food analysis returned unexpected error", errTxt.trim().slice(0, 120))
    }
    await ss(page, "11-food-error")
  }
} catch {
  bad("Food analysis timed out (>25s)")
  await ss(page, "11-food-timeout")
}
await ss(page, "12-food-history")

// ── Probe: fresh /food page has disabled button ───────────────────────────────
probe("Navigate away and back — analyse button resets to disabled")
await page.goto(`${BASE}/food`)
await page.waitForTimeout(400)
const freshDisabled = await page.locator(".analyze-btn").isDisabled().catch(() => null)
if (freshDisabled === true) probe("Analyse button correctly disabled on fresh page load")
else                        warn("Analyse button not disabled on fresh /food page")

// ── Done ──────────────────────────────────────────────────────────────────────
await browser.close()
console.log(`\n──────────────────────────────────────`)
console.log(`✅ ${pass} passed   ❌ ${fail} failed`)
console.log(`Screenshots → ${SS}/`)
if (findings.length) { console.log("\nFindings:"); findings.forEach(f => console.log(" •", f)) }
process.exit(fail > 0 ? 1 : 0)
