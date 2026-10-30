# Pacing

`npm run pacing` simulates players (a Markov chain of full / light / off days, with the real XP rules)
against the real unlock tables (levels, story chapters, gear, classes) and prints when each arrives
(p10 / p50 / p90 days) and how long the longest wait for any "fun point" is. Code: `shared/gym3d/pacing.ts`.

## First findings (live curve, XP = 50 x level^2)
- A committed player (~6 days of 7) takes 4 days to level 2, 58 days to level 8 and 254 days to level 17:
  levels slow from one per 3 days to one per 15+. A steady player (5 of 7) never reaches level 17 in a year.
  A casual player (3 of 7) is still below level 10 after a year.
- Longest wait for any fun point: ~5 days in month one, 15-20 days by month two to six, 35+ for the committed, 70 for the casual.
- The quadratic curve is the cause: each level costs more than the last, and unlocks (gear by XP, one story
  chapter a level) all hang off it, so the early flood and the later drought are one effect.
- The model fits a flatter curve (about XP = 40 x level^1.5) if levels should keep arriving at a steady
  pace for the median player; the tool prints the fit per player type.

## Retune (this change)
- One level curve, `shared/gym3d/levels.ts`: XP to begin level N = 90 x N^1.5 (was 50 x N^2). Server, client and the tool read it.
  A committed player reaches level 8 on day 36 and 17 on day 112 (was 58 and 254); a steady one 60 and 182 (was 90 and never).
  Levels only go up for existing players.
- Gear and class unlocks sit on a ladder (`shared/gym3d/unlockLadder.ts`, `respaceUnlocks` in the seed): the catalog keeps its
  order but the n-th unlock lands on rung n (every ~2 days early, ~7 later), so there are no clumps. The seed now updates
  `required_xp` on existing rows.
- Result (longest wait for any fun point, committed): days 31-90 from 15 to 6, days 91-200 from 20 to 14.
- Still open: players with 3 check-ins a week are slow by design; the rooms (coin-gated) are not modelled; the Open contest's
  rival score (`120 + 18 x level`) was tuned to the old XP per level and may now be too easy; after day ~200 gaps widen again (27 days steady).
- Tying levels to check-ins directly was not needed: the flatter curve gives the same steady feel and keeps XP meaningful.
