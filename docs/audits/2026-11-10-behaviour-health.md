# Audit 2: clinical psychology and behaviour change (2026-11-10)

Commissioned by the owner. Done by a Fable subagent briefed as a clinical psychologist / behaviour-change scientist specialising in digital
health and eating-disorder risk; read-only, ran no code, saw no live AI output. "Verified" = read in the repo; "from memory" = research cited without
re-checking (verify before quoting). I re-checked `GET /weight/social` and `autoShareBadges` / tournament types myself: confirmed.

## Verdict
1. Not safe for open public launch as it stands; acceptable for the current invite-only circle of informed adults (`server/routes/register.ts` needs an invite).
2. The game layer is good: story, banter and scripted coach lines are free of body talk, no push notifications, the streak has a grace day, Greens are capped
   per meal type.
3. The health layer underneath is a conventional weight-loss tracker with the usual hazards: weight-loss badges, a percent-lost tournament, letter-graded meals,
   calorie budget with no floor, goal weight with no floor, no age check, no support signposting.
4. Most urgent single defect (privacy): `GET /api/weight/social` returns every user's name and full weight history to any signed-in user, regardless of sharing
   (`server/routes/weight.ts:177`, shown as "Compare with Friends" in `src/pages/Weight.svelte`).
5. Most important design change: stop rewarding, ranking and grading outcomes (kg lost, AI meal score); reward only showing up and recording.

## Harm audit (verified)
1. CRITICAL: everyone's weights visible to everyone (`weight.ts:177-204`, `Weight.svelte`, `SocialWeightChart.svelte`). Fix: remove the endpoint; if it returns, opt-in, percent only, friends only.
2. CRITICAL: weight-loss competition: `MONTHLY_TYPES` has `weight_loss` ("Monthly Slim-Down", `shared/tournaments/recurring.ts`), score = % lost
   (`server/services/tournaments/index.ts:40`), leaderboard, `tournament_weight_win` badge, user-created ones too. Rewards fastest loss: crash dieting, dehydration. Fix: remove the type from the rotation and `validTypes`; keep steps and consistency.
3. HIGH: loss badges `loss_2kg`..`loss_25kg`, `loss_goal` (`server/services/badges/index.ts`); `autoShareBadges` defaults true (`schema.ts:45`) so loss badges post to the feed even though
   `autoShareWeightMilestones` defaults false; `weight_update` posts carry `currentWeightKg`. Fix: retire or make private opt-in; never auto-share anything weight-derived.
4. HIGH: no floors: `server/routes/users.ts:120-155` goal weight and calorie goal only > 0; `goalDate` unchecked; height unused for safety; drawn as a progress bar. Fix: calorie floor (ask a dietitian;
   commonly cited ~1,200 women / ~1,500 men unsupervised, from memory), refuse goal weight under BMI 18.5 when height known, cap implied loss ~0.5-1 kg/week, gentle wording plus support link.
5. HIGH: AI meal verdicts: `analyzeFood` (`server/services/ai/index.ts:202`) returns 1-10 "healthiness" rating, calories/macros, "healthier swaps" on every meal in the persona, no output validation;
   `Food.svelte:69-76` shows a school grade A+ down; Roaster "destroy it hilariously", Sarge "call it out hard", Bro "GAINS don't care about excuses" (`prompts/*.md`); Settings Roaster sample "Was this meal a cry for help?".
   Moral grading of food is the core of dieting cognition; shame predicts avoidance, not improvement (from memory: Tomiyama; Puhl and Heuer); photo calorie estimates often 20-40% off (from memory).
6. HIGH: AI rating feeds rewards: `GREAT_MEAL_RATING` 8+ bumps challenge goals ("25 Great Meals"), `food_challenge` tournament ("Plate Quality Cup", "Clean Plate") ranks average rating. Teaches logging only "good" meals; rewards orthorexic "clean eating". Fix: reward meals logged / days logged; drop the rating tournament.
7. MEDIUM: streak pressure: streak badges to 365, "Streak Showdown", days cut at UTC midnight (`checkins.ts startOfDayUtc`, unfair across time zones), coach lines "Don't you dare break it now", "Nothing is scarier than your skipped streak. Fix it." (`shared/gym3d/coachLines.ts:189,356`). Fix: active days per week, user time zone, rewrite the two lines.
8. MEDIUM: weight in AI prompts: latest weight in NPC dialog prompts (`server/services/gym/dialog.ts:165`), weekly change in weekly inspiration in persona (`ai/index.ts:290`), no body-talk filter on output. Fix: delete both fields.
9. MEDIUM: BMI bands on chart (`src/components/WeightChart.svelte:207-211`). Fix: off by default.
10. HIGH before public launch: no age handling (no DOB/age statement at `Register.svelte`). Fix: 18+ self-declaration at sign-up and in terms.
11. HIGH before public launch: no safety net: no privacy policy, disclaimer, support signposting, account deletion or export anywhere (only `GET`/`PATCH /users/me`).
12. MEDIUM: food photos served from `/uploads` without auth (`server/app.ts:132`; UUID names) and sent to Gemini. Fix: privacy notice; confirm no-training tier; delete files on account deletion.
13. LOW: uncapped XP for photos (`food.ts`: 5 XP per analysed photo; Greens capped per meal type). Fix: cap XP the same way.
Done well (keep): story and scripted banter free of body/diet talk; `BODY_TALK` filters AI banter and coach lines and they are owner-gated; no push notifications; one-day grace; food-log and
weight-milestone sharing default off; tier choice on challenges; catalog challenges are behaviours not weight; person card never shows body weight.

## Does it change behaviour? (evidence from memory; check before quoting)
- Consistent self-monitoring is the best-supported predictor of loss (Burke et al. 2011); maintenance tracks sustained activity, regular self-weighing, consistency, quick recovery (National Weight Control Registry,
  Wing and Phelan 2005); autonomous motivation predicts maintenance (Teixeira 2012); tangible rewards can undermine intrinsic interest (Deci, Koestner, Ryan 1999) and incentive effects fade (Volpp); one missed day does not
  materially harm habit formation (Lally 2010).
- Helps: makes logging cheap and pleasant; gym as durable record of effort; rewards mostly for doing; self-chosen missions and coach voice; idle income makes returning after a lapse cheap.
- Undermines: grading/ranking meals makes people hide the meals most needing a record; overjustification at content droughts; almost nothing reflective given back (no "you logged dinner 5 of 7 days"; `mood`/`notes` stored but unused);
  lapse handling half-built (grace day yes, reset to zero and 365-day badges all-or-nothing); relatedness is comparison not support; "fast" pays Greens via `DIET_WORDS` (`shared/gym3d/economy.ts:357`) so a "hard" fasting mission is paid.
- Honest expectation: improves short-term logging adherence for people who like the game; whether it changes weight is unknown and must not be claimed.

## Design recommendations
1. Reward recording, never content or outcome: remove kg badges, weight-loss and rating tournaments, the great-meal auto-goal; keep rewards for check-in, meal logged, weigh-in recorded.
2. Food feedback redesign (`ai/index.ts analyzeFood`, `Food.svelte`): model returns what it sees, one neutral observation, at most one optional addition; remove 1-10 and the grade; hide calories/macros behind "show numbers" labelled rough estimate;
   a fixed rule block above every persona (never comment on the person, body, willpower or worth; never call food bad/junk/clean/cheat; humour targets the situation); rewrite Roaster/Sarge/Bro meal instructions; validate server-side (shape, length,
   blocklist) with a scripted fallback. A regex alone is not enough: shaming needs no banned word, and the regex would block legitimate words like "diet" and "calorie".
3. Coach tone: keep `friendly` default; label Roaster and Sarge "spicy", require a confirm, exclude them from food and weight feedback.
4. Weighing optional and private: a few Greens per week at most; "hide my weight numbers" (trend arrow) and "I don't want to track weight" (removes the page, goals, prompts). Frequency is not the hazard (daily weighing helps many adults with overweight: Steinberg 2013, Pacanowski 2015, from memory); badges and comparison are.
5. Missed days: replace the headline streak with "active days this week" (target 4-5 of 7) plus a lifetime total that never drops; keep "Welcome back"; user time zone; retire `streak_365`.
6. "I'm struggling" / pause (Settings and the Coach tab): freezes streak and challenges, hides numbers, switches coach to friendly, shows support links (Beat UK, NEDA/ANAD US, "talk to your GP").
7. Sign-up (`Register.svelte`): 18+ confirmation; "not medical advice; not suitable if pregnant, under 18, or have or had an eating disorder" plus support link; explicit consent to process weight and food photos and to send photos to an AI provider.
8. Floors enforced in `users.ts`, not only the form.
9. Automatic gentle checks: weight falling faster than ~1% of body weight a week for three weeks, or below BMI 18.5: stop celebrating, show a quiet care message, stop weight rewards.
10. Sharing all opt-in: `autoShareBadges` default false or exclude weight-related badges.
11. Intrinsic return: a weekly private summary of the user's own patterns in neutral language, using the `mood` and `notes` already collected.

## Measurement
- User success: active days/week at weeks 4, 12, 26; share of weeks with >=3 meal logs; monthly one-question "I feel more in control of my habits"; for opt-in users, weight trend within 0.5-1%/week. Not: kg lost, streak length.
- Harm indicators: calorie goals at/near floor; goals refused by the floor; loss faster than 1%/week; >1 weigh-in a day; >6 food photos a day; logging stops right after harsh feedback; average logged kcal under ~1,000; pause-button use;
  persona switched away after a food message; spicy personas chosen by fast losers.
- Monthly two-question pulse: "Using SlimPals makes me feel worse about food or my body" and "I feel guilty when I miss a day"; >~10% agreeing is stop-and-fix.
- Testing coach tone ethically: adults only, informed opt-in, screened out for ED history; never randomise into a harsh voice, compare self-selected groups descriptively; 10-20 people, two weeks, pulse before/after, stop rule,
  owner reads every spicy-persona food message in week one; log every AI food message.

## Compliance questions for a lawyer (not advice)
Weight/food/mood as special-category health data under UK/EU GDPR (explicit consent, DPIA); privacy policy naming Gemini, OpenRouter, Resend, BunnyCDN, transfer and no-training terms; in-app account deletion and export (Apple guideline 5.1.1(v), from memory);
age 18+ and UK Children's Code / COPPA; FTC Health Breach Notification Rule and Washington My Health My Data Act (from memory); App Store 5.1.3 and 1.4.1 (no outcome claims, calorie figures labelled estimates);
medical-device line (avoid BMI categories/calorie prescriptions that read as diagnosis); UK Online Safety Act duties for the feed and a report-and-remove route; wellness disclaimer and terms.

## Where audit 1 is wrong or incomplete
- Called the Roaster "highest-risk text"; structural mechanics are worse: the open weight endpoint, percent-lost tournament, kg badges shared by default, missing floors (audit 1 caught only the calorie floor).
- "Filter food feedback with BODY_TALK" is too weak and would block legitimate words; redesign the prompt, grade and numbers.
- "Level by check-ins, not meals" is half right: food logging is the evidence-based lever; keep it rewarded, cap per meal type, remove scoring.
- "Weekly weigh-in reward" treats frequency as the hazard (see 4).
- Scripted first-week wins and variable rewards are retention advice that deepen extrinsic dependence; pair with the reflective summary; never attach variable rewards to food or weight.
- Missed: age, UTC day boundaries, weight in NPC/inspiration prompts, BMI lines, no deletion. D1/D7/D30 need the safety metrics beside them from day one.

## Top five this week
1. Agent, 1 h: remove `/weight/social` and the group chart; `autoShareBadges` default false; strip `currentWeightKg` from posts and weight from NPC and inspiration prompts.
2. Agent, 3 h: remove `weight_loss` and `food_challenge` tournament types, kg badges, great-meal auto-goal (migration + What's-new entry); cap food XP.
3. Agent, 4 h: food feedback redesign (safety block, persona rewrites, no grade, numbers hidden, server validation + fallback) and floors on calorie goal, goal weight, goal date.
4. Owner 1 h + agent 3 h: sign-up screen (18+, consent, disclaimer, support links), "I'm struggling" pause, account deletion; owner books a short call with a privacy lawyer and ideally a registered dietitian for floor numbers.
5. Agent, 3 h: time-zone-correct days, "active days this week" replacing the headline streak, rewrite the two coach lines, harm-indicator counters and the two-question pulse.
Not checked by the auditor: live AI output, Apple Health import, Admin tools, sprint generation output, what the 1.5x streak bonus at `server/routes/gym.ts:1118` multiplies.
