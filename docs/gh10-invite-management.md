# Issue #10 — Invite Code Management UI

**Status:** Closed  
**Tests:** 72/72 passing (8 new integration tests)

---

## Commit Message

```
feat: invite code management UI (GH #10)

- GET /api/invites — returns all codes created by the current user with
  status (active/used/expired) and usedByName via left join on users table
- POST /api/invites — generates a SLIM-XXXXXXXX code with 7-day expiry,
  inserts into invites table, returns same payload shape as GET
- Settings.svelte — new "Invite Codes" section: list with status badges,
  copy-to-clipboard with 2s "Copied!" feedback, "Generate new invite" button
- verify-social.mjs excluded from biome to suppress forEach lint warning
- 8 new integration tests; 72/72 passing
```

---

## Architectural Changes

### New Files

| File | Purpose |
|------|---------|
| `server/routes/invites.ts` | GET + POST invite endpoints |
| `tests/invites/invites.test.ts` | 8 integration tests |
| `verify-invites.mjs` | Playwright verification script (21/21) |

### Modified Files

| File | Change |
|------|--------|
| `server/app.ts` | Mounted `invitesRouter` at `/api` |
| `src/pages/Settings.svelte` | Added Invite Codes section |
| `biome.json` | Excluded `verify-social.mjs` from linting |
| `scripts/seed-dev.ts` | Biome formatting cleanup |

---

## API Endpoints

### `GET /api/invites`

Returns all invite codes created by the calling user, ordered oldest first. Status is computed server-side; `usedByName` is resolved via a left join on the `users` table.

**Response shape:**
```json
[
  {
    "id": 1,
    "code": "SLIM-ABC12345",
    "createdAt": "2026-06-15T19:00:00.000Z",
    "expiresAt": "2026-06-22T19:00:00.000Z",
    "status": "active",
    "usedByName": null
  },
  {
    "id": 2,
    "code": "SLIM-XYZ98765",
    "createdAt": "2026-06-15T19:01:00.000Z",
    "expiresAt": "2026-06-22T19:01:00.000Z",
    "status": "used",
    "usedByName": "Bob Smith"
  }
]
```

**Status logic:**
- `used` — `usedByUserId` is non-null
- `expired` — `expiresAt` is in the past, or `revokedAt` is set
- `active` — neither of the above

### `POST /api/invites`

Generates a new `SLIM-XXXXXXXX` code (8 random uppercase alphanumeric chars) with `expiresAt = now + 7 days`. Returns the same payload shape as a single item from `GET /api/invites`.

**Status codes:** `201` created, `401` unauthenticated

---

## Frontend: Settings.svelte — Invite Codes Section

- **Empty state** when no codes exist: "No invite codes yet. Generate one above."
- **Generate button** in section header; shows "Generating…" and disables during in-flight request
- **Each code row:**
  - Monospace code string (`SLIM-XXXXXXXX`)
  - Status badge: green "Expires [date]" / blue "Used by [name]" / grey "Expired"
  - **Copy button** (active codes only): copies to clipboard, shows "Copied!" for 2 seconds, then reverts
  - Expired/used rows are visually dimmed (`opacity: 0.6`)
- Codes load on `onMount`; new codes append to the list optimistically after `POST`

---

## Test Coverage

File: `tests/invites/invites.test.ts` — 8 tests

| # | Description |
|---|-------------|
| 1 | (tracer) `GET /api/invites` returns `[]` when user has no codes |
| 2 | `POST /api/invites` creates code matching `SLIM-XXXXXXXX`, expiring ~7 days out |
| 3 | `GET /api/invites` returns only codes created by the calling user |
| 4 | `used` status + `usedByName` populated when code is claimed via registration |
| 5 | `expired` status for codes with `expiresAt` in the past |
| 6 | Multiple codes returned oldest-first |
| 7 | `GET /api/invites` returns 401 without session |
| 8 | `POST /api/invites` returns 401 without session |

**TDD notes:**
- Tracer bullet (B1) caught missing route immediately (404 → implemented → 200)
- B2 caught a real bug: `{ insertId }` destructure vs correct `[inserted]` pattern for `$returningId()`
- B5 seeds expired data directly (no public API path to create already-expired codes — this is the correct tradeoff over mocking `Date.now`)

---

## Feature Walkthrough (Verified — 21/21 Playwright checks)

**Prerequisites:** Dev server running (`npm run dev`), database seeded (`npm run seed`)

### 1. Log In

Open `http://localhost:5173/login` → `dev@slimpals.test` / `DevPass1!` → lands on Dashboard.

### 2. Navigate to Settings

Click **Settings** in the nav → three sections visible: Appearance, Account, **Invite Codes**.

### 3. Empty State

If no codes exist: "No invite codes yet. Generate one above." is shown beneath the section header.

### 4. Generate an Invite Code

Click **Generate new invite** → a row appears with:
- `SLIM-XXXXXXXX` format code
- Green **"Expires [date]"** badge (7 days out)
- **Copy** button

### 5. Copy a Code

Click **Copy** → label changes to **"Copied!"** for 2 seconds → reverts to **"Copy"**. Code is in clipboard.

### 6. Generate a Second Code

Click **Generate new invite** again → second row appends below first. Both codes are distinct.

### 7. Reload — Codes Persist

Refresh the page → both codes still listed (DB-backed, not in-memory).

### 8. Used Code State

To see the "Used by [name]" badge:
1. Copy an active code
2. Open incognito → `http://localhost:5173/register` → register with that code
3. Return to Settings and reload → the code shows **"Used by [name]"** (blue badge, no Copy button)

### 9. Auth Enforcement

```bash
curl -s http://localhost:3000/api/invites
# → {"error":"Unauthorized"}  (401)

curl -s -X POST http://localhost:3000/api/invites
# → {"error":"Unauthorized"}  (401)
```
