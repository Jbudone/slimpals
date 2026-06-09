# GH #4 — Auth: invite-only registration, login, logout, session management

**Status:** Closed  
**Tests:** 21/21 passing  
**Issue:** https://github.com/jbraendel/slimpals/issues/4 *(closed)*

---

## PR / Commit Summary

```
feat: invite-only auth via Better Auth + Drizzle (GH #4)

Adds session-based authentication with email/password using Better Auth
1.6.x. Registration is gated behind single-use invite codes validated in
Express middleware before Better Auth's sign-up handler runs. Sessions
are persisted in MySQL via the Drizzle adapter. A reactive Svelte 5
auth state module drives the client-side loading screen, route guard,
login/register pages, and sign-out flow.

Key decisions:
- emailAndPassword is a top-level betterAuth() config key, not a plugin
- Invite validation middleware intercepts POST /api/auth/sign-up/email;
  a pendingInvites Map bridges it to databaseHooks.user.create.after
- trustedOrigins includes the Vite dev server to pass Better Auth's
  CSRF origin check during development
- createApp() factory pattern separates app creation from server startup,
  enabling supertest integration tests against a real MySQL test DB
- tsx --env-file=.env loads environment variables in the dev script
```

---

## Architectural Changes

### New files

| File | Purpose |
|---|---|
| `server/auth.ts` | Better Auth config: Drizzle adapter, emailAndPassword, trustedOrigins, pendingInvites Map, databaseHooks.user.create.after hook |
| `server/routes/register.ts` | Express middleware: validates invite code, parks invite in pendingInvites, calls next() to hand off to Better Auth |
| `server/middleware/requireAuth.ts` | Protects all `/api/*` routes; calls auth.api.getSession, returns 401 if no valid session |
| `server/app.ts` | createApp() factory: wires invite middleware, Better Auth handler, requireAuth, and existing routes |
| `src/lib/auth.svelte.ts` | Reactive auth state (authState, fetchSession, logout) using Svelte 5 $state |
| `src/pages/Login.svelte` | Email + password login form |
| `src/pages/Register.svelte` | Name + email + password + invite code registration form |
| `tests/setup.ts` | Overrides DATABASE_URL/BETTER_AUTH_SECRET before any server modules import |
| `tests/auth/auth.test.ts` | 10 HTTP integration tests via supertest |

### Modified files

| File | Change |
|---|---|
| `server/db/schema.ts` | Added emailVerified to users; added session, account, verification tables |
| `server/index.ts` | Simplified to call createApp() and listen |
| `src/app.svelte` | Loading screen, route guard, conditional Login/Register/Dashboard, top nav with Sign Out |
| `package.json` | Dev script: tsx --env-file=.env watch server/index.ts |
| `biome.json` | Fixed deprecated experimentalScannerIgnores → files.includes with !! prefix |
| `tests/helpers/db.ts` | truncateAll() includes session, account, verification |
| `tests/db/schema.test.ts` | Updated expected table count 17 → 20 |
| `vitest.config.ts` | Added setupFiles: ["./tests/setup.ts"] |

### Schema additions

```sql
-- Added to users
email_verified BOOLEAN NOT NULL DEFAULT false

-- New Better Auth tables
CREATE TABLE session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id → users.id CASCADE)
CREATE TABLE account (id, account_id, provider_id, user_id → users.id CASCADE, access_token, refresh_token, password, ...)
CREATE TABLE verification (id, identifier, value, expires_at, created_at, updated_at)
```

Migration: `server/db/migrations/0001_soft_riptide.sql`

### Request flow

```
POST /api/auth/sign-up/email
  → validateInvite middleware   (checks invite, parks in pendingInvites)
  → toNodeHandler(auth)         (Better Auth creates user + account rows)
  → databaseHooks.user.create.after  (marks invite used_by_user_id)

POST /api/auth/sign-in/email
  → toNodeHandler(auth)         (verifies password, sets session cookie)

GET/POST /api/*  (any protected route)
  → requireAuth middleware       (reads session cookie via auth.api.getSession)
```

---

## Test Results

```
 Test Files  3 passed (3)
      Tests  21 passed (21)
   Duration  ~22s
```

### Auth suite — `tests/auth/auth.test.ts` (10 tests)

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | Register with valid invite | 200 + user object + session cookie | ✅ |
| 2 | Register missing invite code | 400 "Invite code is required" | ✅ |
| 3 | Register with wrong invite code | 400 "Invalid or expired invite code" | ✅ |
| 4 | Register with already-used invite | 400 "Invalid or expired invite code" | ✅ |
| 5 | Register with expired invite | 400 "Invalid or expired invite code" | ✅ |
| 6 | Login with correct credentials | 200 + token | ✅ |
| 7 | Login with wrong password | 401 | ✅ |
| 8 | Protected route without session | 401 "Unauthorized" | ✅ |
| 9 | Protected route with valid session | Not 401 (404 — route doesn't exist, but auth passed) | ✅ |
| 10 | Logout then hit protected route | 401 "Unauthorized" | ✅ |

### Schema suite — `tests/db/schema.test.ts` (1 test)

All 20 expected tables present in MySQL.

### DB suite — `tests/db/` (10 tests)

Existing schema and seeding tests unaffected.

---

## Manual Walkthrough

### Pre-requisites

- Docker container `slimpals-db` running on port 3307
- `npm run dev` running with both `[vite]` and `[server]` lines visible

### One-time DB seed

```bash
docker exec -i slimpals-db mysql -u slimpals -pslimpalspass slimpals <<'SQL'
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM session; DELETE FROM account; DELETE FROM verification;
DELETE FROM invites; DELETE FROM users;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO users (id, email, name, email_verified)
  VALUES ('admin-001', 'admin@slimpals.com', 'Admin', 1);
INSERT INTO invites (code, created_by_user_id, expires_at)
  VALUES ('WELCOME-2026', 'admin-001', DATE_ADD(NOW(), INTERVAL 30 DAY));
SQL
```

### Steps

1. Open the Vite URL (e.g. `http://localhost:5173`) → redirected to `/login` (no session)
2. Click "Register with an invite code", enter `FAKE-CODE` → **"Invalid or expired invite code"**
3. Fill in Name `Test User`, Email `test@example.com`, Password `password123`, Invite `WELCOME-2026` → Dashboard
4. Try registering again with `WELCOME-2026` → **"Invalid or expired invite code"** (consumed)
5. Sign out → back to Login
6. Log in as `test@example.com` / `password123` → Dashboard
7. Try wrong password → **"Invalid email or password"**
8. Hard-refresh while logged in (`Ctrl+Shift+R`) → stays on Dashboard (session persists)

---

## Known Gotchas

- `emailAndPassword` is a top-level `betterAuth()` config key — it does not exist in `better-auth/plugins`
- `disableSignUp: true` blocks both HTTP *and* programmatic `auth.api.signUpEmail()` calls; invite gating must be done via middleware interception instead
- Better Auth's CSRF check rejects requests from origins not in `trustedOrigins`; the Vite dev server origin must be listed explicitly
- FK deletion order for test cleanup: session/account/verification → invites → users (or use `SET FOREIGN_KEY_CHECKS = 0`)
- `tsx watch` does not auto-load `.env`; use `tsx --env-file=.env watch` (Node 20+ native flag)
