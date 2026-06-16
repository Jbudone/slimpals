# Issue #9 — Social Feed + Emoji Reactions

**Status:** Closed  
**Commit:** `986b6f3` feat: social feed + emoji reactions (GH #9)  
**Tests:** 64/64 passing (10 new integration tests)

---

## Commit Message

```
feat: social feed + emoji reactions (GH #9)

- GET /api/social/feed — chronological feed from all users with per-post
  reaction counts and userReacted flag, joined with user names
- POST /api/social/react — toggle reaction on/off; returns updated reaction
  state for the post
- Social.svelte — feed UI with avatar initials, type-specific post cards,
  5-emoji reaction bar with optimistic updates and revert on failure
- Reaction counts aggregated in JS from a single bulk reactions query
- 10 new integration tests; 64/64 passing
```

---

## Architectural Changes

### New Files

| File | Purpose |
|------|---------|
| `server/routes/social.ts` | Social feed + reaction endpoints |
| `src/pages/Social.svelte` | Feed UI component |
| `scripts/seed-dev.ts` | Idempotent dev seed script |

### Modified Files

| File | Change |
|------|--------|
| `server/app.ts` | Mounted `socialRouter` at `/api/social` |
| `src/app.svelte` | Added `/social` route + nav link |
| `server/routes/food.ts` | Wrapped AI call in try-catch (bug fix) |
| `server/services/ai/index.ts` | Switched to `gemini-2.5-flash`; robust JSON extraction |

---

## API Endpoints

### `GET /api/social/feed`

Returns all posts from all users, newest first. Each post includes user name (joined from `users` table) and reaction state for the calling user.

**Response shape:**
```json
[
  {
    "id": 1,
    "userId": "abc123",
    "userName": "Dev User",
    "type": "weight_update",
    "content": { "weightKg": 84.5, "note": "Morning weigh-in" },
    "createdAt": "2026-06-15T10:00:00.000Z",
    "reactions": {
      "❤️": { "count": 2, "userReacted": true },
      "😂": { "count": 0, "userReacted": false },
      "💪": { "count": 1, "userReacted": false },
      "🔥": { "count": 0, "userReacted": false },
      "😭": { "count": 0, "userReacted": false }
    }
  }
]
```

**Reaction query strategy:** Fetches all reactions for all post IDs in a single `inArray` query; aggregates in JS to avoid N+1.

### `POST /api/social/react`

Toggles a reaction on or off. Returns updated reaction state for just the affected post.

**Body:** `{ postId: number, emoji: "❤️" | "😂" | "💪" | "🔥" | "😭" }`  
**Errors:** `400` invalid emoji, `404` post not found, `401` unauthenticated

---

## Frontend: `Social.svelte`

- **Avatar initials** derived from user name (up to 2 chars)
- **Relative timestamps** (`timeAgo`): "just now" / "3m ago" / "2h ago" / "1d ago"
- **Type-specific rendering** for all 5 post types: `weight_update`, `food_photo`, `milestone`, `ai_message`, `challenge_completion`
- **Type badge** (upper-right pill on each card)
- **Optimistic reactions**: UI flips immediately; `reacting: Set<number>` guards against double-click; server response reconciles; failure reverts via `loadFeed()`
- **Empty state** when no posts exist

---

## Seed Script (`npm run seed`)

Idempotent script for dev setup. Requires the server to be running.

```
Email:    dev@slimpals.test
Password: DevPass1!
```

Seeds: admin user, invite code `DEV-INVITE`, test account (via real Better Auth API for correct scrypt hashing), 4 social posts.

---

## Test Coverage

File: `tests/social/social.test.ts` — 10 tests

| # | Description |
|---|-------------|
| 1 | Empty feed returns `[]` |
| 2 | Posts from all users, ordered newest first |
| 3 | Each post has all 5 emoji slots, count 0, `userReacted: false` |
| 4 | `POST /react` adds a reaction, returns updated counts |
| 5 | Reacting with same emoji toggles it off |
| 6 | Multi-user counts aggregate correctly; `userReacted` scoped per caller |
| 7 | `POST /react` returns 404 for non-existent post |
| 8 | `POST /react` returns 400 for invalid emoji (`👍`) |
| 9 | `GET /feed` returns 401 without session |
| 10 | `POST /react` returns 401 without session |

---

## Bug Fixes (discovered during verification)

### Food analysis 502 error (Gemini quota / model issues)
- **Root cause 1:** `gemini-2.0-flash` quota exhausted on the user's key
- **Root cause 2:** Unhandled promise rejection in `aiService.analyzeFood()` caused Express to return an HTML error page (500), not JSON
- **Fix:** Wrapped AI call in try-catch; `502` JSON with specific messages for quota vs. general failure; switched to `gemini-2.5-flash`

### JSON parsing fragility
- **Root cause:** `gemini-2.5-flash` sometimes returns preamble text before the JSON object
- **Fix:** Changed from regex stripping code fences to `text.match(/\{[\s\S]*\}/)` — finds JSON anywhere in the response

---

## Feature Walkthrough (Verified)

**Prerequisites:** Dev server running (`npm run dev`), database seeded (`npm run seed`)

### 1. View the Social Feed

1. Open `http://localhost:5173`
2. Log in: `dev@slimpals.test` / `DevPass1!`
3. Click **Social** in the nav
4. You should see 4 posts: weight update, milestone, food photo, AI message

### 2. React to a Post

1. On any post card, click an emoji button (e.g. ❤️)
2. The button immediately highlights (optimistic update) and count increments
3. Click the same emoji again — it toggles off, count returns to 0
4. Try a different emoji — highlights separately

### 3. Multi-Emoji

1. Click ❤️ on one post → count shows 1, highlighted
2. Click 💪 on the same post → both emojis highlighted, independent counts

### 4. Auth Enforcement

```bash
curl -s http://localhost:3000/api/social/feed | jq .
# → { "error": "Unauthorized" } (401)

curl -s -X POST http://localhost:3000/api/social/react \
  -H 'Content-Type: application/json' \
  -d '{"postId":1,"emoji":"❤️"}' | jq .
# → { "error": "Unauthorized" } (401)
```

### 5. Invalid Emoji Rejection

```bash
# With a valid session cookie:
curl -s -X POST http://localhost:3000/api/social/react \
  -H 'Content-Type: application/json' \
  -b 'better-auth.session_token=...' \
  -d '{"postId":1,"emoji":"👍"}' | jq .
# → 400 { "error": "Invalid emoji" }
```

---

## Automated Verification Results

Script: `verify-social.mjs` (Playwright)  
**Result: 19/19 checks passed**

Checks covered: page load, feed rendering, post card structure, avatar initials, type badges, timestamps, reaction buttons, optimistic update, toggle-off, count display, empty state, auth-only access.
