import { chromium } from "playwright"
import { existsSync, mkdirSync } from "fs"
import { join } from "path"

const BASE = "http://localhost:5173"
const API  = "http://localhost:3000"
const SS   = "/tmp/slimpals-social-ss"
if (!existsSync(SS)) mkdirSync(SS)

let pass = 0, fail = 0, findings = []

function ok(label, detail = "")    { console.log(`✅ ${label}${detail ? " — " + detail : ""}`); pass++ }
function bad(label, detail = "")   { console.log(`❌ ${label}${detail ? " — " + detail : ""}`); fail++; findings.push(`${label}${detail ? ": " + detail : ""}`) }
function warn(label)               { console.log(`⚠️  ${label}`); findings.push("⚠️  " + label) }
function probe(label, detail = "") { console.log(`🔍 ${label}${detail ? " — " + detail : ""}`) }
const ss = async (page, name) => page.screenshot({ path: join(SS, name + ".png") })

// ── Auth check ────────────────────────────────────────────────────────────────
console.log("\n── Auth ──")
for (const path of ["/api/social/feed", "/api/social/react"]) {
  const method = path.includes("react") ? "POST" : "GET"
  const r = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({}) : undefined })
  if (r.status === 401) ok(`${method} ${path} → 401`)
  else bad(`${method} ${path}`, `expected 401 got ${r.status}`)
}

// ── Browser ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext()
const page    = await ctx.newPage()

// ── Register user A ───────────────────────────────────────────────────────────
console.log("\n── Register user A ──")
await page.goto(`${BASE}/register`)
await page.waitForLoadState("networkidle")
await page.fill('input[autocomplete="name"]', "Alice Test")
await page.fill('input[type="email"]', `alice${Date.now()}@sp.test`)
await page.fill('input[type="password"]', "Password1!")
await page.fill('input[placeholder="XXXX-XXXX"]', "SOCIAL-A")
await page.click('button[type="submit"]')
await page.waitForURL(url => !url.includes("/register"), { timeout: 8000 }).catch(() => {})
await page.waitForTimeout(600)
const regOk = !page.url().includes("/register") && !page.url().includes("/login")
if (regOk) ok("User A registered")
else        bad("Registration failed", page.url())

// ── Social nav link ───────────────────────────────────────────────────────────
console.log("\n── Social nav ──")
const socialLink = await page.locator('nav a[href="/social"], nav a:has-text("Social")').isVisible().catch(() => false)
if (socialLink) ok("Social link visible in nav")
else            bad("Social link missing from nav")

// ── Navigate to /social ───────────────────────────────────────────────────────
console.log("\n── Social feed ──")
await page.click('nav a:has-text("Social")')
await page.waitForTimeout(800)
await ss(page, "01-social-feed")

const feedItems = await page.locator(".post-card").count().catch(() => 0)
if (feedItems > 0) ok("Feed shows posts", `${feedItems} post card(s)`)
else               bad("Feed is empty — no post cards visible")

// ── Post types render ─────────────────────────────────────────────────────────
const weightPost = await page.locator(".post-card:has(.weight_update), .post-card:has-text('Logged')").first().isVisible().catch(() => false)
const milestone  = await page.locator(".post-card:has-text('Lost 5kg')").isVisible().catch(() => false)
if (weightPost) ok("weight_update post renders")
else            warn("weight_update post not found (check DB seed)")
if (milestone)  ok("milestone post renders with text")
else            warn("milestone post not found")

// Check user name appears
const userName = await page.locator(".user-name").first().textContent().catch(() => "")
if (userName.trim()) ok("User name shown on post", userName.trim())
else                 bad("User name missing from post header")

// Check timestamp appears
const timestamp = await page.locator(".timestamp").first().textContent().catch(() => "")
if (timestamp.trim()) ok("Timestamp shown", timestamp.trim())
else                  bad("Timestamp missing")

// ── Reaction bar ──────────────────────────────────────────────────────────────
console.log("\n── Reaction bar ──")
const reactionBtns = await page.locator(".post-card").first().locator(".reaction-btn").count().catch(() => 0)
if (reactionBtns === 5) ok("5 emoji reaction buttons on first post")
else                    bad("Expected 5 reaction buttons", `got ${reactionBtns}`)

// Check initial counts: no counts visible (all 0)
const countEls = await page.locator(".post-card").first().locator(".count").count().catch(() => 0)
if (countEls === 0) ok("No counts shown when all reactions are 0")
else                warn(`${countEls} count element(s) visible before any reaction`)
await ss(page, "02-reaction-bar-initial")

// ── React with ❤️ ─────────────────────────────────────────────────────────────
console.log("\n── React ──")
const firstPost = page.locator(".post-card").first()
const heartBtn  = firstPost.locator('.reaction-btn').first() // ❤️ is first
await heartBtn.click()
await page.waitForTimeout(600)

const heartActive  = await heartBtn.evaluate(el => el.classList.contains("active")).catch(() => false)
const heartCount   = await heartBtn.locator(".count").textContent().catch(() => "0")
if (heartActive)      ok("❤️ button becomes active after clicking")
else                  bad("❤️ button not marked active after click")
if (heartCount === "1") ok("❤️ count shows 1")
else                  bad("❤️ count wrong", `"${heartCount}"`)
await ss(page, "03-reacted-heart")

// ── Toggle off ────────────────────────────────────────────────────────────────
console.log("\n── Toggle off ──")
await heartBtn.click()
await page.waitForTimeout(600)

const heartInactive = !(await heartBtn.evaluate(el => el.classList.contains("active")).catch(() => true))
const heartCountAfter = await heartBtn.locator(".count").count().catch(() => 0)
if (heartInactive)      ok("❤️ becomes inactive after second click (toggle off)")
else                    bad("❤️ still active after toggle")
if (heartCountAfter === 0) ok("❤️ count hidden after toggle off")
else                    bad("❤️ count still visible after toggle off")
await ss(page, "04-toggled-off")

// ── Multiple emoji ────────────────────────────────────────────────────────────
console.log("\n── Multiple emoji ──")
const fireBtn = firstPost.locator('.reaction-btn').nth(3) // 🔥 is index 3
await fireBtn.click()
await page.waitForTimeout(600)
const fireActive = await fireBtn.evaluate(el => el.classList.contains("active")).catch(() => false)
if (fireActive) ok("🔥 reaction works independently")
else            bad("🔥 reaction did not activate")

// React with 💪 too — verify two reactions can be active simultaneously
const muscleBtn = firstPost.locator('.reaction-btn').nth(2) // 💪 is index 2
await muscleBtn.click()
await page.waitForTimeout(600)
const muscleActive = await muscleBtn.evaluate(el => el.classList.contains("active")).catch(() => false)
const fireStillActive = await fireBtn.evaluate(el => el.classList.contains("active")).catch(() => false)
if (muscleActive && fireStillActive) ok("Multiple emoji can be active on same post")
else                                  bad("Multiple emoji reactions do not coexist", `💪=${muscleActive} 🔥=${fireStillActive}`)
await ss(page, "05-multiple-reactions")

// ── Optimistic update ─────────────────────────────────────────────────────────
probe("Optimistic update: count changes before server responds")
// We can't easily measure network timing in headless, but we can confirm
// the UI is in the correct final state after server sync
const finalFireCount = await fireBtn.locator(".count").textContent().catch(() => "0")
if (finalFireCount === "1") probe("🔥 count confirmed at 1 after server sync")
else warn(`🔥 count: "${finalFireCount}"`)

// ── Empty state check ─────────────────────────────────────────────────────────
// Register a second user to see the feed from their perspective
console.log("\n── Second user sees same feed ──")
const ctx2   = await browser.newContext()
const page2  = await ctx2.newPage()
await page2.goto(`${BASE}/register`)
await page2.waitForLoadState("networkidle")
await page2.fill('input[autocomplete="name"]', "Bob Test")
await page2.fill('input[type="email"]', `bob${Date.now()}@sp.test`)
await page2.fill('input[type="password"]', "Password1!")
await page2.fill('input[placeholder="XXXX-XXXX"]', "SOCIAL-B")
await page2.click('button[type="submit"]')
await page2.waitForURL(url => !url.includes("/register"), { timeout: 8000 }).catch(() => {})
await page2.waitForTimeout(600)
await page2.click('nav a:has-text("Social")')
await page2.waitForTimeout(800)

const feedItemsB = await page2.locator(".post-card").count().catch(() => 0)
if (feedItemsB > 0) ok("Second user sees the same feed posts", `${feedItemsB} post(s)`)
else                bad("Second user sees empty feed (should see seeded posts)")

// Alice's reaction should show on Bob's feed but userReacted=false
const heartBtnB    = page2.locator(".post-card").first().locator(".reaction-btn").first()
const heartActiveB = await heartBtnB.evaluate(el => el.classList.contains("active")).catch(() => true)
if (!heartActiveB) ok("Alice's toggled-off reaction correctly inactive on Bob's view")
else               warn("Heart button appears active on Bob's view (was toggled off by Alice)")

await ss(page2, "06-second-user-feed")
await ctx2.close()

// ── Done ─────────────────────────────────────────────────────────────────────
await browser.close()
console.log(`\n──────────────────────────────────────`)
console.log(`✅ ${pass} passed   ❌ ${fail} failed`)
console.log(`Screenshots → ${SS}/`)
if (findings.length) { console.log("\nFindings:"); findings.forEach(f => console.log(" •", f)) }
process.exit(fail > 0 ? 1 : 0)
