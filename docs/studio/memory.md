# Memory (read this first in any new session)

Decisions, discoveries and open threads, newest first within each section. Update it at every milestone and before the owner clears context.
Then read `docs/studio/todo.md` (master list) and, for writing sessions, `docs/studio/canon.md` and the piece file you are working on.

## How we work (the owner's preferences)
- SlimPals is for the owner and a few friends. Quality, fun and experience come first. NO compliance, legal, age-gating or "safe for strangers" advice or work. Basic decency only (jokes target situations and characters, not a friend's body).
- Tokens are limited. Run ONE subagent at a time, never five in parallel; say what it will cost before spawning. Keep chat replies short; put detail in files.
- Feedback in plain words ("this part is gold, that part is out of place") beats a special format. Ask for a reaction to each piece, not codes like "strike N".
- The owner wants it extremely clear what they must do. Keep the Admin To do inbox (`shared/admin/inbox.ts`) current when handing them something.
- Standing autonomy: pick the next task yourself, one PR per change, merge with a merge commit once CI is green (use `send_later` check-ins; do not poll).
- Long chats get polluted (versions blur, edits regress). Do writing pieces in a FRESH session from the piece file, not in a long thread.

## Decisions
- 2026-11-12: PR #334 (remove the all-users weight view) closed. Privacy hardening is not wanted; friends may see each other's weight. The behaviour-health audit's compliance advice is shelved.
- 2026-11-12: Build "The Studio": a collaboration workflow (fresh context per piece, canon packet, pitch -> narrow -> dialogue -> revise loop, ideas bin, pause/resume, schedule, "second opinion" from another model) first as repo files + a skill (Phase 0, done), then a phone-first web app inside SlimPals at `/studio` (Phase 1).
- 2026-11-11: Brody is the bro coach's name. Bro Hype = a weekly recurring bit where recurring gym bros (Brody, Kev, Theo, Dale) latch onto the latest fad (ridiculous supplement, diet or exercise trick) and have a silly comedic moment. Friday night D&D is a recurring staff-room cutscene (Dr. Kim is Dungeon Master).
- 2026-11-11: Content method: owner supplies or picks a one-line premise ("headline first"); Claude expands; the owner's reactions and edits are the teacher. No AI humour judge, no auto-published AI text. Freeze: nightly banter job and judge, bake-off, writers' room machinery, story council, campaigns 5-12.
- 2026-11-10: Writing roles use these default models (Admin can override): writer/showrunner `anthropic/claude-3.5-sonnet`, writer2 `deepseek/deepseek-chat`, critic/reader `mistralai/mistral-large-2407`, advocate `meta-llama/llama-3.3-70b-instruct`. Slugs are UNVERIFIED (owner to run "Test OpenRouter" per model).
- 2026-11-10: Levels use XP = 90 x level^1.5; gear/class unlocks sit on a ladder (`shared/gym3d/levels.ts`, `unlockLadder.ts`).

- 2026-11-12: Studio Phase 1 slice 1 built on branch `claude/cloud-session-usage-ivkcwd` (not yet a PR): `/studio` board. DB route test (`tests/content/studio-route.test.ts`) could not run locally (no MariaDB on port 3307); CI will.

## Discoveries
- The earlier "voice cards" and 12 banter samples (writers' room audit) were catchphrase templates built on lore nobody had seen; the owner found them unfunny. Premise-first, pictureable, self-contained scenes work much better (see `pieces/`).
- Owner reactions that worked: The Union (D&D) "perfect"; Brody's red-light-therapy opening "absolute gold"; Fibermaxxing, creatine gummies, mini-trampoline, tongue-twister-in-Zone-5 ideas "very funny".
- The wiki of expert reports is in `docs/audits/` (9 files; behaviour-health is mis-aimed for this audience).
- Banter filter bug: `hasCliche` matches substrings ("gains" inside "against"); `bro` coach lines use banned words; model calls have no temperature setting. Small fixes still to ship.
- The pacing simulator (`npm run pacing`) models XP, levels, story, gear and class unlocks only. It does NOT model coins, plot prices, machine income, timed jobs or Sweat/Greens, which the owner says still feel off.

## Open threads
- Waiting on the owner: run "Test OpenRouter" for the four slugs; verdict on act-one story pilot PR #325 (unmerged; the new content method may supersede it); reactions to revised Bro Hype headlines.
- Redo Kreatine in a fresh session (see `pieces/bro-hype-kreatine.md`).
