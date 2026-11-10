# Audit 1: applied AI research and development (2026-11-10)

Commissioned by the owner. Done by an Opus subagent briefed as a leading industry expert in applied AI R&D,
read-only on the repo. "Verified" = read in the repo or run; "inferred" = the auditor's judgement or research cited
from memory (check before leaning on it). The three-line check I did myself afterwards: the Roaster prompt really says
"destroy it hilariously" (`server/services/ai/prompts/roaster.md`), `dailyCalorieGoal` has no floor, and the daily
weigh-in pays Greens (`shared/gym3d/economy.ts`).

## Verdict
1. The habit loop and 3D gym are real; the last five weeks went into content infrastructure (PRs #310-#331: pipeline, council,
   bake-off, reports, inbox). None of it has run on a real model, and nothing shows it improves a single line.
2. The text problem is probably not mainly the model. The house style (no exclamation marks, under 12 words, "flattest last line",
   no contractions in story) makes every voice alike, and the anchors that steer and judge the AI (`GOLD_BANTER`, comedy device
   examples) were written by the agent, not the owner.
3. Much of the machinery cannot reach players soon: council story only applies to campaign 13+ (`storyBeats.ts`). Campaigns 1-12 are
   agent-written and are what players see.
4. The pacing retune helped committed players; a casual player (3 of 7 days) still waits ~24 days for level 2 and has ~10-day droughts in
   month one. The simulator has no churn and no coin economy.
5. Biggest risk: the agent keeps building plausible machinery while the two things that decide success (is the content good, do people
   come back on day 7) get no evidence. Quieter risk: the Roaster coach is told to "destroy" food, unfiltered.

## Content quality
- Flow today: device drafts -> critic -> revise -> cliche gate -> near-duplicate gate -> Flash-lite judge vs agent anchors -> keep top 2 ->
  owner Good. Owner can only tap Good/Meh/Bad + tags, cannot edit a line. No temperature control in `modelClient.ts`.
- Research (inferred): LLM humour is narrow and repetitive; critique-and-revise loops smooth jokes; LLM-as-judge agrees poorly with humans
  on humour/creativity and has length/position/self-preference bias; best-of-N against a weak judge optimises for the judge. What moves voice:
  many real examples (30-100) written or edited by the person whose taste counts; after a few hundred approved examples, long-context
  examples or a light fine-tune beat prompt scaffolding.
- Theatre for now: the five-role story council, the reviser loop, Flash-lite as a humour gate, the daily email. Likely to work: owner-written
  or owner-edited anchors, one strong model with many examples at high temperature producing many options, AI varying approved lines,
  templated formats.
- Write less with AI: ~2-3 exchanges/day heard, ~60-90/month; ~150 good hand-made exchanges cover months. Recommended: authored setups x
  authored turns x slots (`{room}`, `{gear}`, `{season}`); per-character voice (Derek over-shares, Lisa files, Marcus quotes his notebook) and
  relax the uniform style rules for loud characters; an "Edit & approve" button in `/review` and feed the last ~30 before/after pairs back into the prompt.
- Bake-off flaws (verified, `server/services/content/bakeoff.ts`): the "hand-written" arm is the agent's `GOLD_BANTER` (not a human baseline,
  spread by `k % 4`, also in the prompts and judge anchors = contaminated); lone models get the style doc only while the writers' room gets device
  examples (two variables at once); 7 contestants and a 40-vote cap is ~2 votes per pair (noise); pairwise gives rank, not an absolute bar.
- Minimum experiment (1-2 days, ~$2-5): four arms on the same 4 situations, 10 exchanges each: (A) one strong model with 20 owner-approved
  examples, temp ~1.0; (B) writers' room; (C) human (owner, or ~$100 comedy writer); (D) templated fragments + slots. Rate each item blind,
  shuffled: ship as is / ship after small edit / no (second rater if possible). Rule: an AI arm needs >=30% ship rate to justify generation;
  if neither A nor B reaches 15%, stop generating banter and build D with AI only suggesting variants.

## Pacing and retention
- Simulator critique (verified): no churn; "fun points" are XP milestones only (coins, builds, daily track step, staff-room episodes, seasons left
  out); archetype probabilities are guesses; the ladder was fitted to the steady player.
- Retune table: committed L2 day 5, L8 day 36, L17 day 112, worst drought 19 days after day 200; steady day 7 / 60 / 182, 27 days; casual
  day 24 / 181 / never, 10 days in month one and 35 later.
- Recommendations: hand-script week one (a guaranteed win on each of the first 5 active days: level 2 on first check-in, a gear unlock, first story
  chapter, a staff member, a room), counted in active days not calendar days; level by check-ins, not meals/missions (XP for logging food
  nudges volume, a bad incentive for weight loss); modest cosmetic variable rewards, no loot boxes tied to food/weight; keep the 1-day grace
  (`daysSince <= 2`) and add a "welcome back" that never shows a broken streak as a loss; cadence: a small win every active day, something
  notable every 3-5 active days, a story chapter about weekly, no drought beyond ~7 active days.
- Telemetry to add: one `events` table (session, check-in, task, reward claimed, unlock shown, chapter opened/finished/skipped, drawer, banter seen),
  weekly D1/D7/D30 and active-days report, fit the Markov matrix to real `checkins`.

## Health and ethics (verified unless noted)
- `roaster.md` says "If the food is bad, destroy it hilariously"; `analyzeFood` returns a `coachMessage` with no body-talk filter (banter has
  `BODY_TALK` in `banterAi.ts`). Highest-risk text in the app.
- No calorie floor (`dailyCalorieGoal` only has to be positive, `server/routes/users.ts`).
- Daily weigh-in pays Greens (`economy.ts`): consider weekly. AI meal rating 8+ drives "great meal" auto-goals (an AI healthiness score becomes points).
- Fixes: filter all food feedback; exempt food photos from the roaster's harshness; calorie floor with a gentle message; signpost eating-disorder
  support; pay for consistency, not restriction.

## Process
- Infrastructure before validation (the pipeline design doc said the first review hour should be a bake-off to "pick the generator with
  evidence"; building continued). The agent grades its own taste (wrote gold examples, device examples, judge anchors, style docs, 12 campaigns).
  Review burden landed on the owner (215 queued items, chores, copy-paste feedback). Tests stop at fake models; parsers have never seen real
  output; e2e is outside CI. The standing "pick the next task yourself" rule rewards PRs over outcomes. CLAUDE.md is very long.
- Guardrails proposed: an evidence gate (no new infrastructure for a system until its current version has a recorded measured result); one project
  at a time with a question and a kill criterion in the PR; the agent never authors anchor taste; one read-only token-protected export endpoint so
  the agent can pull the owner's verdicts directly; owner rhythm of two 15-minute phone sessions a week.
- Do not build next: art lane, more council stages or replacing authored campaigns, shadow mode/golden regression, more report sections, new
  content lanes, more seasons/staff-room arcs/campaigns.

## Roadmap
- 30 days: (1) health-text safety pass (kill: none, required); (2) the four-arm experiment (kill: no AI arm >=15% -> freeze banter and coach generation);
  (3) events table, cohort report, scripted first week (kill: cannot recruit 10 testers in 30 days -> stop content work).
- 60 days: content in the winning format with 150 approved lines; hand-rewrite act one informed by PR #325; refit pacing from real check-ins.
- 90 days: optional fine-tune or long-example writer from 300+ approved lines; retention levers from cohort data; council run only if campaign 1 lands.
- Freeze now: story council beyond the engine, the bake-off as it stands, the daily report email (go weekly), art lane, new campaigns/seasons.

## Risks and unknowns
- Model slugs: `anthropic/claude-3.5-sonnet` and `mistralai/mistral-large-2407` are 2024-era; the auditor believes Claude 3.5 Sonnet was retired in 2025
  (inferred). Check against OpenRouter's list (the owner's "Test OpenRouter" will show it).
- Cost: a writers'-room run is ~4 strong-model calls + 10 judge calls per situation; at $1/day the budget may stop it partway, silently apart from the report.
- Prompt injection via food photos (text in the image) and NPC dialog player text; privacy policy, consent and deletion for weight/food photos (unverified);
  inconsistent body-talk filtering (food `coachMessage`, NPC dialog, victory messages bypass it).
- Test gaps: no real-output parser fixtures for council/writers' room; e2e not in CI; pacing ignores coins; the Open contest score (`120 + 18 x level`) is
  unvalidated after the retune.

## Top five this week
1. Agent (~3 h): health-safety patch (food `coachMessage` filter and soften, calorie floor, weekly weigh-in reward, tests).
2. Owner (~45 min): write or pick 20 banter exchanges they like plus 3 lines of voice for each of 6 named characters (replaces `GOLD_BANTER`); verdict on PR #325.
3. Agent (~4 h): check model slugs, build the four-arm experiment and a blind 160-item rating page, add "Edit & approve" to `/review`.
4. Owner (~20 min, plus a friend): rate the 160 items blind; the agent applies the decision rule. No new infrastructure until then.
5. Agent (~4 h) + owner (~30 min to recruit): events table, D1/D7 report, hand-scripted first week; line up 10 testers.
