# Walkthrough: Issues 6–8

Covers weight logging (6), food photo AI analysis (7), and daily check-in + streak system (8).

**Verified against:** `npm run dev` (Vite :5173 / Express :3000 / MySQL :3307)

---

## Setup

Start the dev server:
```bash
npm run dev
```

Insert a fresh invite code (replace `admin-001` with any existing user ID if needed):
```bash
mysql -u slimpals -pslimpalspass -h 127.0.0.1 -P 3307 slimpals -e "
INSERT INTO invites (code, created_by_user_id, expires_at)
VALUES ('MY-INVITE', 'admin-001', DATE_ADD(NOW(), INTERVAL 7 DAY));
"
```

Open `http://localhost:5173/register`, fill in name / email / password (`Password1!` or anything ≥8 chars) and the invite code. On success you land on `/`.

---

## Issue 8 — Daily Check-in & Streak (`/`)

1. **Streak widget** — the Dashboard shows a flame icon, a streak count (`0` for a new user), and a **Check in now** button.
2. **Check in** — click the button. The count jumps to `1` and the button is replaced by "Checked in! Keep it up."
3. **Persistence** — hard-reload the page. The streak stays `1` and the button does not reappear.
4. **Milestone banners** — at streaks of 7, 30, and 100 days a coloured badge appears next to the count. To test manually:
   ```bash
   mysql -u slimpals -pslimpalspass -h 127.0.0.1 -P 3307 slimpals \
     -e "UPDATE daily_checkins SET streak_count = 7 ORDER BY id DESC LIMIT 1;"
   ```
   Reload `/` — "7-day milestone!" badge appears.
5. **Countdown** — below the widget, "X days to Y-day milestone" counts down to the next milestone.

---

## Issue 6 — Weight Logging (`/weight`)

1. **Log first entry** — enter `82.5` in the kg field and click **Log weight**. The form clears and a row appears in the history table below.
2. **Chart empty state** — with only 1 entry, the chart shows "Log one more entry to see your chart."
3. **Chart renders** — log a second entry (`82.1`). The D3 line chart appears with a monotone curve connecting both points.
4. **Third entry** — log `81.8`. The curve extends and milestone markers appear on the y-axis at –2/–5/–10 kg from your starting weight.
5. **Reverse-chronological history** — the table shows `81.8 kg` first (most recent at top).
6. **Auto check-in** — logging weight automatically creates a check-in for the day. Navigate to `/` and reload — streak is `1` (idempotent: already checked in).

---

## Issue 7 — Food Photo AI Analysis (`/food`)

> **Note on Gemini quota:** The free tier has a daily request limit. If quota is exhausted the UI now shows "AI quota exceeded — please try again later" (a specific, actionable message). This is expected on a shared dev key; on a paid key the full analysis flow works as described below.

### Upload flow
1. **Disabled button** — on page load the **Analyse meal** button is greyed out (no file selected).
2. **Upload** — drag a food photo onto the drop zone, or click inside it to pick a file. A preview of the image appears.
3. **Meal type** — click one of the four pills: **breakfast / lunch / dinner / snack**. The active pill highlights. Analyse button becomes enabled.
4. **Analyse** — click **Analyse meal**. A spinner ("Asking your AI coach…") appears while the request is in-flight.

### Result card (when Gemini responds successfully)
- Food name + healthiness rating badge (green ≥8, amber ≥5, red <5)
- Macro grid: kcal / protein / carbs / fat
- Coach message in italics
- "Healthier swaps" list

### Food history
- After a successful analysis, an entry appears in the history list below: thumbnail, meal type pill, kcal + protein, timestamp.

### Error states
| Condition | UI message |
|---|---|
| No file selected | Button disabled (no message needed) |
| Gemini quota exceeded | "AI quota exceeded — please try again later" |
| Other AI failure | "Food analysis failed — please try again" |

---

## Auth Sanity Checks

All three endpoints require an active session. Without a cookie they return `401`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/weight
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/food/logs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/checkins/today
# → 401, 401, 401
```

---

## Known Limitations

| Area | Note |
|---|---|
| Food AI | Gemini free-tier quota (~15 req/min, ~1500/day) — use a paid key for sustained testing |
| Streak grace period | Requires seeding a 2-day-old check-in in the DB to observe in the UI |
| Food auto-checkin | Not wired yet — only weight logging triggers auto check-in (issue #8 scope) |
| Chart milestones | Require a ≥2 kg drop from your first entry to render milestone markers |
