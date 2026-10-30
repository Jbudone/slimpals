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

## Next
Retune in a separate change: levels from active days or a flatter curve, gear thresholds spread on a cadence
(`DEFAULT_CADENCE`), then re-run this tool to confirm no drought over a week early or two weeks late.
