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
- Rating and goals: the gym's 1-5 star rating is a pure score of the layout (`shared/gym3d/rating.ts`: room
  levels, room-type variety, decor, staff pieces, rooms of 2+ plots, open walls up to 4, vibes up to 3 rooms). The rolling
  goals queue is `shared/gym3d/goals.ts` (fixed order, each pays Sweat/Greens once). Both ride on `GET /gym/layout`
  (`rating`, `goals`, and `goalsPaid` for goals reached by that read) and are settled in `getGymLayoutDto`
  (`layout3dStore.ts`) through `gym_rewards` (`goal:<id>`; `payGymReward` takes the gym row lock first so racing
  reads pay once). The first read of a gym writes `goal:_start` and marks what it already meets as done without
  paying. UI: `GoalsCard.svelte` (star button under the coach; the account avatar owns the top-right) fed by `src/lib/goals.svelte.ts`. Tests:
  `tests/gym3d/rating-goals.test.ts` (pure), `goals-route.test.ts` (DB).
- Open walls: the wall between two finished, typed rooms can be knocked out for coins (`ECONOMY.walls`: 400, +250
  for each one already open). A wall is named from the plot on its far side (`shared/gym3d/walls.ts`: `WallRef` =
  px, pz and axis x|z, `sharedWalls`, `openWallCost`); rows live in `gym_open_walls` (migration 0024) and the layout
  carries `openWalls` and `nextWallCost`. `POST /api/gym/layout/walls/open {px, pz, axis}` (`walls3d.ts`) validates
  that the wall exists and is not open, then charges under the gym row lock. The world (`world.ts` `buildWalls`)
  leaves an open wall out entirely, so paths and sight lines join the rooms. It scores 1 star point each (cap 4)
  and pays the `wall-1` goal. UI: the room menu's "Open walls" page. e2e: `gym3d-life.spec.ts` ("walls").
- Room style and vibe (the room menu's Customize page, `shared/gym3d/vibes.ts`): a style (Industrial, Neon, Zen,
  Retro) is a whole-room look made only of the existing paint palettes, applied in one tap through the paint
  endpoint (no new server code; `styleOf` recognises a room painted exactly like one). A vibe (Chill, Hype, Focus;
  `gym_rooms.vibe`, migration 0026) costs `VIBE.cost` coins to set or change, is free to clear
  (`POST /api/gym/layout/rooms/:roomId/vibe {vibe|"none"}`, `vibes3d.ts`, under the gym row lock) and: tints the
  room's floor with a glow (`world.ts` `buildFloors`), sets the workout pace of members in it (`vibePace`, applied
  in `members.ts` `startUse` and `step`), adds `VIBE.bonus` (+4%) to its machines' coins in `income3d.ts`, and
  scores `VIBE.scorePoints` per room with a vibe (up to 3 rooms) in the star rating. e2e: `gym3d-life.spec.ts`
  ("customize").
- Sports court (gh-130): the seventh room type, `court` (`RT.court`, grid layout; gear `court_hoop` and `court_pickle`,
  catalog category `court`, 9000/10000 XP). It is a content addition: seeded upgrades, `KEY_ROOM` in `layout3d.ts`, builders in
  `equipment/builders.ts`, `ROOM_ORDER`, `PICKABLE_TYPES`, hires (Court coach) and the room picker. Staffed bonuses are the
  existing hires and staff training.
- Seasonal menu (#141, first piece): `KITCHEN_MENU` has autumn items (Pumpkin spice shake, Apple-cinnamon oats; `months`
  [9, 10, 11]) that can only be added in season (`menuInSeason`, checked in `unlockKitchenItem`) and stay on the menu once
  added; the menu sheet and the 3D board list what is on plus what is in season. Not yet: Halloween ghosts, decor, costumes.
- Monthly reward track (#126, first slice): `shared/gym3d/rewardTrack.ts` (pure: a step per day of the UTC month, a theme per
  month, bigger steps every 7th and the last, `claimBlock`). One step a day, only after that day's check-in; missed days
  just mean fewer steps. No table: a claimed step is a `gym_rewards` row `track:<YYYY-MM>:<n>` and the day's claim a
  `trackday:<YYYY-MM-DD>` marker, written together under the gym row lock (`server/services/gym/rewardTrack.ts`;
  `GET /api/gym/reward-track`, `POST /api/gym/reward-track/claim`). Steps pay coins, Sweat and Greens. UI: a section in
  `GoalsCard.svelte` (`src/lib/rewardTrack.svelte.ts`); taking a step bursts and flies the reward chips to the HUD, then the
  wallet reloads (e2e: `gym3d-life.spec.ts` "reward track"). Admin: `POST /admin/users/:id/gym/track-step {step}` sets this month's progress without paying (0 resets;
  Admin's gym section). Badges: a claim awards `track_first`, `track_week` (7 steps in a month) and `track_full` (every step) through `checkAndAward`
  (`track_step` context; the claim response carries `newBadges`, shown as toasts, and `shareBadges` posts them to the feed as milestones for users with auto-share on). Not yet: NPC/coach rewards beyond the hat, the
  dashboard/HUD placement, admin authoring of tracks.
- Cosmetics inventory (#135, first slice): `gym_cosmetics` (migration 0027; one row per gym and key, source recorded)
  holds what a gym owns besides gear; the catalog is `shared/gym3d/cosmetics.ts` (October's Jack-o'-lantern, Cobweb neon
  and the coach's witch hat). The reward track grants them: its first three big steps of a month give that month's cosmetics
  (`MONTH_COSMETICS` in `shared/gym3d/rewardTrack.ts`, granted in `claimTrackStep`). `GET /api/gym/cosmetics` lists them.
  Decor cosmetics go on show from a room's Customize page ("Your decor": `POST /api/gym/cosmetics/:key/place {roomId}` and
  `/remove`, `server/services/gym/cosmeticPlace.ts`): the first free decor place of that room gets a decor piece with upgrade
  key `cosmetic:<key>` (once per gym; builders `lantern`, `cobwebs` in `equipment/decor.ts`) that scores as decor.
  `grantCosmetic` (`server/services/gym/cosmetics.ts`) is the one way to grant; finishing a monthly challenge grants the
  `challenge_trophy` (first completion only; the challenge page says so). Outfits are worn by default and can be taken off: `gym_cosmetics.worn`
  (migration 0028), `POST /api/gym/cosmetics/:key/wear {worn}` (`wearCosmetic`, outfits only), a "Coach outfit" toggle in
  `GoalsCard.svelte`; the coach avatar (`coachSvg` in `components/home/icons.ts`, worn keys from `src/lib/cosmetics.svelte.ts`) wears the
  witch hat while it is on. Not yet: NPC/staff outfits, per-challenge decor and
  tiers/milestones (#124), a standalone inventory screen. e2e: `gym3d-life.spec.ts` ("cosmetics").
- Staff growth: the named staff (Marcus, Lisa, Coach Rivera, Dr. Kim, Jordan, Alex) have a level 1-5, three stats
  and a perk (`shared/gym3d/staff.ts`: `STAFF`, `trainCost`, `areaMultiplier`). Training costs coins; every level above
  1 adds +3% coins/hour to the staff member's area (a room type's machines, the desk or the kitchen; the manager adds
  half of that to every machine), applied in `income3d.ts`. Rows live in `gym_staff` (no row = level 1;
  migration 0023). `GET /api/gym/staff` lists the cards; `POST /api/gym/staff/:npcKey/train` locks the gym row, pays
  the waiting coin bubbles first (so the new rate only counts from then) and charges the coins (`server/services/gym/
  staff.ts`). UI: the tap chip of a staff NPC (`Gym3D.svelte`) shows level, perk, stat meters and Train. Admin: `POST
  /admin/users/:id/gym/staff-level {npcKey|"all"|"hire:<id>", level}` and `POST /admin/users/:id/gym/reset-extras
  {what: staff|hires|walls|hustle}` (hustle = today's bonuses); buttons in Admin's gym section. Tests: `tests/gym3d/staff.test.ts`, `staff-route.test.ts`,
  `admin-extras.test.ts`, e2e in `gym3d-life.spec.ts`.
- Hiring: any finished, typed room except the lobby takes up to `HIRE.perRoom` (2) hires: a coach, lifeguard,
  therapist or barista (`shared/gym3d/hires.ts`: `HIRE_ROLES`, `hireCost` = 300 + 150 per hire already made in the
  gym, `hireBonus` = +5% coins/hour for that room's machines at level 1, plus the training bonus per level). Rows live
  in `gym_hires` (migration 0025). `POST /api/gym/layout/rooms/:roomId/hire` (`hires3d.ts`) validates the room and
  charges under the gym row lock; the layout carries `hires` and `nextHireCost`. Hires show up in `GET /gym/staff`
  as cards keyed `hire:<id>` and train through the same endpoint; `income3d.ts` adds their bonus to the room's
  machines. The people system (`People.syncHires`) stands each hire at a post in their room (they walk in from
  the door when new) with their role as the chip title; the intro line comes from `hireIntro`. UI: the room menu's
  Staff page has the Hire button. The first hire pays the `hire-1` goal. e2e: `gym3d-life.spec.ts` ("hiring").
- Life (slice 3): named NPC looks, titles, homes and signature lines live in one file,
  `src/components/gym3d/people/cast.ts` (staff wear `STAFF_UNIFORM`). Speech bubbles (`world/life.ts`, 3 pooled DOM
  bubbles) use lines from `GET /api/gym/npc-lines` (cached dialog batches + fired milestones, never the AI) plus
  cast/role lines (`shared/gym3d/npcLines.ts`). `world/happenings.ts` draws today's event (host + props by the
  entrance, `eventActive` from sim-state), active classes (a synced group in the class's room) and hero tags.
  Upgrade claims play in place (`Gym3DApp.claimCeremony`, no remount); lines in `shared/gym3d/celebrations.ts`.
  Admin sets a test event with `POST /admin/users/:id/gym/today-event`.
- Bubbles: every overlay over the canvas (tap chip, timer/claim cards, coin bubbles, speech + ambient lines) is a
  managed label in `world/labels.ts`, placed each frame by `world/bubbleLayout.ts` (pure, unit-tested): priority
  chip > timers > coins > player-caused lines > NPC lines > ambient, no overlap (slide up/aside or hide), clamped
  between `setInsets` top/bottom, capped (2 lines on a phone). Input listens on the gym host: a drag that starts on
  a bubble pans, only a short tap reaches it. Tapping a line pops it; the tap chip is a stat card (Role, Mood,
  Doing, Bond; never body weight) closing on a tap outside, a pan or after `CHIP_TTL`. Event / class banners,
  hero and name tags are managed too (kind `tag`, below speech and above ambient, take no taps, not counted in the cap): on screen,
  clear of bubbles, banners wrap.
- Ambient banter (gh-140, first slice): `shared/gym3d/banter.ts` holds short scripted exchanges (2-3 dry lines, no
  exclamation marks) picked to fit the gym (`BanterContext`: finished room types, placed gear, a crowd, today's event, a running class, gear upgraded in the last 3 minutes): a missing pool,
  sauna, ring or megaformer gets talked about, plain chatter is the fallback, recent ids are not repeated. `Life.banter`
  plays one between two nearby people about once a minute as alternating bubbles through the normal bubble pool
  (`app.banterContext()` feeds it). Admin's content tuning has an "NPC Banter" type (`contentTuning/npcBanter.ts`, style doc `docs/npc_banter.md`; a sample is a few exchanges for a chosen situation). Not yet: the nightly AI batch that would feed it into the game, relationships.
- Upgrade look (gh-134, first slice): `equipment/tiers.ts` `applyTier` still recolours and adds the edge and pennant, and
  now `addUpgradeParts` gives every upgraded machine real parts: tier 2 a floor mat and a console (screen on a stand), tier 3
  a bigger gold screen, speakers and an overhead light arch. Generic for all gear (sized from the piece footprint); the
  new parts stay hidden until the ribbon is cut, then pop in with a confetti burst (`celebrate` -> `Build.reveal`). Members
  prefer upgraded gear (`chooseNext` weights a free station 1 + 0.6 per tier above 1) and now and then say so on starting a
  set (`People.onUpgradedUse` -> `Life.gearReaction`, lines in `shared/gym3d/banter.ts` `GEAR_LINES`). A hand-built model per
  machine tier is still to do.
- October ghost (#141, first slice): `shared/gym3d/ghost.ts` (`ghostSeason`: October only, `GHOST_LINES`: dry and supportive,
  no exclamation marks). `Happenings.syncGhost` (called from the sim poll via `Gym3DApp.ghostOn`) floats a white "Ghost" extra
  in the lobby and drifts it to the next lobby spot every 40 s; `Life` gives it ghost lines and the name "Ghost". `?ghost=1` /
  `?ghost=0` force it on or off (tests, demos); `stats().ghost` is 1 while it is about. e2e: `gym3d-life.spec.ts` ("ghost").
  Every third drift it stands guard in front of the lockers when they are built (`GHOST_LOCKERS` label, `GHOST_LOCKER_LINES`; not covered by e2e, it needs ~80 s). Not yet: ghosts making early leavers stay, costumes, the costume contest.
- Street life (#131, first slice): `People.trickleStreet` (`people/members.ts`) sends a few passers-by (`pass:<n>`, kind `extra`,
  at most half the ambient cap) along the pavement in front of the gym from one edge to the other every 6-12 s; about one in
  eight turns in at the door (`after: "enter"`) and becomes a member. The pavement has street lamps and, across it, a road with a dashed
  centre line and a zebra crossing from the curb at the door (`world.ts` `buildGround`, static scenery). Four blocky cars drive along it in both lanes
  (`world/traffic.ts`, one batched mesh each, wrapping at the edges; none with reduced motion; `stats().cars`). Across the road stand MaxOut (the rival gym) and the Burger Baron: plain
  blocks with a billboard on the roof (`world.ts` `buildStreetShops`); banter in `shared/gym3d/banter.ts` compares with MaxOut when the gym
  lacks a pool or sauna. Burger Baron sale: at `BURGER.stars` (4) the billboard reads FOR SALE (`shared/gym3d/burger.ts`, `burgerState`); `POST /api/gym/layout/burger/buy` (`services/gym/burger.ts`, under the gym row lock) charges `BURGER.cost` once (claim `gym_rewards` `burger:bought`) and the sign becomes "BARON Jr." and smaller. The layout carries `burger`; the stars card (`GoalsCard.svelte`) has the Buy button. Bus stop: a roofed shelter on the pavement `BUS_STOP_DX` (7) east of the door (`world.ts` `buildGround`) and a yellow bus in `world/traffic.ts` that pulls in at it for 5 s on each pass (counted in `stats().cars`). Not yet: the lot becoming a plot with a street door, a MaxOut event. Bus waiters: about one passer-by in five (never more than one at a time, none with reduced motion) walks to the stop and waits (`after: "wait"`, `People.addWaiter`, `boardWaiters`; `stats().waiting`); when the bus is in (`Traffic.busAtStop`, wired as `People.busAtStop`) they walk to it and are gone, or wander off after 2 minutes. Dog walker: about 3 in 10 passers-by who walk on past have a small dog on a lead (`People.addDog`, `Person.dog`, a child mesh of the rig root, freed in `remove`; `stats().dogs`). e2e: `gym3d-life.spec.ts` ("street", "burger").
- Coach bubble (#125, first slice): the coach's line on the gym home comes from `shared/gym3d/coachLines.ts` (`coachLineFor`): a line in the
  voice of the chosen personality (friendly, drill sergeant, roaster, anime sensei, bro) for the situation (new gear, loading, all done,
  streak milestone, tasks left by morning/day/evening), skipping the last three it said (`Home.svelte` keeps them). Challenge commentary: with a joined challenge the bubble now and then (2 in 5, when nothing
  urgent is up) speaks about it instead of the task count, and the Challenges page shows the coach's note for the day (`challengeLineFor`,
  stage = start / ahead / on pace / behind / finale from the goals' average completion against the month's pace, `src/lib/challengeCoach.ts`;
  computed on the fly, not stored, since the lines are scripted). Not yet: lines for coins piling up, AI-generated per-day commentary,
  portraits per personality, the coach lines in Admin's content tuning.
- Challenge milestones (#124, first slice): a monthly challenge pays the gym at 25/50/75/100% of its goals' average completion
  (`shared/challenges/milestones.ts`: coins, and Sweat/Greens on later steps). `PATCH /api/challenges/:id/progress` pays what was
  reached (`server/services/challenges/milestones.ts`, a `gym_rewards` claim `challenge:<id>:m<pct>` under the gym row lock, so each
  pays once, also across an admin progress reset) and returns `milestonesPaid`; the Challenges page shows the four-step track and
  a note when one pays. Not yet from #124: bronze/silver/gold tiers, new task types, themed seed challenges, a decor reward per
  challenge, the dashboard banner.
- Taps (`world/picking.ts`): people > equipment (pieces, spots, sites, kiosk) > room (floor, walls, lots) > open
  ground, nearest within a category; `TAP_SLOP` (6px) is both the pan start and the tap limit, so a drag (or a
  pinch) never selects. Feedback (`world/tapFx.ts`): a pooled marker (ring under a person/piece/spot/kiosk, outline
  around a room/lot) while selected, a squash, one pooled floor ripple, `navigator.vibrate(10)`; DOM badges and
  coin bubbles get `.g3d-tapped`. Reduced motion: marker only. A room tap opens the room action menu (info, Upgrade
  gear, Staff, Customize = paint + decor; `Selection.view`), never paint first.
- Tap-to-hustle: taps in quick succession (`ECONOMY.hustle.gapMs`) on a member who is working out speed up their
  reps and make them say a line (`shared/gym3d/hustleLines.ts`); after `ECONOMY.hustle.taps` they finish early and
  the host asks `POST /api/gym/layout/hustle/:pieceId` (`server/services/gym/hustle.ts`) for a few coins. The server
  decides: the piece must be a working machine, the daily count is claimed in `gym_rewards` (`hustle:<day>:<n>`),
  the payout shrinks through the day (`hustleCoins`) and stops at `dailyCap`. The first tap is the usual one (their
  machine's sheet, see `picking.ts`); the gesture is in `Gym3DApp.tapAt` (`rayWorker`, `hustleTap`).
- Spot sheet (tap an empty pad): a locked spot says how many room points the room has of the points its level needs
  (`LV_TH`); an open one lists stored and still-locked gear with a picture each (`Gym3DApp.gearPreview` ->
  `World.previewGear`: built like a placed piece, drawn once offscreen, cached per key; the shared geometries stay in
  the asset cache until `dispose()`), coins per hour, and for locked gear the XP still to go. e2e: `gym3d-life.spec.ts`
  ("spots").
- Test hook while mounted: `window.gym3d` = `{ ready, stats(), tap(x, y), screenOf(key), people(), layout(),
  screenAt(x, y, z), panTo(x, z), moveTargets(), lineup(on?), info(key), claiming(), portrait(npcKey),
  coinsWaiting(), coinBubbles(), collectAll(), kitchen(), bubbles(), say(key, text), pick(x, y) }` (pick: what a
  tap would select, without selecting);
  `stats()` gives rooms, pieces, people, drawCalls, geometries, textures, quality, fps, lots, pads, jobs, coins,
  sweat, greens, bubbles, says, mark, rippling, taps, event, classes, classPeople, heroes. It is cleared on unmount.
  `e2e/gym3d-life.spec.ts` covers events, classes, the chip, bubbles (no overlap, tap to pop, pan
  from a bubble, the chip closing), the lineup and the claim ceremony;
  `e2e/gym3d-home.spec.ts` the HUD, drawer ticks, coin bubbles, Welcome back, the kitchen and the tabs.
  `e2e/gym3d-build.spec.ts` buys, finishes, types, moves and upgrades (`GYM3D_SHOTS=<dir>` saves screenshots).
  `e2e/gym3d-tap.spec.ts` the room menu, Customize, tap feedback, drags that never select and the class banner.
- Every GPU resource goes through the asset cache and `Gym3DApp.dispose()`; `e2e/gym3d-smoke.spec.ts`
  remounts three times and checks WebGL2 contexts and geometry/texture counts do not grow.

## Working autonomously
The owner's standing instruction: do not ask what to work on next. After a PR merges, pick the next task yourself with
a best guess and carry on, per PR: new branch from `master`, lean tests, `npm run check` + `typecheck` + tests, open the
PR ("Closes #N" only when the issue is fully done), merge with a merge commit once CI is green, delete the branch, repeat.
- Choosing: take the epic #127 items and open issues in a sensible order. When the best item is blocked or large, do the
  unblocking prerequisite or a first vertical slice of it; never stop to ask. Record the guess in the PR description.
- Stop only for a real blocker: a destructive or outward-facing action nobody authorized, missing credentials, or a CI
  failure you cannot fix. Say what was decided in the final message, not as a question.
- Backup check-ins (`send_later`) and PR subscriptions cover waiting on CI; do not end a turn just because CI is pending
  if other work can start on a fresh branch.

## Scheduled jobs
No external cron: `server/index.ts` starts an in-process scheduler (`server/services/scheduler/`) that ticks
every minute when `SCHEDULER_ENABLED` is on (unset = on only with `NODE_ENV=production`; `1`/`0` force it;
Playwright sets `0`, Vitest never starts it). Jobs (`scheduler/jobs.ts`, all UTC): monthly challenge (1st,
00:05), weekly sprints (Mon 00:05), weekly inspiration (Mon 00:10), nightly gym content + NPC dialog for gyms
active in the last 7 days (00:20, `findActiveGymUserIds`), recurring tournaments (daily 00:25: this and next week plus this and next month, `server/services/tournaments/recurring.ts`,
pure periods and type rotation in `shared/tournaments/recurring.ts`; system tournaments have `creator_id` null and a unique `system_key`, show as
"Featured" on the Tournaments page, and post the winner to the feed), tournament auto-resolve (every 15 min). Each run is
claimed per period in `scheduled_job_runs` (unique job+period), so restarts/double ticks never rerun a period;
failures retry after 1h, max 3 tries. Admin → "Scheduled jobs" shows last run/next due and "Run now"
(`GET /admin/scheduler`, `POST /admin/scheduler/:job/run`). The cron-style endpoints
(`POST /api/challenges/generate`, `/sprints/generate`, `/inspiration/generate`, `/gym/cron/generate-content`)
skip session auth but require `X-Cron-Secret` = `CRON_SECRET` (`server/middleware/requireCronSecret.ts`;
unset = always 401). The scheduler calls the services directly and does not need `CRON_SECRET`.

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
