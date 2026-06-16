# Issue #8 — Daily Check-in + Streak System

## Summary

Implemented a daily check-in system with grace-period streak logic, auto-check-in from weight logging, and a dashboard widget.

---

## Architecture

### New files
- **`server/routes/checkins.ts`** — `GET /api/checkins/today` and `POST /api/checkins`; exports `ensureCheckin(userId)` for auto-trigger
- **`tests/checkins/checkins.test.ts`** — 12 integration tests covering all streak states

### Modified files
- **`server/app.ts`** — mounts `checkinsRouter`
- **`server/routes/weight.ts`** — calls `ensureCheckin(userId)` after successful insert
- **`src/pages/Dashboard.svelte`** — streak widget with milestone badges

---

## Streak Logic

Streak state is determined by `daysBetween(lastCheckin.date, today)`:

| Days since last check-in | GET streakCount | POST result |
|---|---|---|
| 0 (already today) | `lastCheckin.streakCount` (checked in) | idempotent 200 |
| 1 (yesterday) | `lastCheckin.streakCount` (active) | +1 |
| 2 (one day missed, grace) | `lastCheckin.streakCount` (frozen) | +1 (grace saves it) |
| 3+ (grace expired) | 0 (reset) | 1 (fresh start) |

The `streak_count` column stores the streak AT the time of check-in, so historical queries are O(1).

---

## API

### `GET /api/checkins/today`
Returns current status without writing anything.

```json
{ "checkedInToday": false, "streakCount": 7 }
```

### `POST /api/checkins`
Creates today's check-in (idempotent — returns 200 if already done today, 201 if new).

```json
// Request
{ "mood": "great", "notes": "Hit the gym", "goalsCompleted": ["exercise"] }

// Response 201
{ "id": 42, "date": "...", "mood": "great", "notes": "Hit the gym", "goalsCompleted": ["exercise"], "streakCount": 8 }
```

### Auto-check-in
`POST /api/weight` triggers `ensureCheckin(userId)` silently after inserting the weight entry. If a check-in already exists for today it is a no-op.

---

## Dashboard Widget

Located on the `/` (Dashboard) page:
- Displays the flame emoji, streak count, and "day streak" label
- Check-in button if not yet checked in today
- Milestone banner at 7, 30, and 100-day streaks
- Countdown to next milestone

---

## Test Results

```
Tests: 54 passed (54)
Files: 7 passed (7)
```

### Checkins test coverage (12 tests)
1. New user GET → `{checkedInToday: false, streakCount: 0}`
2. POST creates first check-in with `streakCount: 1`
3. POST is idempotent (200 on second call today)
4. GET after POST → `checkedInToday: true, streakCount: 1`
5. Consecutive days → streak increments (+1 from yesterday's row)
6. Grace: GET with last checkin 2 days ago → streak frozen
7. Grace: POST with last checkin 2 days ago → streak continues
8. Grace expired: GET with last checkin 3+ days ago → `streakCount: 0`
9. Grace expired: POST → fresh `streakCount: 1`
10. Auto-checkin: logging weight triggers check-in
11. Auth: GET without session → 401
12. Auth: POST without session → 401

---

## Commit message

```
feat(#8): daily check-in + streak system with grace period and auto-trigger

- POST /api/checkins and GET /api/checkins/today with streak recalculation
- Grace period: one missed day freezes streak, two missed days resets to 0
- Auto check-in fires when user logs weight (ensureCheckin helper)
- Dashboard streak widget with milestone callouts at 7/30/100 days
- 12 new integration tests; 54/54 passing
```
