# Human-in-the-Loop Checklist: AI Copy & Timing-Dependent UX

Extends `.agent/prompts/validation.md` (which covers canvas/UX for a specific issue's implementation) with two things that protocol doesn't cover: subjective AI-generated copy quality, and timing-dependent logic that can't be verified by just reading a screenshot. This checklist is standalone — run it periodically, not tied to a specific issue.

Per `docs/admin-testing-requirements.md` Part 1 §7.

---

## Section 1 — AI-generated copy quality

For each area, trigger real generation (not synthetic/hand-written examples) and judge tone, coherence, and whether it fits the context. Record verbatim output plus a verdict.

| Area | How to trigger | What to judge |
|---|---|---|
| Challenge | `POST /api/challenges/generate` (admin/dev account) | Does the title/theme/goals read as a coherent, achievable monthly challenge? Tone consistent with the app's supportive voice? |
| Sprint | `POST /api/sprints/generate` | Are weekly tasks small and achievable? Tone consistent with challenges? |
| NPC dialog | `POST /api/gym/generate-dialogs` then `POST /api/gym/npc/interact` | Does the response match the NPC's stated personality/quirks (`server/db/seed.ts`)? |
| Tournament victory message | Create a tournament with an already-past window (admin account), seed a real score, `GET /api/tournaments/:id/leaderboard` to trigger lazy resolution | Does the tone fit the moment? Does it scale sensibly regardless of how many people actually competed? |

## Section 2 — Timing-dependent UX

These can't be verified by waiting for the real boundary — read the implementation and confirm it's boundary-safe (UTC-consistent, no local-timezone drift), then cross-check against dedicated existing tests.

| Boundary | Where | What to check |
|---|---|---|
| Midnight day-rollover (streak grace period) | `server/routes/checkins.ts` (`daysBetween`, `calcNewStreak`) | Normalizes both sides to UTC start-of-day before diffing? Covered by `tests/checkins/checkins.test.ts`'s grace-period tests? |
| Monday week-boundary (sprints) | `server/routes/sprints.ts` (`getMondayOfWeek`) | Uses UTC day-of-week math consistently? Handles Sunday (day 0) correctly? |
| Month-rollover (challenges) | `server/routes/challenges.ts` | Uses `getUTCMonth()` consistently, not local time? |

---

## Run Log

### 2026-08-31 — first run (Claude, via admin/dev account on local dev environment)

**Section 1:**

- **Challenge** — generated: *"Gentle Growth August"* — "Let's cultivate small, consistent habits for a season of mindful well-being." Goals: 120 glasses of water, 300 minutes of movement, 100 minutes of reflection, each broken into daily amounts with a daily prompt. **Verdict: PASS.** Coherent, achievable, gentle/encouraging tone throughout.
- **Sprint** — generated: *"Your Fresh Start"* — 6 small tasks (one check-in, one 15-min walk, log one meal, one 5-min mindful moment, connect with someone, schedule "me" time). **Verdict: PASS.** Tone matches the challenge; tasks are appropriately tiny for a weekly sprint.
- **NPC dialog** — Marcus (trainer, personality: disciplined/competitive, quirk: counts reps out loud) responded to "Hey, busy day today, huh?" with: *"Always a good day to build strength! One, two, three... just means we're all dedicated. What are you planning to work on today?"* **Verdict: PASS.** The rep-counting quirk shows up naturally in the response; tone matches an energetic trainer.
- **Tournament victory message** — a solo-participant "streak" tournament resolved with: *"Admin, WOW, you absolutely crushed the HITL Verification Cup! Winning that check-in streak tournament shows incredible dedication and consistency – you are a true superstar! Keep that amazing momentum going, I am so incredibly proud of you!"* **Verdict: NEEDS WORK.** The enthusiasm doesn't scale with context — this exact tone would land the same way whether someone won a hard-fought 10-person tournament or, as here, was the only participant. Worth considering: dial intensity by participant count, or acknowledge a solo/default win differently than a genuinely competitive one. Non-blocking; logged for follow-up, not filed as a separate issue since it's a tuning suggestion rather than a defect.

**Section 2:**

- **Day-rollover (checkins)** — `daysBetween()` normalizes both dates via `startOfDayUtc()` before diffing (`server/routes/checkins.ts:17-22`). **Verdict: PASS.** No local-timezone drift possible. Covered by `tests/checkins/checkins.test.ts` grace-period/grace-expired tests (both passing in the full suite).
- **Week-boundary (sprints)** — `getMondayOfWeek()` uses `getUTCDay()`/`setUTCDate()` throughout, correctly maps Sunday (`day === 0`) to 6 days back (`server/routes/sprints.ts:16-23`). **Verdict: PASS.**
- **Month-rollover (challenges)** — uses `getUTCMonth() + 1` consistently at both generation and read paths (`server/routes/challenges.ts:18,232`). **Verdict: PASS.**

**Overall: PASS**, with one non-blocking tuning note on tournament victory-message intensity scaling.

Test artifacts created during this run (a verification tournament, a 10-day admin checkin streak) were cleaned up from the database afterward — they were not left behind as clutter.
