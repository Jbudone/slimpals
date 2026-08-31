# Admin & Testing Support — Requirements and Gap Audit

## Why this doc exists

Features have been shipping without a consistent bar for two things: (1) can an admin/tester drive and inspect a feature's state without faking it end-to-end as a real user, and (2) is the feature protected by tests thorough enough that unrelated changes can't silently break it. This doc sets that bar (Part 1), then audits every existing feature against it (Part 2) so we can turn the gaps into a scoped backlog.

This is a living standard — new features should be checked against Part 1 during scoping (CLAUDE.md's "Admin panel" and "Interconnected systems" sections already gesture at this; this doc makes it concrete and adds the testing dimension).

---

## Part 1 — Requirements

### 1. One canonical admin identity

- There is exactly one unambiguous "admin" concept: the `users.isAdmin` boolean, enforced server-side by `requireAdmin` middleware (hard-disabled in production regardless of the flag).
- Seed/dev data must not create a decoy account that *looks* like the admin (named/emailed "Admin") but isn't flagged `isAdmin: true`. If dev tooling logs in as a specific seeded user, that user must be the actual `isAdmin: true` account, and the naming should make that obvious (not "Dev User" holding admin rights while an account literally named "Admin" doesn't).
- Dev autologin (`DEV_AUTOLOGIN_EMAIL`) logging in as an admin must be a documented, enforced property — not a coincidence that depends on two separate files independently agreeing on the same email string.

### 2. Admin panel must be unmistakable

- The admin area must be visually distinct enough that nobody could mistake a screenshot of it for a normal user page — not just a small colored pill on an otherwise standard header. Distinct layout, banner, or color treatment.
- Admin-only nav should be visually differentiated from regular nav items, not just conditionally rendered.

### 3. Every feature needs admin control, to this bar

For any feature/entity that stores per-user or shared state, the admin panel should let a tester, without impersonation-and-click-around as a workaround:

- **View** the real/current state for any user or shared entity (not only create/seed-and-hope).
- **Seed** representative data, including edge/boundary states relevant to that feature's logic (not just "generate N happy-path rows") — e.g. "one checkin from completing a streak," "a tournament one day from auto-resolving," "an NPC at max relationship stage."
- **Force/trigger** the feature's on-demand or scheduled jobs directly (e.g. challenge/sprint generation, content generation) instead of waiting on cron or real time to pass.
- **Reset/delete** data to return a user or entity to a clean state for repeat testing.

Impersonation (already supported) remains useful for viewing a feature exactly as a user would, but isn't a substitute for direct admin visibility into data — it shouldn't be the only way to check whether a seed worked.

### 4. Automated test thoroughness bar

Every route/service needs vitest coverage of:

- Happy path
- Auth and ownership boundaries (401/403/404, can't see or modify another user's data)
- Validation errors (400s)
- Idempotency, where the operation is meant to be idempotent
- **Cross-system interactions** — per CLAUDE.md's "Interconnected systems" checklist: does this feature award badges, post to the social feed, affect checkins/streaks, affect challenge/sprint/tournament objectives, or update NPC memory? Each such interaction needs its own assertion, not just an assumption that the other feature's own tests cover it.

When a change touches a system with existing test coverage elsewhere (e.g. anything that flows through checkins, since badges/social/gym-XP all hook into it), the full suite must run automatically — see CI below — rather than relying on someone remembering to run it.

### 5. Continuous integration (currently missing entirely)

- Tests, typecheck, and lint must run automatically on every push/PR. There is no CI today (no `.github/workflows/`), so regressions can merge silently even with good test coverage sitting locally.
- This is a prerequisite for the "automated regression safety net" the rest of this doc assumes — without CI, thorough tests are opt-in, not a guarantee.

### 6. Periodic bot / E2E tests

- For flows worth validating through the real UI or full API end-to-end (not just unit-level route tests) — a full checkin → badge → social-post chain, a canvas smoke check that the gym scene actually renders — maintain scripted bot tests using Playwright (already an installed dependency, currently unused with zero spec files or config).
- These are distinct from the CI-run unit suite: they're heavier, can be run periodically or on demand, and catch integration/rendering issues unit tests structurally can't.

### 7. Human-in-the-loop tests

- Some things can't be judged by a bot: canvas/animation visual quality, subjective AI-generated copy (challenge titles, victory messages, NPC dialog), timing-dependent UX. These need a documented manual checklist, not ad-hoc eyeballing.
- `.agent/prompts/validation.md` + `/agent-ux-audit` already define this protocol for canvas/UX — no evidence it's been run yet (`.agent/ledger/project_state.json` is empty). The same discipline should extend to non-canvas subjective checks (AI copy quality) and actually get exercised, with results recorded somewhere durable.

### Definition of done, per feature

A feature is "admin & testing complete" when: it has a canonical-admin-reachable view+seed+force+reset surface in the admin panel; its routes/services have vitest coverage including cross-system interactions; it's covered by CI; it has (or is explicitly exempted from) a periodic bot test; and any inherently-manual aspects have a documented human-in-the-loop checklist.

---

## Part 2 — Gap Audit (current state, as of 2026-08-30)

### Cross-cutting gaps (not feature-specific)

1. **Decoy admin account.** `scripts/seed-dev.ts` creates `admin@slimpals.test` ("Admin") without `isAdmin: true`, while the actual `isAdmin: true` account is `dev@slimpals.test` ("Dev User"). Confusing and fragile.
2. **Autologin→admin link is coincidental**, not enforced or documented as a real coupling.
3. **Admin panel is barely visually distinct** — a red "DEV ONLY" pill on a plain `<h1>`, nav link with no special styling.
4. **No CI whatsoever.** No `.github/workflows/`. Tests only run locally/on-demand.
5. **Playwright is dead weight.** Listed as a dependency, zero config, zero spec files, zero usage anywhere.
6. **No human-in-the-loop audit has ever actually been run** — the protocol exists (`/agent-ux-audit`) but the ledger shows no history.

### Per-feature gaps

| Feature | Admin support | Test coverage | Bot/E2E | Notes |
|---|---|---|---|---|
| **Badges** | Good — force-award any badge per user | Good | None | Missing: seeding "near-miss" preconditions in one step |
| **Checkins/streak** | Good — seed N-day streaks | Good | None | Gym-XP-on-checkin has no direct test; can't seed the grace-period edge (frozen-at-2-days-gap) via admin |
| **Challenges** | **None** — `/challenges/generate` exists but isn't in Admin.svelte; no force-complete/expire | Good breadth | None | Can't reach "1 goal from completion" or expired-challenge states via admin |
| **Sprints** | **None** — `/sprints/generate` not exposed; no force-complete | Good breadth | None | Same gap pattern as Challenges |
| **Tournaments** | **None** — no create/force-join/force-resolve/fast-forward via admin | Good, but `step_count` scoring is stubbed to always return 0 and untested; tie-break is arbitrary (picks index 0) and untested | None | Highest-risk feature: real scoring gap plus zero admin control |
| **Social feed** | **None** — no view/moderate/inject-post admin surface | Checkin auto-share + manual share covered; **weight/food auto-share paths untested** | None | Can only get a post into the feed indirectly via other features' seed tabs |
| **Weight** | Seed-only (generate N entries), no view/edit/delete of existing entries | Decent CRUD/auth/isolation; **streak/unit-conversion/goal-progress math and the gym-XP+social-post side effects of logging weight are untested** | None | Impersonation is the only way to see a user's real data in-panel |
| **Food** | Seed-only, same pattern as Weight | Decent CRUD/validation | None | Same impersonation-only visibility gap |
| **Gym/Phaser (NPCs, animation, equipment)** | **Minimal** — only a single "Generate Gym Content" button; no NPC state inspector, no time/schedule override, no dialog replay, no animation/sprite state jump, no equipment/upgrade viewer | Best in the codebase for underlying logic (10 test files: scheduling, mood, relationship math, animation-key resolution, content pipeline) | None — canvas/UI logic (`NpcDialog.svelte`, `GymScene.ts`) has zero coverage; an MCP browser-automation config exists but is `enabled: false` | Most complex feature, most in need of admin hooks specifically *because* canvas can't be DOM-tested |

---

## Tracked issues

Originally broken into GitHub issues #42–#59. After a granularity review, the multi-capability issues (#44–#52) were closed and re-split into single-capability issues:

| Issue | Title | Type | Blocked by |
|---|---|---|---|
| #42 | Fix admin identity: canonical `isAdmin` seed account, always-admin autologin | HITL | — |
| #43 | Add CI: lint + typecheck + test on every push/PR | AFK | — |
| #82 | Challenges: admin view | AFK | — |
| #83 | Challenges: admin seed | AFK | — |
| #84 | Challenges: admin force-trigger | AFK | — |
| #85 | Challenges: admin reset | AFK | — |
| #86 | Sprints: admin view | AFK | — |
| #87 | Sprints: admin seed | AFK | — |
| #88 | Sprints: admin force-trigger | AFK | — |
| #89 | Sprints: admin reset | AFK | — |
| #90 | Tournaments: admin view | AFK | — |
| #91 | Tournaments: admin seed | AFK | — |
| #92 | Tournaments: admin force-resolve | AFK | — |
| #93 | Tournaments: admin reset | AFK | — |
| #94 | Social feed: admin view/moderate | AFK | — |
| #95 | Social feed: admin inject-post | AFK | — |
| #96 | Weight: admin view | AFK | — |
| #97 | Weight: admin edit/delete | AFK | #96 |
| #98 | Food: admin view | AFK | — |
| #99 | Food: admin edit/delete | AFK | #98 |
| #100 | Gym: admin NPC state inspector/editor | HITL | — |
| #101 | Gym: admin time/schedule override | HITL | — |
| #102 | Gym: admin dialog replay tool | HITL | — |
| #103 | Gym: admin animation/sprite state jump | HITL | — |
| #104 | Gym: admin equipment/upgrade viewer | AFK | — |
| #105 | Test coverage: checkin gym-XP award | AFK | — |
| #106 | Test coverage: badge-triggered social-share path | AFK | — |
| #107 | Test coverage: weight math + gym-XP effects | AFK | — |
| #108 | Test coverage: weight/food auto-share-to-feed | AFK | — |
| #53 | Human-in-the-loop checklist: AI copy & subjective UX | HITL | — |
| #54 | Bug: tournament `step_count` scoring always 0, arbitrary tie-break | AFK | — |
| #55 | Bot test harness setup + auth smoke (Playwright) | AFK | — |
| #56 | Bot test: checkin → badge → social-post chain | AFK | #55 |
| #57 | Bot test: weight/food logging → streak/social effects | AFK | #55 |
| #58 | Bot test: challenges/sprints/tournaments flows | AFK | #55 |
| #59 | Bot test: gym canvas render smoke | HITL | #55 |

The admin-panel *visual* distinction requirement (Part 1 §2) is covered by redesign issue #41 (`docs/prd-visual-redesign.md`), not duplicated here.
