# slimpals — Codebase Guide

## Stack
- **Frontend**: Svelte 5, Vite (port 5173), Tailwind CSS
- **Backend**: Express + TypeScript, port 3000
- **Database**: MariaDB via Drizzle ORM (`server/db/schema.ts`, migrations in `server/db/migrations/`)
- **Auth**: Better Auth
- **Tests**: Vitest (`npm test`), Biome for lint/format (`npm run check`)
- **Dev server**: `npm run dev` — starts both Vite and Express via concurrently

## Key paths
- `src/` — Svelte frontend (components, pages, stores, lib)
- `src/pages/` — Top-level pages: Home (the gym), Today, Progress (Weight/Food/Gym levels), SocialHub
  (Feed/Challenges/Tournaments/Badges), Settings, Admin
- `src/components/home/` — gym home shell: Hud, TodayDrawer, TodayList, LevelUp, icons; state in
  `src/lib/wallet.svelte.ts` (HUD numbers) and `src/lib/today.svelte.ts` (tasks); reward chips in `src/lib/fly.ts`
- `src/components/gym3d/` — the three.js gym (Gym3D.svelte, app.ts, NpcDialog, engine/, equipment/, people/, world/)
- `server/routes/` — Express API routes
- `server/services/` — Business logic
- `server/db/schema.ts` — Drizzle schema (source of truth for DB shape)
- `shared/types.ts` — Shared TypeScript types
- `tests/` — Vitest test files

## Commands
```
npm run dev          # start dev server (vite:5173 + express:3000)
npm test             # run vitest suite
npm run typecheck    # tsc --noEmit (both client and server tsconfigs)
npm run check        # biome lint
npm run db:generate  # generate drizzle migration
npm run db:migrate   # apply migrations
```

## Killing the dev server
```bash
pkill -f "concurrently" ; pkill -f "tsx.*server" ; pkill -f "node.*vite"
```

## E2E / bot tests (Playwright)
```bash
npm run seed      # needed first — e2e tests use the dev@slimpals.test account
npm run test:e2e  # runs against a fresh spawned server, not your running npm run dev
```
Heavier than the Vitest unit suite — run periodically/on-demand, not on every PR (not part of CI).
Always spawns its own dev server with `DEV_AUTOLOGIN_EMAIL` disabled regardless of `.env`, since
autologin would make the login/register/logout flow untestable. That means ports 3000/5173 must be
free — stop any manually-running `npm run dev` first. A `mobile-chromium` project (Pixel 7) runs only
`e2e/gym3d-*.spec.ts`. Specs that call the AI (food photo analysis, NPC dialog) need a real `GEMINI_API_KEY`.

## Canvas notes
The gym renders with three.js into a `<canvas>`; standard DOM tools don't apply inside it. Drive and
inspect it through `window.gym3d` (below), use pixel taps from `screenAt`/`screenOf`, and verify with
screenshots. Labels, bubbles, sheets and `NpcDialog` are DOM overlays.

## Gym home (3D gym)
The 3D gym is home (`/`, `src/pages/Home.svelte`): full screen under the fixed HUD, with a coach line, the
Today drawer (peeks above the tab bar) and "Place new gear" for pending upgrades. Tabs: Gym · Today ·
Progress · Social (`/gym` and `/gym/canvas` redirect to `/`). Home stays mounted on other tabs (hidden, so
the renderer pauses); `Gym3D.svelte` is loaded with a dynamic import. No WebGL2 (or a failed load) shows a
friendly card. Dev only: `window.spRemountGym()` remounts it (e2e leak check).
- Layout comes from `GET /api/gym/layout` (tables `gym_rooms`/`gym_plots`/`gym_pieces`, seeded lazily
  from unlocked upgrades by `server/services/gym/layout3d*.ts`; room/spot tables in `shared/gym3d/rooms.ts`).
- People follow `/api/gym/sim-state` (polled every 30s); tap a person for a name chip, Talk opens `NpcDialog`.
- Building (slice 2): coins (`user_gyms.coins`, 1500 starter), For Sale lots, timed jobs
  (`gym_jobs`, settled lazily on read), spots, upgrades and paint. All numbers live in `ECONOMY`
  (`shared/gym3d/economy.ts`); lots in `shared/gym3d/lots.ts`. Endpoints `POST /api/gym/layout/...`
  (`lots/:id/buy`, `rooms/:id/type|paint`, `pieces/:id/move|store|rotate|upgrade`, `jobs/:id/sweat|finish`)
  lock the gym row and return the whole layout; logic in `server/services/gym/build3d*.ts`.
- Economy (gym home): Sweat (exercise tasks) speeds jobs up (1 Sweat = -1h; finish = ceil(hours left));
  Greens (diet tasks, meal photos per meal type, a daily weigh-in) run the Slim Kitchen (menu items,
  rush hour). Missions have `kind` (exercise|diet|other, guessed from the title). Awards are paid once per
  activity through `gym_rewards` (unique gym+source, `server/services/gym/rewards.ts`). Coins are idle
  income: machines, the reception desk and the kitchen fill capped bubbles computed lazily from their
  collected times (`server/services/gym/income3d.ts`; `POST /gym/layout/income/collect`,
  `kitchen/menu/:item`, `kitchen/rush`); `GET /gym/layout?open=1` may carry `welcomeBack`; `GET /gym/wallet`
  feeds the HUD. Gym XP no longer gives coins and check-ins no longer cut jobs (`gym_activity_cuts` is legacy).
  Admin grants coins/Sweat/Greens (`POST /admin/users/:id/gym/coins|sweat|greens`) and can simulate time
  away (`POST /admin/users/:id/gym/away {hours}`).
- Life (slice 3): named NPC looks, titles, homes and signature lines live in one file,
  `src/components/gym3d/people/cast.ts` (staff wear `STAFF_UNIFORM`). Speech bubbles (`world/life.ts`, 3 pooled DOM
  bubbles) use lines from `GET /api/gym/npc-lines` (cached dialog batches + fired milestones, never the AI) plus
  cast/role lines (`shared/gym3d/npcLines.ts`). `world/happenings.ts` draws today's event (host + props by the
  entrance, `eventActive` from sim-state), active classes (a synced group in the class's room) and hero tags.
  Upgrade claims play in place (`Gym3DApp.claimCeremony`, no remount); lines in `shared/gym3d/celebrations.ts`.
  Admin sets a test event with `POST /admin/users/:id/gym/today-event`.
- Test hook while mounted: `window.gym3d` = `{ ready, stats(), tap(x, y), screenOf(key), people(), layout(),
  screenAt(x, y, z), panTo(x, z), moveTargets(), lineup(on?), info(key), claiming(), portrait(npcKey),
  coinsWaiting(), coinBubbles(), collectAll(), kitchen() }`;
  `stats()` gives rooms, pieces, people, drawCalls, geometries, textures, quality, fps, lots, pads, jobs, coins,
  sweat, greens, bubbles, says, event, classes, classPeople, heroes. It is cleared on unmount.
  `e2e/gym3d-life.spec.ts` covers events, classes, the chip, bubbles, the lineup and the claim ceremony;
  `e2e/gym3d-home.spec.ts` the HUD, drawer ticks, coin bubbles, Welcome back, the kitchen and the tabs.
  `e2e/gym3d-build.spec.ts` buys, finishes, types, moves and upgrades (`GYM3D_SHOTS=<dir>` saves screenshots).
- Every GPU resource goes through the asset cache and `Gym3DApp.dispose()`; `e2e/gym3d-smoke.spec.ts`
  remounts three times and checks WebGL2 contexts and geometry/texture counts do not grow.

## Admin panel
`src/pages/Admin.svelte` — manages users and badges. Any new entity, badge, user state, or content type introduced by a feature should be considered for admin panel support. Always check during issue scoping.

## Interconnected systems
Features often touch multiple systems. Always check during scoping:
- Badges (`server/routes/badges.ts`) — does it earn/unlock badges?
- Checkins/streak (`server/routes/checkins.ts`) — does it count as an activity?
- Challenges/sprints (`server/routes/challenges.ts`, `sprints.ts`) — does it affect objectives?
- Social feed (`server/routes/social.ts`) — should it post an event?
- NPC memory (`user_gym_npc_relationships`, NpcDialog) — does it update NPC relationships?
- Gym economy (`shared/gym3d/economy.ts`) — should it pay Sweat or Greens (via `payReward`)?
- Tournaments (`server/routes/tournaments.ts`) — does it affect eligibility?

---

## Agent Workflow System (`.agent/`)

State: `.agent/ledger/project_state.json`

### Slash commands
| Command | When to use |
|---------|-------------|
| `/agent-create-feature` | Starting a new feature from scratch |
| `/agent-create-issue` | Scoping the next queued milestone into an implementation plan |
| `/agent-solve-issue` | Implementing + validating the active issue |
| `/agent-reset-issue` | Inspecting state or recovering from a circuit-breaker lock |
| `/agent-ux-audit` | Standalone UX/visual/canvas audit on any feature at any time |

### Typical flow
```
/agent-create-feature
  → grill-me interview → PRD → vertical slices → seed queue → scope first slice

/agent-solve-issue
  → baseline green check → TDD implementation → Tier 1 (tests/lint/typecheck)
  → boot server → Tier 2 (DOM or canvas walkthrough) → Tier 3 (UX + visual)
  → cross-cutting checklist → commit → advance to next slice

/agent-ux-audit gym          # audit any feature independently
```

### At the start of any session
Check `.agent/ledger/project_state.json`. If `active_issue.status` is `active` or `paused_for_human_intervention`, surface it to the user immediately.
