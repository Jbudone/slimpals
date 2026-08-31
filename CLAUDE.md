# slimpals — Codebase Guide

## Stack
- **Frontend**: Svelte 5, Vite (port 5173), Tailwind CSS
- **Backend**: Express + TypeScript, port 3000
- **Database**: MariaDB via Drizzle ORM (`shared/schema.ts`, migrations in `drizzle/`)
- **Auth**: Better Auth
- **Tests**: Vitest (`npm test`), Biome for lint/format (`npm run check`)
- **Dev server**: `npm run dev` — starts both Vite and Express via concurrently

## Key paths
- `src/` — Svelte frontend (components, pages, stores, lib)
- `src/pages/` — Top-level page components (Dashboard, Gym, Admin, Weight, Food, etc.)
- `src/components/gym/` — Phaser game layer (PhaserGym, GymUI, NpcDialog, NpcSprite, scenes/)
- `server/routes/` — Express API routes
- `server/services/` — Business logic
- `shared/schema.ts` — Drizzle schema (source of truth for DB shape)
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
free — stop any manually-running `npm run dev` first.

## Canvas / Phaser notes
The gym feature uses Phaser 3 rendered into a `<canvas>`. Standard DOM tools don't apply inside the canvas. For canvas testing:
- Use screenshot comparison (before/after) as the primary verification method
- Canvas clicks require pixel coordinates, not CSS selectors
- Phaser scene state can be inspected via browser console: `window.game?.scene?.getScene('GymScene')`
- NPC dialog (`NpcDialog.svelte`) may be a DOM overlay or canvas-drawn — check which

## Admin panel
`src/pages/Admin.svelte` — manages users and badges. Any new entity, badge, user state, or content type introduced by a feature should be considered for admin panel support. Always check during issue scoping.

## Interconnected systems
Features often touch multiple systems. Always check during scoping:
- Badges (`server/routes/badges.ts`) — does it earn/unlock badges?
- Checkins/streak (`server/routes/checkins.ts`) — does it count as an activity?
- Challenges/sprints (`server/routes/challenges.ts`, `sprints.ts`) — does it affect objectives?
- Social feed (`server/routes/social.ts`) — should it post an event?
- NPC memory (Phaser scene state) — does it update NPC relationships?
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
