# PRD: Daily/Weekly Missions

## Problem Statement
Users currently engage with the app through fairly passive, singular actions (a daily check-in, occasional food logs, a weekly sprint, a monthly challenge) with no lightweight, self-directed way to define their own small recurring goals and get immediate, satisfying feedback for doing them. The Dashboard — the screen users see most often — has no "build your own daily/weekly habit list" experience.

## Solution
A Missions section on the Dashboard where users create their own tasks (title + optional description), each set to reset either daily or weekly, and tagged with a difficulty (easy/medium/hard) that determines its XP reward. Checking a task off awards XP into the existing shared gym level/XP system (`userGyms.level`/`xp`) — the same shared progression already used by checkins, food logs, sprints, and challenges — visualized on the Dashboard via a level/XP bar. Tasks persist and auto-reset at the next period boundary (UTC midnight for daily, Monday UTC for weekly, matching existing conventions), so recurring habits don't need to be recreated by hand.

## User Stories
1. As a user, I want to create a new task with a title, description, difficulty, and cadence (daily/weekly), so I can track a habit I care about.
2. As a user, I want to see all my active daily and weekly tasks on the Dashboard, clearly separated by cadence, so I know what's left to do today/this week.
3. As a user, I want to check off a task as complete and immediately see XP added and the level bar animate, so completing a task feels rewarding.
4. As a user, I want to un-check a task I completed by mistake, and have the XP retract, so a misclick doesn't lock me into the wrong state.
5. As a user, I want daily tasks to automatically reset at the start of each day and weekly tasks at the start of each week, so I don't have to manually reset them myself.
6. As a user, I want to edit a task's title, description, or difficulty after creating it, so I can tune it without losing its history.
7. As a user, I want to archive (delete) a task I no longer want to track, without losing the XP I already earned from it or its completion history.
8. As a user, I want to see my current level and XP progress prominently on the Dashboard, so I always know where I stand at a glance.
9. As a user with no tasks yet, I want a clear, inviting empty state that explains what missions are and nudges me to create my first one, so the feature doesn't feel confusing or empty.

## Implementation Decisions
- New `missions` table: `id`, `userId`, `title`, `description` (nullable), `cadence` (`daily`|`weekly` enum), `difficulty` (`easy`|`medium`|`hard` enum), `archivedAt` (nullable timestamp), `createdAt`.
- New `mission_completions` table: `id`, `missionId`, `userId`, `periodStart` (the UTC-midnight-of-day or Monday-of-week the completion belongs to), `completedAt`, `xpAwarded`. One row per (mission, period) — mirrors the one-row-per-day pattern `dailyCheckins` already uses, giving clean history and an easy existence-check for "is this task done for the current period." `xpAwarded` is snapshotted per completion, so a later difficulty edit never retroactively changes past XP.
- Difficulty → XP: daily easy=5, medium=10, hard=20; weekly easy=20, medium=40, hard=80. Calibrated against the existing XP economy (checkin=15, food_log=5, sprint_complete=50, challenge_complete=200, `DAILY_XP_RATE`≈33.8/day) so missions add to that pace without dwarfing it.
- Completing a task inserts a `mission_completions` row for the current period and calls the existing `awardGymXp(userId, xp, "mission_complete", db)` — same call pattern as checkins/food/sprints/challenges.
- Un-completing (toggle off) within the same period deletes that period's completion row and calls `awardGymXp` with the negative of the same amount, symmetric with the award.
- "Is this task done for the current period" is computed server-side per request — look up the mission's most recent completion and compare its `periodStart` against a new pure helper (`isWithinCurrentPeriod`, alongside the existing `startOfDayUtc`/`getMondayOfWeek`) — rather than storing an `isComplete` boolean on the mission row. Reset is just "the period boundary moved, so the old completion row no longer matches" — no background reset job needed.
- Archiving sets `archivedAt`; archived missions are excluded from the active list but their `mission_completions` rows (and the XP they already granted) are untouched.
- No new badges, no per-task streaks, no social-feed posts for v1. Existing gym-level badges (`gym_level_5`, etc.) fire automatically since XP is shared — no new work needed there.
- Dashboard gets a new Missions card (daily list + weekly list, each with a checkbox-style toggle) and a level/XP bar prominently placed near the top of the Dashboard, reusing the existing `ProgressBar` UI component. Task creation/editing happens via a form reachable from the Missions card.
- No admin-panel work — missions are user-owned content, not global catalog content like badges/gym-upgrades, so there's nothing to add to `Admin.svelte` for this feature.

## Testing Decisions
- Good tests verify behavior through public interfaces, not implementation details — tests hit `server/routes/missions.ts` endpoints via supertest against the real Express app + a real test DB, exactly like `tests/sprints/sprints.test.ts`.
- Cover: create/edit/archive a mission; complete a mission (XP awarded, gym level updated); un-complete within the same period (XP retracted); a completed daily mission shows incomplete again after crossing a UTC-midnight boundary; a completed weekly mission resets after crossing a Monday boundary; archived missions are excluded from the active list but their completion history/XP stays.
- The period-boundary helper (`isWithinCurrentPeriod`) gets direct unit tests too, mirroring how `startOfDayUtc`/`daysBetween` are tested today.
- No frontend/component tests — matches project convention; Dashboard UI verified manually (Tier 2/3 walkthrough per `/agent-solve-issue`).

## Out of Scope
- Mission-specific badges beyond the existing gym-level badges.
- Per-task completion streaks.
- Auto-posting to the social feed on level-up or mission completion.
- Task categories/icons, custom XP overrides, or a cap on number of active tasks.
- Admin-panel management of other users' missions.
- Per-user timezone-aware resets — stays UTC-midnight/UTC-Monday like the rest of the app.

## Further Notes
- Since XP is shared with the Gym, a very engaged missions user could meaningfully accelerate gym leveling/upgrade unlocks faster than the existing eras were tuned for. Worth watching after ship and re-tuning `GYM_ERAS`/upgrade costs if leveling starts feeling too fast, rather than pre-guessing the right nerf now.
- If mission-specific badges or streaks get added later, `mission_completions` already has everything needed (one row per period) to compute a streak without a schema change.
- A lightweight admin read-only view of a user's missions could help support debugging later — not building it now, noting it since CLAUDE.md flags admin-panel support as something to always check during scoping.
