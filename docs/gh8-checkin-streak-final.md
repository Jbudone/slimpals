# Issue #8 — Daily Check-in + Streak System

## Commit / PR Summary

```
feat: daily check-in + streak system with auto-trigger and dashboard widget (GH #8)

- POST /api/checkins and GET /api/checkins/today with streak recalculation
- Grace period: one missed day freezes streak, two missed days resets to 0
- Auto check-in fires when user logs weight (ensureCheckin helper)
- Dashboard streak widget with flame count, check-in button, milestone
  callouts at 7/30/100 days, and countdown to next milestone
- Fix: food analysis errors (AI quota, model not found) now return JSON 502
  instead of HTML, with specific user-facing messages
- Switch Gemini model to gemini-2.5-flash; extract JSON with regex to handle
  varied model response formatting
- 12 new integration tests; 54/54 passing
```

---

## Feature Walkthrough

### Prerequisites
```bash
npm run dev   # Vite :5173 · Express :3000 · MySQL :3307
```
Register at `/register` with a valid invite code. On success you land on `/`.

---

### Dashboard — Streak Widget (`/`)

1. **Initial state** — flame icon, `0` day streak, **Check in now** button.
2. **Check in** — click the button. Streak becomes `1`; button replaced by "Checked in! Keep it up."
3. **Persistence** — hard-reload (`Ctrl+Shift+R`). Streak remains `1`; button does not reappear.
4. **Milestone banner** — at 7, 30, and 100 days a coloured badge appears beside the count. Test with:
   ```bash
   mysql -u slimpals -pslimpalspass -h 127.0.0.1 -P 3307 slimpals \
     -e "UPDATE daily_checkins SET streak_count = 7 ORDER BY id DESC LIMIT 1;"
   ```
   Reload `/` → "7-day milestone!" badge appears.
5. **Countdown** — "X days to Y-day milestone" shown below the widget.

---

### Weight Logging (`/weight`)

1. Enter `82.5` → **Log weight**. Form clears; history row appears.
2. Chart reads "Log one more entry to see your chart." (1 entry).
3. Enter `82.1` → **Log weight**. D3 line chart renders with a monotone curve.
4. Enter `81.8` → **Log weight**. Curve extends; milestone markers on y-axis at −2/−5/−10 kg from start.
5. History table shows `81.8 kg` first (reverse-chronological).
6. Return to `/` — streak stays `1` (auto-checkin from weight is idempotent).

---

### Food Photo Analysis (`/food`)

1. **Analyse meal** button is disabled with no file selected.
2. Drag a food photo onto the drop zone or click to pick one. Preview appears.
3. Click a meal type pill (**breakfast / lunch / dinner / snack**). Pill highlights; button enables.
4. Click **Analyse meal**. Spinner appears; after a few seconds the result card shows:
   - Food name + colour-coded rating badge (green ≥ 8 / amber ≥ 5 / red < 5)
   - Macro grid — kcal / protein / carbs / fat
   - Coach message in italics
   - Healthier swap suggestions
5. The analysed meal appears in the history list with thumbnail, meal type, macro summary, and timestamp.

**Error states**

| Condition | UI message |
|---|---|
| No file | Button disabled |
| AI quota exceeded | "AI quota exceeded — please try again later" |
| Other AI failure | "Food analysis failed — please try again" |

---

### Auth enforcement

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/weight
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/food/logs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/checkins/today
# → 401  401  401
```

---

## Architectural Changes

### New files

| File | Purpose |
|---|---|
| `server/routes/checkins.ts` | `GET /api/checkins/today`, `POST /api/checkins`; exports `ensureCheckin(userId)` |
| `tests/checkins/checkins.test.ts` | 12 integration tests covering all streak states |

### Modified files

| File | Change |
|---|---|
| `server/app.ts` | Mounts `checkinsRouter` |
| `server/routes/weight.ts` | Calls `ensureCheckin(userId)` after successful weight insert |
| `server/routes/food.ts` | Try-catch around AI call → JSON 502 with specific message instead of HTML |
| `server/services/ai/index.ts` | Model → `gemini-2.5-flash`; JSON extraction via regex instead of string replace |
| `src/pages/Dashboard.svelte` | Full streak widget implementation |

### Streak logic

Streak recalculation on `POST /api/checkins` is based on `daysBetween(lastCheckin, today)`:

| Days since last check-in | GET `streakCount` | POST result |
|---|---|---|
| 0 (already today) | stored count | 200 idempotent |
| 1 (yesterday) | stored count (active) | stored + 1 |
| 2 (one day missed — grace) | stored count (frozen) | stored + 1 |
| 3+ (grace expired) | 0 | 1 (fresh start) |

`streak_count` is stored per-row at time of check-in, so historical reads are O(1).

### AI service improvements

- **Model**: `gemini-2.0-flash` → `gemini-2.5-flash` (available on paid tier, `2.0-flash` quota was exhausted)
- **JSON extraction**: replaced fragile string-strip with `text.match(/\{[\s\S]*\}/)` to handle any amount of surrounding prose or markdown
- **Error handling**: AI exceptions now caught in the route; quota errors (429) return a distinct message from other failures

---

## Test Results

```
Test Files  7 passed (7)
     Tests  54 passed (54)
  Duration  ~59s
```

### Checkin test coverage (12 tests)

| # | Behaviour |
|---|---|
| 1 | New user GET → `{checkedInToday: false, streakCount: 0}` |
| 2 | POST creates first check-in with `streakCount: 1` |
| 3 | Second POST today → idempotent 200 |
| 4 | GET after POST → `checkedInToday: true, streakCount: 1` |
| 5 | Consecutive days → streak increments |
| 6 | GET with last check-in 2 days ago → streak frozen (grace) |
| 7 | POST with last check-in 2 days ago → streak continues (grace saves it) |
| 8 | GET with last check-in 3+ days ago → `streakCount: 0` (grace expired) |
| 9 | POST with last check-in 3+ days ago → `streakCount: 1` (fresh start) |
| 10 | Logging weight auto-triggers check-in |
| 11 | GET without session → 401 |
| 12 | POST without session → 401 |

### End-to-end verification

Automated Playwright walkthrough run against live app (22/22 checks passed):
- Auth endpoints return 401 unauthenticated
- Registration and redirect
- Streak widget renders, check-in increments, persists after reload
- Weight form, chart empty-state, D3 chart at 2+ entries, reverse-chrono history
- Auto-checkin idempotence
- Food upload preview, meal type pill activation, AI error surface shows specific message
