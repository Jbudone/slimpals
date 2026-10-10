# slimpals — Codebase Guide

## Stack
- **Frontend**: Svelte 5, Vite (port 5173), Tailwind CSS
- **Backend**: Express + TypeScript, port 3000
- **Database**: MariaDB via Drizzle ORM (`server/db/schema.ts`, migrations in `server/db/migrations/`)
- **Auth**: Better Auth
- **Tests**: Vitest (`npm test`), Biome for lint/format (`npm run check`); `npm run typecheck` also checks `.svelte` for undefined names
- **Dev server**: `npm run dev` — starts both Vite and Express via concurrently

## Key paths
- `src/` — Svelte frontend (components, pages, stores, lib)
- `src/pages/` — Top-level pages: Home (the gym), Today, CompeteHub (Challenges/Tournaments), Progress (Weight/Food/Gym levels),
  SocialHub (Feed/Badges), Settings, Admin. Five tabs in swipe order (`src/lib/tabs.ts`): Gym · Today · Compete · Progress · Social;
  a sideways swipe on a page walks them (`src/lib/swipe.ts`; not on the gym, which pans; the hubs swipe between their segments first).
  The joined challenge's "did you do this today?" checks sit inside the task list itself (`components/home/ChallengeChecks.svelte`, in `TodayList` so the Today tab and the gym drawer both show it; state in `src/lib/challengeToday.svelte.ts`): a dashed, themed frame with the challenge banner and a "Challenge" chip, square stamp buttons (not round ticks) and its own count ("1/3 today"), so a skipped check never reads as an unfinished task. Below the tasks, `CompeteCard.svelte` ("In the running") shows your tournament places and a nudge to join the month's challenge when you have not. e2e: `challenges-tournaments.spec.ts`.
  Rewards page (`/rewards`, under the Today tab, `pages/Rewards.svelte`): the month's reward track as a path you walk (`components/home/RewardTrack.svelte`: a node a day, big chests on milestone days with their rewards on show, today's step glowing, opens on the next step) and "Coming up" (`UnlockTrack.svelte`, `lib/unlocks.ts` `upcomingUnlocks`: the next gear by XP, from the layout's `lockedGear` kept in `gymGoals.locked`). Reached from the stars card (`rewards-open`) and a row at the top of Today (`today-rewards`). The road ahead is shown without going looking, by one rule, "reveal three, hint one, hide the rest" (`unlockRail`, `REVEALED` in `lib/unlocks.ts`, drawn by `home/UnlockRail.svelte`: sticker cards, the first with a progress ring, then a "A surprise · Level N" mystery card, nothing beyond): a next-unlock bubble under the account avatar on the gym home (`home/UpNext.svelte`, `upnext`, opens the Rewards page), an "Up next in your gym" card on Today (`today-upnext`), the level-up overlay (`level-next`) and the Rewards page's "Coming up" list. As XP comes in the road moves on and a new hint appears.
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
`e2e/gym3d-*.spec.ts`. In October the ghost season is on by default (ghost, witch hats, pumpkins, people talked into staying): specs that need a quiet gym use `?ghost=0`. The phone draw-call budget asserted in `gym3d-build`/`gym3d-tap` is 300 (a full gym with the street was ~265). Run alone, a spec is far more reliable than inside the whole suite on a slow box. Specs that call the AI (food photo analysis, NPC dialog) need a real `GEMINI_API_KEY`.

## Canvas notes
The gym renders with three.js into a `<canvas>`; standard DOM tools don't apply inside it. Drive and
inspect it through `window.gym3d` (below), use pixel taps from `screenAt`/`screenOf`, and verify with
screenshots. Labels, bubbles, sheets and `NpcDialog` are DOM overlays.

## Gym home (3D gym)
The 3D gym is home (`/`, `src/pages/Home.svelte`): full screen under the fixed HUD, with a coach line, the
Today drawer (peeks above the tab bar) and "Place new gear" for pending upgrades. Tabs: Gym · Today ·
Compete · Progress · Social (`/gym` and `/gym/canvas` redirect to `/`). Home stays mounted on other tabs (hidden, so
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
  `GoalsCard.svelte` (`src/lib/rewardTrack.svelte.ts`); taking a step plays a short synthesized chime (`src/lib/chime.ts`, WebAudio, silent under reduced motion or when the "Sound" toggle in the stars card is off; kept in localStorage `sp-sound`), bursts and flies the reward chips to the HUD, then the
  wallet reloads (e2e: `gym3d-life.spec.ts` "reward track"). Admin: `POST /admin/users/:id/gym/track-step {step}` sets this month's progress without paying (0 resets;
  Admin's gym section). Badges: a claim awards `track_first`, `track_week` (7 steps in a month) and `track_full` (every step) through `checkAndAward`
  (`track_step` context; the claim response carries `newBadges`, shown as toasts, and `shareBadges` posts them to the feed as milestones for users with auto-share on). The stars button on the gym home carries a pulsing green dot while today's step can be taken (`track-dot`). Authoring: an admin can set a month's theme and per-step coin/Sweat/Greens payouts (`reward_track_overrides`, migration 0036; `TrackOverride`, `validateTrackOverride`, `trackSteps(key, override)` in `shared/gym3d/rewardTrack.ts`; `GET|PUT|DELETE /api/admin/reward-track/:month`, `services/gym/rewardTrackOverride.ts`; Admin's "Reward track" card; e2e `admin-track.spec.ts`, needs `npm run seed` and the migration applied); cosmetics stay on the rule table. Not yet: NPC/coach rewards beyond the hat, the
  dashboard placement.
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
  witch hat while it is on. The group coach NPC (Coach Rivera) and the receptionist (Lisa) wear the worn Halloween witch hat or winter holiday hat too (`OUTFIT_HAT`/`staffHatOf`/`HAT_STAFF`, `AppOpts.outfits` from `cosmetics.keys`, `People.staffHat`; applied when the person is built, so it shows from the next mount). Not yet: other staff outfits, per-challenge decor and
  tiers/milestones (#124), a standalone inventory screen. e2e: `gym3d-life.spec.ts` ("cosmetics").
- Monthly decor (#126, #135): January to September each have one decor cosmetic on the reward track (`jan_decor`…`sep_decor`, `MONTH_COSMETICS` in `shared/gym3d/rewardTrack.ts`, first big step of the month), built in `equipment/decor.ts` (`MONTH_DECOR`) and placed like the lantern; every month 1-12 now has a track cosmetic (test in `reward-track.test.ts`).
- Staff growth: the named staff (Marcus, Lisa, Coach Rivera, Dr. Kim, Jordan, Alex) have a level 1-5, three stats
  and a perk (`shared/gym3d/staff.ts`: `STAFF`, `trainCost`, `areaMultiplier`). Training costs coins; every level above
  1 adds +3% coins/hour to the staff member's area (a room type's machines, the desk or the kitchen; the manager adds
  half of that to every machine), applied in `income3d.ts`. Rows live in `gym_staff` (no row = level 1;
  migration 0023). `GET /api/gym/staff` lists the cards; `POST /api/gym/staff/:npcKey/train` locks the gym row, pays
  the waiting coin bubbles first (so the new rate only counts from then) and charges the coins (`server/services/gym/
  staff.ts`). UI: the tap chip of a staff NPC (`Gym3D.svelte`) shows level, perk, stat meters and Train. Admin: `POST
  /admin/users/:id/gym/staff-level {npcKey|"all"|"hire:<id>", level}` and `POST /admin/users/:id/gym/reset-extras
  {what: staff|hires|walls|hustle|burger|milestones|cosmetics}` (hustle = today's bonuses, burger = un-buy the Burger Baron, milestones = challenge
  milestone payouts, cosmetics = owned cosmetics and their decor) and `POST /admin/users/:id/gym/cosmetic {key}` (grant one); buttons in Admin's gym section. Tests: `tests/gym3d/staff.test.ts`, `staff-route.test.ts`,
  `admin-extras.test.ts`, e2e in `gym3d-life.spec.ts`.
- Hiring: any finished, typed room except the lobby takes up to `HIRE.perRoom` (2) hires: a coach, lifeguard,
  therapist or barista (`shared/gym3d/hires.ts`: `HIRE_ROLES`, `hireCost` = 300 + 150 per hire already made in the
  gym, `hireBonus` = +5% coins/hour for that room's machines at level 1, plus the training bonus per level). Rows live
  in `gym_hires` (migration 0025). `POST /api/gym/layout/rooms/:roomId/hire` (`hires3d.ts`) validates the room and
  charges under the gym row lock; the layout carries `hires` and `nextHireCost`. Hires show up in `GET /gym/staff`
  as cards keyed `hire:<id>` and train through the same endpoint; `income3d.ts` adds their bonus to the room's
  machines. The people system (`People.syncHires`) stands each hire at a post in their room (they walk in from
  the door when new) with their role as the chip title; the intro line comes from `hireIntro`. UI: the room menu's
  Staff page has the Hire button. The first hire pays the `hire-1` goal. Staffed flavour (#130): a recovery room with at least one hire lifts every NPC's mood by `RECOVERY_MOOD` (8), live on top of the stored daily mood (`staffedMoodBonus` in `shared/gym3d/hires.ts`, added in `computeGymSimState` next to the event bonus; the Staff page says so, `STAFFED_PERK`). Juice tips: a barista in a juice room adds `JUICE_TIPS` (12%) to the Slim Kitchen's coin rate (`kitchenTips`, added to the kitchen multiplier in `income3d.ts`; the Staff page says so). Boxing sparring purses and Court pickup-game fees: a staffed boxing or court room's own machines earn `STAFFED_RATE` (10%) more, folded into `hireBonuses` in `income3d.ts` (once per staffed room, on top of the hire bonus; `staffedRate`). Room play: while two or more members are at their stations in a staffed boxing or court room, a "🥊 Sparring" or "🏀 Pickup game" tag shows over the room (`roomPlayLabel`/`ROOM_PLAY_MIN` in `hires.ts`, checked every 2 s by `Gym3DApp.syncPlay`, drawn by `Happenings.syncRoomPlay`, `stats().plays`; not covered by e2e, staging two members in one room is not deterministic). While a game is on, a few banter exchanges about it (`playIn: "boxing"|"court"`, `BanterContext.playing` from `Gym3DApp.playing`) join the pool. While a game is on, the members working out in that room are livelier (`PLAY_PACE` 1.25 on top of the vibe pace, set in `syncPlay`). Not yet: members actually facing each other (paired poses). e2e: `gym3d-life.spec.ts` ("hiring").
- Life (slice 3): named NPC looks, titles, homes and signature lines live in one file,
  `src/components/gym3d/people/cast.ts` (staff wear `STAFF_UNIFORM`). Speech bubbles (`world/life.ts`, 3 pooled DOM
  bubbles) use lines from `GET /api/gym/npc-lines` (cached dialog batches + fired milestones, never the AI) plus
  cast/role lines (`shared/gym3d/npcLines.ts`). `world/happenings.ts` draws today's event (host + props by the
  entrance, `eventActive` from sim-state), active classes (a synced group in the class's room) and hero tags.
  Upgrade claims play in place (`Gym3DApp.claimCeremony`, no remount); lines in `shared/gym3d/celebrations.ts`.
  Admin sets a test event with `POST /admin/users/:id/gym/today-event`.
- Staff rounds (`shared/gym3d/visits.ts`, `People.visit` / `startRound` / `endVisit`): every 30-60 s (`ROUND_EVERY`) one of the staff or named NPCs (not swimmers) on screen leaves
  their post, walks to the nearest working member within 18 units, says a tip for their role (`roundTip`, `roundRoleOf`) and gets a thank-you back, then returns to their
  post (`Person.visit`; the station stays theirs while they are away; `stats().visits` counts trips). e2e: `gym3d-life.spec.ts` ("visits").
- Bubbles: every overlay over the canvas (tap chip, timer/claim cards, coin bubbles, speech + ambient lines) is a
  managed label in `world/labels.ts`, placed each frame by `world/bubbleLayout.ts` (pure, unit-tested): priority
  chip > timers > coins > player-caused lines > NPC lines > ambient, no overlap (slide up/aside or hide), clamped
  between `setInsets` top/bottom, capped (2 lines on a phone). Input listens on the gym host: a drag that starts on
  a bubble pans, only a short tap reaches it. Speech lines and tags let taps through to what is under them (`labels.ts`); coin bubbles, timers and cards still take them. The person's card is a stat card (Role, Mood,
  Doing, Bond; never body weight) opened by a long press, closing on a tap outside, a pan or after `CHIP_TTL`. Event / class banners,
  hero and name tags are managed too (kind `tag`, below speech and above ambient, take no taps, not counted in the cap): on screen,
  clear of bubbles, banners wrap.
- Ambient banter (gh-140, first slice): `shared/gym3d/banter.ts` holds short scripted exchanges (2-3 dry lines, no
  exclamation marks) picked to fit the gym (`BanterContext`: finished room types, placed gear, a crowd, today's event, a running class, gear upgraded in the last 3 minutes): a missing pool,
  sauna, ring or megaformer gets talked about, plain chatter is the fallback, recent ids are not repeated. `Life.banter`
  plays one between two nearby people every couple of minutes as alternating bubbles through the normal bubble pool
  (`app.banterContext()` feeds it). Admin's content tuning has an "NPC Banter" type (`contentTuning/npcBanter.ts`, style doc `docs/npc_banter.md`; a sample is a few exchanges for a chosen situation). The nightly AI batch: the `nightly-banter` job (`services/gym/banterPool.ts`) asks the AI (optional `generateBanter`, the banter style doc, scenarios in `contentTuning/npcBanter.ts` `BANTER_SCENARIOS`) for exchanges per situation, keeps those that pass `cleanBanterLines` (`shared/gym3d/banterAi.ts`) in `banter_pool` (migration 0034, the newest 8 per situation, shared by every gym); `GET /api/gym/banter` serves them and `Life.setExtraBanter` mixes them into the scripted pool (`pickBanter(..., extra)`), so they appear only where the situation fits. Bonds (`shared/gym3d/bonds.ts`, `BONDS`, `bondBetween`): a few exchanges for named pairs (Marcus and Lisa, Derek and Tom, Priya and Elena...) that play 3 times in 5 when the two stand close (`Life.banter`, the bond's first line is `a`'s). Not yet: bonds that grow with the player's NPC relationships.
- Upgrade look (gh-134, first slice): `equipment/tiers.ts` `applyTier` still recolours and adds the edge and pennant, and
  now `addUpgradeParts` gives every upgraded machine real parts: tier 2 a floor mat and a console (screen on a stand), tier 3
  a bigger gold screen, speakers and an overhead light arch. Generic for all gear (sized from the piece footprint); the
  new parts stay hidden until the ribbon is cut, then pop in with a confetti burst (`celebrate` -> `Build.reveal`). Members
  prefer upgraded gear (`chooseNext` weights a free station 1 + 0.6 per tier above 1) and now and then say so on starting a
  set (`People.onUpgradedUse` -> `Life.gearReaction`, lines in `shared/gym3d/banter.ts` `GEAR_LINES`). Upgraded cardio gear also gets a small fan on a post and weights gear a plate tree (more discs and a gilded one at tier 3; `addUpgradeParts` by `Piece.roomType`); the other room types still get only the generic parts, a hand-built model per
  machine tier is still to do.
- October ghost (#141, first slice): `shared/gym3d/ghost.ts` (`ghostSeason`: October only, `GHOST_LINES`: dry and supportive,
  no exclamation marks). `Happenings.syncGhost` (called from the sim poll via `Gym3DApp.ghostOn`) floats a white "Ghost" extra
  in the lobby and drifts it to the next lobby spot every 40 s; `Life` gives it ghost lines and the name "Ghost". `?ghost=1` /
  `?ghost=0` force it on or off (tests, demos); `stats().ghost` is 1 while it is about. e2e: `gym3d-life.spec.ts` ("ghost").
  Every 28-50 s (`HAUNT_EVERY`) it also floats over to a member who is working out, wherever they are (`People.visit`, `People.startHaunt`), plays a prank (`PRANKS` in `shared/gym3d/visits.ts`: a dry line, the victim hops, spins or, on a treadmill, trips and answers; `Gym3DApp.visited`) and drifts back to its spot (the 40 s re-spot waits while it is out). Every third drift it stands guard in front of the lockers when they are built (`GHOST_LOCKERS` label, `GHOST_LOCKER_LINES`; not covered by e2e, it needs ~80 s). In October about one member or passer-by in four wears a witch hat (`Acc` "witch", `People.costumes` set from `ghostOn()`, picked by a hash of the person's key; `stats().costumes`, `window.gym3d.costumed()`). Four jack-o'-lanterns stand by the door in the same season (`Happenings.syncSeason`, one batched mesh, `stats().pumpkins`). In October half of the members who would head home after a session are talked into one more station by the ghost (`People.finishSession`, `GHOST_STAY_CHANCE`, once per member; they say a line from `STAY_LINES` via `Life.ghostStay`; not covered by e2e). Costume contest: once a day (UTC) in a season with hats (`shared/gym3d/costumeContest.ts`, `pickContestWinner` by day and gym) one costumed person present wins (members first, a passer-by when none): a gold "Best costume" tag (`Happenings.syncContest`, `stats().contest`) and a line (`Life.contestWin`); kept while they are in, the next one picked when they leave, each says their line once. Not yet: other costumes, a prize or vote, e2e.
- Seasons (April, July-Aug, Oct-Dec): `shared/gym3d/season.ts` (`seasonOf(month)`: spring (April: clay pots of flowers by the door, no hats, two coach lines per voice, `spring-*` banter) / summer (July and August: two striped umbrellas and two coolers, no hats, coach lines, `summer-*` banter) / halloween / harvest / winter, `?season=spring|summer|halloween|harvest|winter|none` forces one for tests and
  demos, `?ghost=1|0` still mean Halloween / none; `stats().season`). Each dresses the door (`Happenings.syncSeason`: jack-o'-lanterns, hay and pumpkins,
  or two lit trees and presents; `stats().pumpkins` is the prop count) and puts a hat on about one in four members and passers-by (`SEASON_HAT`: witch,
  santa, none for harvest; `People.costumes`). Only Halloween has the ghost and its stay-for-one-more-set. The monthly track gives November's Harvest
  basket, Hay bale and the coach's autumn scarf, and December's Holiday tree, String lights and the coach's holiday hat (`MONTH_COSMETICS`,
  decor builders `basket`, `hay`, `tree`, `lights`); the kitchen gets Hot cocoa protein and Gingerbread oats in Dec-Feb (appended: the menu is a bitmask).
  Banter for November and December: `Banter.season` exchanges (`harvest-*`, `winter-*`) fit only in that season (`BanterContext.season`) and count as plain chatter, so the gym's real gaps still get talked about first. The coach remarks on the season now and then (1 in 5, when nothing urgent is up; `SEASON_LINES` in `coachLines.ts`, `CoachContext.season`, ids `<voice>:season-<season>:<n>`, also in `allCoachLines`). Not yet: spring/summer decor on the reward track.
- Street life (#131, first slice): `People.trickleStreet` (`people/members.ts`) sends a few passers-by (`pass:<n>`, kind `extra`,
  at most half the ambient cap) along the pavement in front of the gym from one edge to the other every 6-12 s; about one in
  eight turns in at the door (`after: "enter"`) and becomes a member. The pavement has street lamps and, across it, a road with a dashed
  centre line and a zebra crossing from the curb at the door (`world.ts` `buildGround`, static scenery). Four blocky cars drive along it in both lanes
  (`world/traffic.ts`, one batched mesh each, wrapping at the edges; none with reduced motion; `stats().cars`). Across the road stand MaxOut (the rival gym) and the Burger Baron: plain
  blocks with a billboard on the roof (`world.ts` `buildStreetShops`); banter in `shared/gym3d/banter.ts` compares with MaxOut when the gym
  lacks a pool or sauna. Burger Baron sale: at `BURGER.stars` (4) the billboard reads FOR SALE (`shared/gym3d/burger.ts`, `burgerState`); `POST /api/gym/layout/burger/buy` (`services/gym/burger.ts`, under the gym row lock) charges `BURGER.cost` once (claim `gym_rewards` `burger:bought`) and the sign becomes "BARON Jr." and smaller. The layout carries `burger`; the stars card (`GoalsCard.svelte`) has the Buy button. Bus stop: a roofed shelter on the pavement `BUS_STOP_DX` (7) east of the door (`world.ts` `buildGround`) and a yellow bus in `world/traffic.ts` that pulls in at it for 5 s on each pass (counted in `stats().cars`). MaxOut promo: on Saturdays and Sundays (UTC, `shared/gym3d/maxout.ts` `maxoutPromo`; `?maxout=1|0` forces it) its billboard reads "MAXOUT 50% OFF" on red (`World.setMaxoutPromo`, set from the sim poll; `stats().maxout`) and three banter exchanges (`when: "maxout"`) grumble about it. Baron's lots: once he is bought two more lots open past the east end (`BURGER_LOT_TEMPLATES` in `shared/gym3d/lots.ts`: a big plot and a wide one at px 7-8; `lotsForSale(built, burger)`, `neighbourhoodCols`; `buyLot` and the layout DTO read the `burger:bought` claim), sold and built like any other lot next to a built plot. Not yet: the lot becoming a plot with its own street door (members only enter at the lobby), anything the promo does to members (only the sign and the talk change), a weekday MaxOut event. Bus waiters: about one passer-by in five (never more than one at a time, none with reduced motion) walks to the stop and waits (`after: "wait"`, `People.addWaiter`, `boardWaiters`; `stats().waiting`); when the bus is in (`Traffic.busAtStop`, wired as `People.busAtStop`) they walk to it and are gone, or wander off after 2 minutes. Dog walker: about 3 in 10 passers-by who walk on past have a small dog on a lead (`People.addDog`, `Person.dog`, a child mesh of the rig root, freed in `remove`; `stats().dogs`). e2e: `gym3d-life.spec.ts` ("street", "burger").
- Coach bubble (#125, first slice): the coach's line on the gym home comes from `shared/gym3d/coachLines.ts` (`coachLineFor`): a line in the
  voice of the chosen personality (friendly, drill sergeant, roaster, anime sensei, bro) for the situation (new gear, loading, all done,
  streak milestone, tasks left by morning/day/evening), skipping the last three it said (`Home.svelte` keeps them). Challenge commentary: with a joined challenge the bubble now and then (2 in 5, when nothing
  urgent is up) speaks about it instead of the task count, and the Challenges page shows the coach's note for the day (`challengeLineFor`,
  stage = start / ahead / on pace / behind / finale from the goals' average completion against the month's pace, `src/lib/challengeCoach.ts`;
  computed on the fly, not stored, since the lines are scripted). Coins piling up: from `COINS_PILE` (150) waiting coins the bubble now and then (2 in 5, never over gear or loading) nudges to collect them (`coins` lines per voice, `{c}` = the count; `Gym3D.svelte` reports `onWaiting` each second, Home keeps it in steps of 50 so the bubble holds still). Per-day challenge lines: joining a challenge asks the AI (optional `generateChallengeCoachLines`, the player's coach voice + `docs/coach_lines.md`) for a line per day in the background (never blocks the join), keeps those that pass `cleanCoachLines` (`shared/challenges/coachDays.ts`) in `challenge_coach_lines` (migration 0033, cascade with `user_challenges`), and `GET /challenges/current` carries `coachToday`; the Challenges page prefers it over the scripted note (the gym bubble still uses scripts). Not yet:
  Portraits: each personality has its own face on the gym home and in Settings' coach picker (`coachSvg(owned, voice)` in `components/home/icons.ts`: friendly cap, sergeant's campaign hat, roaster's smirk, sensei's headband, bro's backwards cap; outfits sit on all of them). Admin's content tuning has a "Coach Lines" type (`contentTuning/coachLines.ts`, style doc `docs/coach_lines.md`): pick a voice and a situation (or challenge stage) and it lists the scripted lines next to the style rules (no AI call, the lines are scripted).
- Challenge catalog (#124, second slice): `shared/challenges/catalog.ts` holds curated monthly cards (Burpee Blitz, Sunrise Stride, Green Machine: tagline,
  coach intro, three goals, a decor `rewardCosmetic`: `arcade_cabinet`, `sunrise_mural`, `herb_planter`, builders in `equipment/decor.ts`). Columns `tagline`,
  `coach_intro`, `reward_cosmetic` on `challenges` (migration 0031). `generateChallengeForMonth` falls back to `catalogForMonth` when the AI fails;
  `POST /admin/challenges/catalog {key, month?, year?}` seeds one (Admin's challenge section). `GET /challenges/current` carries `tagline`, `coachIntro`,
  `reward`; finishing the challenge grants the reward (`rewardAwarded` in the progress response). Tests: `tests/challenges/catalog.test.ts`.
- Event looks (#124, #141): the whole app can wear a look: a joined challenge's theme (arcade, sunrise, greens) first, else the season (spring April, summer July-Aug,
  Halloween, harvest, winter; `src/lib/eventTheme.ts` pure: `pickEventTheme`, `THEME_EVENTS`, `THEME_ACCENT`; state in `eventTheme.svelte.ts`, read from `/challenges/current`
  after login and a join). `ThemeLayer.svelte` (mounted in `app.svelte`, behind the page content, off on the gym) draws a slow animated backdrop (arcade: stars, a moving neon
  grid, scanlines; winter: snow; Halloween: moon and fog; summer: a sun with turning rays; sunrise follows the challenge's progress...) and, every 10-40 s per kind, a tiny
  event drifting past (an invader, a coin, a bat, a ghost, a butterfly, a falling leaf, a shooting star: `.ev`, removed on `animationend`; none with reduced motion).
  It sets `data-event` on the root: `styles/app.css` tints the accent for every look and restyles the dark palettes for arcade, Halloween, harvest and winter (not `light`/`cream`);
  arcade also gives headings a retro mono. The tab bar and the gym HUD glow in the accent (the HUD body is tinted too for the dark looks; Today's Compete card carries the joined challenge's `ChallengeBanner`). Each look is also a skin (`styles/app.css`: `--sk-a`/`--sk-b`/`--sk-c` for the HUD's level ring, XP bar and the level-up ball, `--sk-conf` and `--sk-glyph` for the level-up confetti, one piece in four being the look's glyph, read by `src/lib/skin.ts`; a test checks every look has one). `?event=<look>|none` forces one (tests, demos); a switch in Settings
  (`event-theme-toggle`, localStorage `sp-event-theme`) turns it off. e2e: `gym3d-nav.spec.ts`.
- Challenge banner (#124): `src/components/ChallengeBanner.svelte` is a CSS-only animated strip by the challenge `theme` (arcade: scrolling stars and a blinking coin;
  sunrise: the sky runs dawn to dusk with progress; greens: drifting leaves; anything else a shimmer), on the unjoined card and above the coach note once joined;
  still under reduced motion. Template components are not covered by `tsc`: `npm run typecheck` also runs `check:svelte-names` (svelte-check, fails on "Cannot find name"),
  which caught missing imports in `Challenges.svelte` that had been broken since the milestones slice.
- Auto goals (#124): a goal may be marked `auto: "great_meal" | "checkin" | "steps"` (`shared/challenges/auto.ts`): the player taps nothing for it (the page shows a note, and the server ignores taps on it) and the app counts it: a food photo rated 8+ (`GREAT_MEAL_RATING`) or the daily check-in calls `bumpAutoGoals` (`services/challenges/progress.ts`) which moves this month's joined, unfinished challenge. All progress goes through `addChallengeProgress` (the shared service behind `PATCH /challenges/:id/progress`: milestones, finishing rewards, feed, badges). Green Machine's "25 Great Meals" is auto; the generator prompt and `validateGeneratedChallenge` know the field. A third kind, `steps`, follows the steps imported this month (`syncStepGoals` after an Apple Health import: sets the goal to the month's total, never down; the import now skips step records it already has); it is for admin-authored cards, not offered to the AI or used in the catalog since a goal nobody can tap needs the player to import.
- Challenge feed post (#124): finishing a challenge posts a `challenge_completion` to the feed for users with auto-share on (`server/services/challenges/feed.ts`,
  content carries `challengeName`, `tier`, `reward`), and badges earned on the finish are shared through `shareBadges` like the check-in route does.
- Challenge generator (#124): `shared/challenges/validate.ts` (`validateGeneratedChallenge`, pure) checks what the AI returns (1-5 goals `goal_N`, positive numbers,
  bronze <= target <= gold, unit not "days") and `generateChallengeForMonth` falls back to the catalog on anything malformed, like when the AI is down. The prompt doc
  (`contentTuning/docs/monthly_challenge.md`) now also asks for `tagline`, `coachIntro` and per-goal `tiers`, which are stored on the challenge.
- Challenge milestones (#124, first slice): a monthly challenge pays the gym at 25/50/75/100% of its goals' average completion
  (`shared/challenges/milestones.ts`: coins, and Sweat/Greens on later steps). `PATCH /api/challenges/:id/progress` pays what was
  reached (`server/services/challenges/milestones.ts`, a `gym_rewards` claim `challenge:<id>:m<pct>` under the gym row lock, so each
  pays once, also across an admin progress reset) and returns `milestonesPaid`; the Challenges page shows the four-step track and
  a note when one pays. Tiers: the player picks bronze, silver or gold when joining (`user_challenges.tier`, migration 0030, default silver = the challenge as
  generated; `shared/challenges/tiers.ts`): targets x0.6 / x1 / x1.4 and milestone coins x0.75 / x1 / x1.5, applied wherever goals are read
  (`tierGoals` in the current/progress/admin routes); a goal may set its own `tiers: {bronze?, gold?}` targets (silver is `target`), which win over the scaling. Not yet from #124: AI-generated hand-set tiers, new task types, themed seed challenges, a decor reward per
  challenge, the dashboard banner.
- Story (#188, first slice): authored cutscene chapters in `shared/gym3d/story.ts` (`STORY`: act 1 "Welcome to the street" (levels 1-8) act 2 "The bidding" (levels 9-16), eight short beats each, and act 3 "The Open" (level 17+, four chapters), rewritten to the series plan (`docs/story_series_plan.md`): exactly one chapter per level 1-16, each carrying a `thread` (rival, notebook, food, coaches, street), ending on a hook the next picks up and paying off the threads (Lisa's drawer, Marcus's notebook, the Baron's salad, Rivera and Dana), about Victor Maxwell of MaxOut, Barry Baron, Dana Voss (MaxOut's head coach, Rivera's old rival), Marcus's history, Barry's lease and the Pavement Street Open poster; plan and cast in `docs/story_bible.md`; dry, supportive, no exclamation marks, nothing about bodies). `storyState(level, seen, now)` (pure): one chapter at a time, in order, opened by gym level (`user_gyms.level`) alone: `MIN_BEAT_GAP_HOURS` is 0 now, the level is the pacing and a jump of several levels plays the chapters in turn (series plan: `docs/story_series_plan.md`). A chapter opens with a title card (act, "Chapter n of N", a "Previously" recap of the last seen chapter, when the next one opens: `storyContext`, carried on the story DTO as `chapter`, `previously`, `after`; `story-title`, `story-begin`), then its lines; the level-up overlay offers "Continue the story" (`level-story`) when one is waiting, and the Gym tab carries an amber dot (`story-dot`) until it is seen. Seeing one is a `gym_rewards` claim `story:<id>` with no payout (`services/gym/story.ts`; `GET /api/gym/story`, `POST /api/gym/story/:id/seen`, 409 unless it is the waiting one). UI: `StoryCard.svelte` (a card over the gym on Home, one line at a time, Next/Skip; `src/lib/story.svelte.ts` reloads on a level change) and a "Story so far" list in `GoalsCard.svelte`. The e2e runs set `VITE_STORY=off` (playwright.config.ts) so cards do not sit over every spec; `?story=1` turns it on for the story spec. Admin: `reset-extras {what: "story"}` (button in Admin's gym section). Admin's content tuning has a "Story Chapters" type (`contentTuning/storyChapters.ts`, style doc `docs/story_lines.md`): pick any chapter of any campaign and it shows the scripted text with speaker names next to the style rules (no AI call). The rival's billboard shows the Open's result when no weekend promo runs (`rivalSign` in `shared/gym3d/maxout.ts`: "MAXOUT: 2ND" when the gym won, "MAXOUT: CHAMPS" when it lost; `World.setMaxoutPromo(on, result)` from the story DTO's `open.result`). Story guests: a chapter that features Victor, Barry or Dana (campaign two's Quill and Tess and campaign three's Captain Reyes and Old Joe too; `GUEST_BEATS`) also puts them in the gym for `GUEST_MINUTES` (12) after it was seen (`storyGuestNow(log, now)`; the DTO's log carries `seenAt`): `Happenings.syncStoryGuest` stands an extra (`story:victor`, `story:dana` and `story:quill` in the lobby, `story:barry` and `story:tess` on the pavement by the entrance) with lines of their own (`STORY_GUESTS`, spoken through `Life.lineFor`); `?storyguest=victor|barry|dana|quill|tess|reyes|joe|none` forces it (tests, demos), `stats().storyGuest`. The Pavement Street Open (`shared/gym3d/open.ts`, act 3): seeing the chapter `a3-start` (gym level 17) starts a seven day contest; the gym's score is the XP it earns in the window (two `gym_rewards` snapshots `story:open:start:<xp>:<level>` and `story:open:end:<xp>`, the end one written by the first read after the week), MaxOut's a target of `120 + 18 x level` (`rivalScore`, a tuning guess) reached at an even pace; the result picks the chapter `a3-win` (+1500 coins) or `a3-lose` (+400), the other is skipped, then `a3-finale` follows either (chapters carry `needs` and `reward`, paid with their seen claim in one transaction; the DTO carries `open` and `waitingForOpen`, the goals card shows the scoreboard and the result). Not yet: more in-world events (people walking in and talking to staff), art for speakers (initials for now), seasonal stories, the campaign system (new location after an arc).
- Campaigns (#188, first slice): a gym played start to finish is a campaign. `user_gyms` is no longer unique per user (migration 0035: `campaign`, `archived_at`, `archive_summary`, unique per user and campaign): the gym in play is the one without `archived_at`, so **every per-user gym lookup must use `activeGymOf(userId)`** (`services/gym/activeGym.ts`; `getOrCreateGym` and the admin routes do) and queries over all gyms must skip archived ones (`findActiveGymUserIds` does). Once the story's finale (`a3-finale`, `CAMPAIGN_FINALE`) is seen, `POST /api/gym/campaign/next` (`services/gym/campaign.ts`) archives the gym with a summary (level, XP, plots, pieces, days) and starts a fresh one for the player (a new `user_gyms` row, level 0, starter coins again), carrying only the cosmetics and trophies over (`gym_cosmetics` rows copied with source `campaign`); `GET /api/gym/campaign` gives the campaign number, `canFinish` and the Hall of fame. Each campaign has its own authored story (`STORIES` / `storyFor(campaign)` in `shared/gym3d/story.ts`: campaign 1 is Pavement Street, campaign 2 is Campus Row in `storyCampus.ts`, nine chapters at gym levels 1-9 with Professor Quill of FitZone and Tess of the Campus Cafe; campaign 3 is Harbour Road in `storyHarbour.ts`, nine chapters with Captain Reyes of IronWave and Old Joe of the Fish Shack; campaign 4 is Pavement Street again in `storyReunion.ts` (nine chapters, the first cast back: Dana runs a smaller MaxOut, Victor and Barry visit, a mural with a pigeon); campaign 5 is Campus Row again in `storyAlumni.ts` (alumni weekend: a longitudinal study, a mezzanine, a fun run); campaign 6 is Harbour Road again in `storyTides.ts` (spring tides, a storm, a regatta); campaign 7 is Pavement Street a third time in `storyNight.ts` (a Friday night market and a five minute stand); campaign 8 is Campus Row a third time in `storyExams.ts` (exam week, a study break pass); campaign 9 is Harbour Road a third time in `storyLighthouse.ts` (the lighthouse is restored); campaign 10 is Pavement Street a fourth time in `storyCapsule.ts` (the street turns ten and digs up the tin buried on day one: a membership card numbered 0001, Derek in every photo, a new tin with a pickle); campaigns without one have none yet). The campaigns read as one series: chapter 5 of each later campaign carries a callback line to an earlier street's Hall of fame entry, and the first chapter's "Previously" is the last campaign's finale recap (`priorFinaleRecap`). A campaign is finished when its last chapter (`storyFinaleOf`) is seen, or, with no story, from gym level 17 (`CAMPAIGN_FALLBACK_LEVEL`). UI: a "Campaign N" section in the goals card (begin button with a confirm, Hall of fame list; the card scrolls above the Today drawer now). Admin: `POST /admin/users/:id/gym/finish-story` (button "Finish story (campaign)") marks the story finished to test the jump. Locations: each campaign is somewhere else (`shared/gym3d/locations.ts`: Pavement Street, Campus Row, Harbour Road, then they repeat; ground, pavement, road and sky colours plus the rival gym's and food shop's billboard names; `GET /gym/layout` carries `campaign`, `GymWorld.location` applies it to the ground, road, shop signs and the canvas sky, `stats().location`); the exchanges about MaxOut are campaign one's (`BanterContext.campaign`, `maxout` flag). Campaign one looks exactly as before. Not yet: stories for campaign 11 on (the staff stay the same in every campaign, the rival and food shop change name). The Hall of fame has its own page, `/hall` (`HallOfFame.svelte`: every finished campaign with its location and stats; opened from the campaign section of the goals card, `campaign-hall-open`; e2e: `gym3d-home.spec.ts`).
- Taps (`world/picking.ts`): people > equipment (pieces, spots, sites, kiosk) > room (floor, walls, lots) > open
  ground, nearest within a category; `TAP_SLOP` (6px) is both the pan start and the tap limit, so a drag (or a
  pinch) never selects. Feedback (`world/tapFx.ts`): a pooled marker (ring under a person/piece/spot/kiosk, outline
  around a room/lot) while selected, a squash, one pooled floor ripple, `navigator.vibrate(10)`; DOM badges and
  coin bubbles get `.g3d-tapped`. Reduced motion: marker only. A room tap opens the room action menu (info, Upgrade
  gear, Staff, Customize = paint + decor; `Selection.view`), never paint first.
- Poking people (`shared/gym3d/pokes.ts`, `Gym3DApp.pokePerson`): a tap on a person is never a menu. It makes them hop (`People.react`) and now and then
  say a line, escalating if the player keeps going (greeting, playful, annoyed; the 6th poke spins them dizzy); on a treadmill the 3rd poke on can tip them
  forward and they recover (a stumble, always by the 6th; other gear from the 5th; dust puff and a line; `stats().pokes`). Their card (role, mood, doing,
  Talk, Train) is a finger held about 420 ms (`CARD_HOLD_MS`, `openCard`, `window.gym3d.press(x, y)`); a one-time hint says so. A tap with a card open just closes it.
  Machines open from tapping the machine itself, not the person on it.
- Tap-to-hustle: pokes in quick succession (`ECONOMY.hustle.gapMs`) on a member who is working out speed up their
  reps and make them say a line (`shared/gym3d/hustleLines.ts`); after `ECONOMY.hustle.taps` they finish early and
  the host asks `POST /api/gym/layout/hustle/:pieceId` (`server/services/gym/hustle.ts`) for a few coins. The server
  decides: the piece must be a working machine, the daily count is claimed in `gym_rewards` (`hustle:<day>:<n>`),
  the payout shrinks through the day (`hustleCoins`) and stops at `dailyCap`. Every poke counts (a stumble too); the gesture is in
  `Gym3DApp.tapAt` / `pokePerson` (`hustleTap`).
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
active in the last 7 days (00:20, `findActiveGymUserIds`), nightly NPC banter pool (00:40, global), recurring tournaments (daily 00:25: this and next week plus this and next month, `server/services/tournaments/recurring.ts`,
pure periods and type rotation in `shared/tournaments/recurring.ts`; system tournaments have `creator_id` null and a unique `system_key`, show as
"Featured" on the Tournaments page, get a livelier name and prize line from the AI when it can (optional `generateTournamentFlavor`, checked by `cleanTournamentFlavor` in `shared/tournaments/flavor.ts`; otherwise the plain deterministic name stays), announce themselves in the feed when created and post the winner when resolved; announcements are system posts: `social_posts.user_id` is nullable (migration 0032), the feed and admin lists show them as "SlimPals"), tournament auto-resolve (every 15 min). Each run is
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
