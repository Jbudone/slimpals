# Master to-do (everything the owner or Claude has said we should do)

Status: [ ] not started, [~] in progress, [x] done. Priority order within each section. Detailed ideas live in `docs/ideas_backlog.md` and `docs/audits/`.

## 1. Collaboration pipeline ("The Studio")
- [x] Phase 0: memory, canon, piece files, ideas bin, writers' room skill (`docs/studio/`, `.claude/skills/writers-room/`).
- [ ] Phase 1: phone-first web app at `/studio` inside SlimPals: Board (Ideas / Next / In progress / Paused / Done + calendar of the Friday D&D and Sunday Bro Hype slots), piece workspace (fresh context per piece, pitch -> narrow -> dialogue -> revise, version history, Play in the cutscene card, "Second opinion" from another model), Canon editor, Ideas bin, friends' votes and "funny thing that happened" box. Design: `docs/audits/2026-11-10-collab-tool.md`. Raise the model budget for owner sessions.

## 2. Balance and pacing (the owner says it still feels off)
- [ ] Define "what good feels like" as targets (e.g. days to first room, a level every N active days early, a new unlock every few days, coins/hour vs plot and upgrade prices, no drought longer than a week).
- [ ] Balance simulator v2: add the coin economy (machine/desk/kitchen income and caps, plot prices, upgrade costs and times, Sweat/Greens), player archetypes and a collect-habit model; report time-to-milestone and "dollars" pace. Extend `shared/gym3d/pacing.ts` / `scripts/pacing.ts`.
- [ ] Automatic tuning: search over the economy parameters to hit the targets, then show the proposed numbers for owner approval before changing live values.
- [ ] Events table + cohort report (D1/D7, active days) so real friends' play can calibrate the simulator; refit archetypes to real check-ins.
- [ ] Other pacing ideas: level by active days, hand-scripted first week, welcome-back mechanic, Open contest rival score (`120 + 18 x level`) validity after the retune.

## 3. Content to write (use the Studio loop, one piece per fresh session)
- [ ] Bro Hype: redo Kreatine; write headlines 3, 4, 7, 10, 11 (revised), then 13-16, 18, 20. Fad generator and recurring bros in `docs/audits/2026-11-10-edit-first.md`.
- [ ] Friday D&D: write 3 and 5 (owner: "absolute gold"), then 8-10. The Union is locked.
- [ ] Voice cards from lines the owner keeps (not prescribed up front); friend cards (five questions each) and friend doubles.
- [ ] Banter: speaker-tagged lines (`a?`, `b?` npc keys on `Banter`), a small kept pool; fix the cliche matcher bug.
- [ ] Story: rewrite campaign 1 chapters 1-8 as comic scenes with callbacks (supersedes PR #325, to decide); coach lines for each voice; bro coach rewrite.
- [ ] Storylets engine (state-triggered scenes: coins pile, late check-in, away days, meal shrine, tournaments) per `docs/audits/2026-11-10-storylets.md`.

## 4. Engineering to put content in the game
- [ ] Speakers and faces: brody, kev, theo, dale, tom, crowd (`SPEAKERS`, `portraits.ts`).
- [ ] Friday D&D slot and Sunday Bro Hype slot in `staffRoom.ts` (existing slots are Wed and Sat); a publish path from the Studio.
- [ ] Fixes: word-boundary cliche matcher, use `turnWorks`/`generic` in `shortlist`, a temperature option in `modelClient.ts`.
- [ ] Verify the OpenRouter model slugs (owner runs "Test OpenRouter"; paste only error text).

## 5. Game features from the creative audit (ideas bin, order roughly by value)
- [ ] Meal logging that is useful: text hint, correct a log, calorie ranges, one-tap "usuals", teach-it from corrections, "what should I eat", Sunday summary in Dr. Kim's voice.
- [ ] Lighting pass + time of day; portrait set; poster textures; palette file; animation polish.
- [ ] Friend visits / doubles, Street Project (weekly group goal), Dishes, sticker book, evening coach debrief, Rep Rush mini-game.
- [ ] Tournaments: handicap league, duos, coin pot, head-to-head, prediction pool, Monday results ceremony; challenges: bingo, dealer's choice, group chain, colour week, 6 a.m. club, boss fight.
- [ ] 12-month events calendar (Resolution Amnesty, Secret Spotter, ... Barry's Bake-Off, Secret Santa).

## 5b. From the earlier threads (not yet built)
- [ ] Replace authored campaigns 1-12 with council drafts: NOT wanted now (frozen).
- [ ] Staff-room AI episodes (#293) and coach lines through the writers' room: frozen with the pipeline.
- [ ] Art lane (AI-generated portraits, icons, posters): wanted, becomes part of section 5.

## Frozen / dropped
Nightly banter job and judge, bake-off, writers' room machinery, story council runs, campaigns 5-12, health-compliance work (age gating, sign-up consent, pause button, tournament/badge removal, weight privacy).
