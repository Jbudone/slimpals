# GH-5 — CSS Theme System

**Issue:** [#5 CSS theme system (6 themes, switcher UI, persisted to user profile)](https://github.com/Jbudone/slimpals/issues/5)
**Status:** Closed — verified 2026-06-15

---

## Summary

Implements the full theming system: six CSS custom-property token sets, a `GET /api/users/me` + `PATCH /api/users/me` API, a `ThemeSwitcher` component, a Settings page, and a `localStorage` fast-path that prevents any flash of unstyled content on reload.

---

## Architectural Changes

### Backend

**`server/routes/users.ts`** (new)
- `GET /api/users/me` — returns `{ id, email, name, theme, coachPersonality, viewMode }` for the authenticated user
- `PATCH /api/users/me` — accepts `{ theme? }`, validates against the six allowed values, persists to `users.theme`, returns updated profile
- Both routes sit behind the existing `requireAuth` middleware; unauthenticated requests get 401

**`server/middleware/requireAuth.ts`** (modified)
- Exports a named `AuthRequest` type so route handlers can type-cast `req` without repeating the `session.user` inference

**`server/app.ts`** (modified)
- Mounts `usersRouter` at `/api` after the `requireAuth` middleware

### Frontend

**`src/main.ts`** (modified)
- Reads `localStorage.getItem("sp:theme")` (defaulting to `"midnight"`) and sets `data-theme` on `<html>` before the Svelte app mounts — eliminates the flash of the default theme on reload

**`src/lib/user.svelte.ts`** (new)
- `$state` store holding `UserProfile | null`
- `fetchUserProfile()` — calls `GET /api/users/me`, updates state, applies theme
- `updateTheme(theme)` — calls `PATCH /api/users/me`, updates state and `localStorage`
- `applyTheme(theme)` — sets `data-theme` on `<html>` and writes `localStorage`

**`src/components/ThemeSwitcher.svelte`** (new)
- Grid of six swatch buttons, one per theme
- Active swatch shows a ✓ and a highlighted border (`class:active`)
- Disables all swatches while a save is in flight (`saving` state) to prevent double-submits

**`src/pages/Settings.svelte`** (new)
- Houses `ThemeSwitcher` under an **Appearance** section
- Also shows account info (name, email) once the profile is loaded

**`src/app.svelte`** (modified)
- Calls `fetchUserProfile()` after `fetchSession()` succeeds on mount
- Routes `/settings` to the new `Settings` page
- Adds a **Settings** nav link

### Theme tokens (`src/styles/app.css` — pre-existing)

All six token sets were already written in the initial commit. Each theme is a `[data-theme="..."]` block defining eleven CSS custom properties:

| Property | Role |
|---|---|
| `--color-bg` | Page background |
| `--color-surface` | Cards, nav |
| `--color-surface-2` | Hover states, inputs |
| `--color-border` | Borders |
| `--color-text` | Primary text |
| `--color-text-muted` | Secondary text, labels |
| `--color-accent` | Buttons, links, active states |
| `--color-accent-hover` | Accent hover |
| `--color-success` | Success indicators |
| `--color-warning` | Warning indicators |
| `--color-danger` | Error states |

---

## Test Results

**File:** `tests/users/users.test.ts` — 6 Vitest tests against a real MySQL test DB

| # | Behavior | Result |
|---|---|---|
| 1 | `GET /api/users/me` returns profile with `theme` field | ✅ |
| 2 | Default theme is `midnight` for new users | ✅ |
| 3 | `PATCH /api/users/me` with invalid theme → 400 | ✅ |
| 4 | `PATCH /api/users/me` with valid theme persists and returns updated profile | ✅ |
| 5 | `GET /api/users/me` without session → 401 | ✅ |
| 6 | `PATCH /api/users/me` without session → 401 | ✅ |

Full suite (27 tests across 4 files): **27/27 passed**

End-to-end Playwright verification (18 checks):

| Check | Result |
|---|---|
| Register page loads | ✅ |
| Registration with valid invite → dashboard | ✅ |
| Logout → `/login` | ✅ |
| Login → dashboard | ✅ |
| Settings nav link navigates to `/settings` | ✅ |
| All 6 theme swatches visible | ✅ |
| Each swatch applies its theme instantly (all 6) | ✅ |
| Theme set before hard reload | ✅ |
| `data-theme` present immediately after reload (no flash) | ✅ |
| Theme correct after app hydration | ✅ |
| `GET /api/users/me` without cookie → 401 | ✅ |
| `PATCH /api/users/me` without cookie → 401 | ✅ |
| Authenticated `PATCH` updates theme in DB and returns it | ✅ |

---

## Bug Fixed During Verification

**`npm run dev` server crash** — `tsx --env-file=.env watch server/index.ts` passed `--env-file` before the `watch` subcommand; tsx v4 requires the subcommand first. Fixed to `tsx watch --env-file=.env server/index.ts`.

---

## Walkthrough

### Prerequisites

MySQL container must be running:
```
docker ps | grep slimpals-db
```

Create an invite code if needed:
```
mysql -u slimpals -pslimpalspass -h 127.0.0.1 -P 3307 slimpals \
  -e "INSERT INTO invites (code, created_by_user_id, expires_at) \
      VALUES ('MY-INVITE', 'admin-001', DATE_ADD(NOW(), INTERVAL 7 DAY));"
```

### Start

```
npm run dev
```

- Vite → http://localhost:5173 (proxies `/api/*` to Express)
- Express → http://localhost:3000

### 1 — Register

Go to `/register`. Fill name, email, password (`Password1!` or any 8+ char password), and a valid invite code. Click **Create account** → lands on dashboard. Bad/used/expired codes show an inline error.

### 2 — Logout and login

Click **Sign out** → `/login`. Sign back in → dashboard.

### 3 — Theme switching

Click **Settings** in the nav → `/settings`. Six swatches appear under **Appearance**. Click any — the full UI repaints instantly via `data-theme` on `<html>`. Active swatch shows ✓.

### 4 — Persistence (no flash)

Switch to **Forest**, then hard-reload (`Ctrl+Shift+R`). The Forest theme is already applied before any JS runs (from `localStorage`). After hydration the server confirms and it stays Forest. A second tab also opens in Forest immediately.

### 5 — Auth enforcement

```bash
# No cookie → 401
curl http://localhost:3000/api/users/me
# → {"error":"Unauthorized"}

curl -X PATCH http://localhost:3000/api/users/me \
  -H "Content-Type: application/json" -d '{"theme":"forest"}'
# → {"error":"Unauthorized"}
```

### Current placeholders

- Dashboard: "Dashboard coming soon." — issue #6 (weight logging) is next
- Routes `/weight`, `/food`, `/pet`, etc. exist in the router but are empty
- Invite management UI — issue #10
