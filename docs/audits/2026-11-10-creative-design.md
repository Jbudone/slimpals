# Audit 3: creative direction and game design (2026-11-10)

Commissioned by the owner after audit 2 was judged mis-aimed (it treated a friends-only game as a public health app). Done by a Fable subagent briefed as
a senior creative director / game designer (humour-forward cozy games, live-ops, comedy writers, small-team art pipelines), told the app is friends-only
and to skip compliance. Read-only; did not run the app, so how the 3D gym looks is inferred from code. (It reported `docs/audits/2026-11-10-ai-research.md`
missing only because its checkout was on an older branch; the file exists.)

## Verdict
The charm is the street: a receptionist with a drawer of evidence, a ghost guarding the lockers, a burger man who writes congratulations in ketchup. The best
writing is the staff-room D&D episode, because there characters may be silly and different. Everything else is held to "dry, supportive, no exclamation marks", so every
character sounds like the same mild narrator. The world is about fictional people while the real asset, a circle of friends, never appears in it. Biggest change:
put the friends into the canon and give each character a distinct voice (owner writes a one-page voice sheet, AI varies inside it).

## Story (`shared/gym3d/story.ts`)
- Good lines are specific and slightly unhinged ("I made a banner. It says congratulations, in ketchup."; "Statistically it was close. Emotionally it was not."; "My case is pickles.").
- Weak: one voice (Lisa's "Coat, charming, no handshake. Noted." and Marcus's "I have heard that line before. I just cannot think where." share a sentence shape); no stakes for
  the player; mystery without comedy (a slow reveal at five lines a chapter, weeks apart); later campaigns are volume not story (`storyFerry.ts`: "That is the twelfth story...");
  the house rule ("nobody evil", no shouting) removes every comic engine (Barry is "loud, warm" in `docs/story_bible.md` and then not allowed to be loud).
- Rewrite approach: each chapter one comic scene with one want and one obstacle; last line is a button (a joke), not a hook; a comic flaw per character (Victor vain, Barry over-shares,
  Lisa surveils, Marcus counts, Dr. Kim hypocrite about fries, Rivera competitive about nothing); lift "no exclamation marks" for Barry and Rivera only; the player's real actions appear in the scene.
- Sample scene (chapter 3): Barry "FREE BURGERS. For the street! For friendship! For reasons unrelated to the man measuring my shop!" / Dr. Kim "I'm a nutritionist. I can't be seen with that. (takes two)
  These are evidence." / Lisa "She's had four. I have it in the drawer, under 'K'." / Marcus "Four burgers. Eleven fries. I wasn't counting." / Barry "{friend} checked in six days running and looked at my window
  every single time. I respect a person at war with themselves."
- Co-authoring canon cheaply: friends as regulars (a five-question card each: gym nickname, what they always claim, what they actually do, catchphrase, nemesis machine; stored as a cast entry like
  `src/components/gym3d/people/cast.ts`; their in-world double walks every friend's gym); a "that's canon" button on any line (2+ friend votes pins it as a running joke fed into later prompts);
  "The Drawer": Lisa's drawer becomes a real page of canonised jokes and incidents, the group's shared memory.

## Banter and coach lines
- Why samey (verified): `Banter` in `shared/gym3d/banter.ts` has no speaker field (exchanges play between "two nearby people"); only `bonds.ts` ties lines to a named pair (one exchange per pair);
  `npc_banter.md` asks for "understated and dry... a little weary" (also a model's default register); coach voices in `coachLines.ts` differ in vocabulary but share one template (short lead then an instruction). A voice is an attitude toward the player, not a word list.
- Voice cards for ~8 characters: Want / Tic / Never says / Feud or crush / Running gag with a counter (Lisa: wants to know everything first; "Noted. Under D."; never apologises; suspects Derek; the drawer inventory grows weekly).
  Other tics: Marcus counts aloud, Derek speaks only in "I'm only looking" variants, Dr. Kim ends advice with a confession, Barry over-shares, Rivera turns everything into a contest, Tom is never seen finishing a set.
- Evolving gags: 6-8 escalating lines plus a per-gym counter advancing a step a week (missing left dumbbell: noticed, Lisa opens a file, a suspect, it turns up at MaxOut). Callback slots from real data: streak, last meal name,
  uncollected coins, check-in time, friend names, tournament rank.
- Examples: Marcus "That's nine." Tom "It's ten." Marcus "It's nine. I have nothing else in my life." / Lisa "Derek's been 'only looking' at the rower for forty minutes." Derek "I'm building up to it." Lisa "Noted. Under D." /
  Dr. Kim "Protein within the hour, ideally." Priya "Is that a chip." Dr. Kim "It's a control group." / Rivera "I held a plank longer than you once." Jordan "We've never planked together." Rivera "And yet." /
  Lisa "{friend} logged dinner at 23:58." Marcus "Two minutes early. Disciplined." / Barry "{friend} walked past my shop FOUR times this week! Four! I counted! I waved!" Kim "They waved back?" Barry "...No."
- Who writes what: owner = 8 voice cards, ~10 gag seeds, tone verdicts (about one evening); AI = variations per character with the card and two approved lines in the prompt, speaker named in the output.
  Cheapest format that feels alive: add `a?: npcKey, b?: npcKey` to `Banter` and prefer speaker-matched lines; a small character-true pool with callbacks beats a large anonymous one.

## Art and look (inferred from code: `world/world.ts`, `engine/renderer.ts`, `home/portraits.ts`)
- Today: hemisphere light plus one white directional light on `MeshStandardMaterial`, static shadow map, no tone mapping or post-processing found, flat SVG faces: clean and slightly flat, a daylight prototype.
- Route: one reference look and a one-page style guide ("toy diorama at golden hour": warm key light, cool shadows, slightly saturated palette, chunky bevels); spend on light, motion and faces, not more geometry.
- Five best-payoff changes: (1) lighting pass (warm sun, cool ground bounce, tone mapping, floor gradients, CSS vignette, a time-of-day preset from the real clock; night with lit windows) ~half a day;
  (2) painted portraits, one per character in a fixed style with three expressions, used in story cards, staff room, tap chips and the Drawer; ~1 evening of owner taste + 2 h wiring; (3) animation polish (squash and stretch, anticipation, head turns, idle fidgets tied to each tic) 1-2 days;
  (4) one palette file, a 12-colour ramp per location for gear, walls and UI, half a day; (5) generated posters as wall/billboard/bus-stop textures (MaxOut ads, Barry's specials, tournament winners), half a day.
- AI is good at portraits, posters, icons, seasonal key art, lighting/palette code; bad at consistent 3D models, rigged animation, and judging its own output (the agent cannot see if the gym looks good; the owner picks references and approves screenshots).
  Consistency trick: generate all portraits in one session from one reference sheet and reject anything off-model.

## Gameplay
- Loop verdict: habit to reward to build is solid and generous; flat because rewards do not depend on what you did, building is solitary, and story arrives by level with no link to yesterday's behaviour.
- Six pitches: (1) friend visits (friends' doubles walk into your gym on days they checked in; 1-2 days); (2) Street Project (weekly group goal, one meter, everyone gets the decor; 2 days);
  (3) Dishes (a rated meal photo becomes a named dish card on the Slim Kitchen board; friends can order it for Greens; 1-2 days); (4) sticker book of moments, ~60 stickers (1 day + art);
  (5) coach debrief card each evening reacting to the day's specifics (1 day); (6) Rep Rush, a 20-second tap-timing mini-game with a friend leaderboard, tap-to-hustle as its seed (2 days).

## Themes and live-ops
- Exists (per CLAUDE.md, partly verified in `shared/gym3d/season.ts`): app looks for every month, door props for five seasons, October ghost and costume contest, seasonal kitchen items, monthly reward track with decor. Missing: events with a premise, a group goal and an ending.
- Calendar adds: Jan Resolution Amnesty; Feb Secret Spotter (anonymous encouragement notes); Mar Lucky Locker; Apr Spring Clean (lost-and-found hunt); May Step Relay; Jun Pool Party build-up; Jul Pavement Olympics; Aug Heatwave
  hydration co-op; Sep Back to Campus; Oct The Haunting; Nov Barry's Bake-Off; Dec Secret Santa.
- The Haunting: the ghost is lonely and wants a full gym at midnight; group check-ins fill a seance meter; each friend hides a "haunted" sticker in another friend's gym; reward a keepable lobby ghost pet + costume; 3 short scenes on who the ghost was.
  Barry's Bake-Off: friends submit one meal photo a week, blind vote, AI commentates in Barry's voice, winner's dish goes on every kitchen board for the month; Dr. Kim judges and is caught eating the entries.
  Pavement Olympics: daily events tied to real habits (most steps, earliest check-in, best breakfast), medals per friend, group total vs a MaxOut target reusing `shared/gym3d/open.ts`; Rivera and Dana commentate badly.

## Challenges and tournaments
- Critique: four recurring types ("Weekly Step Sprint", "Monthly Plate Quality Cup"...), three monthly catalog cards all "do N of X"; no team, bet or wager fields in `schema.ts` (inferred: all solo and cumulative), so the winner is predictable by day three.
- Eight challenges: bingo card; dealer's choice (each friend sets a goal for another); group chain with one forgiven miss a week; colour week; 6 a.m. club; boss fight (group reps wear down a "MaxOut machine" health bar); swap week; Barry's temptation (coins now vs bigger Sunday payout).
- Five formats: duos draft (random pairs weekly); handicap league (scored against your own 4-week average); coin pot (buy-in with game coins, 60% winner / 40% most improved); head-to-head ladder; prediction pool (bet coins on who wins, yourself excluded).
- Results should feel like a Monday ceremony card: podium with friend portraits, a winner line in their coach's voice, one roast-style superlative each ("Most Dramatic Sunday Comeback"), a billboard naming the week's champion in every gym, a trophy the loser must display.

## Meal and calorie help (`server/services/ai/index.ts analyzeFood`, `server/routes/food.ts`)
- Today: one photo, a five-field JSON prompt, stored; only `GET /food/logs` and `POST /food/analyze`; no text hint, portion question, edit/correct, re-log, range, confidence, or use of the day's budget (`dailyCalorieGoal` exists); the quip and the numbers come from one call so they compete.
- Limits: a photo cannot see oil, sugar, depth or what is under the sauce; 20-40% error on mixed plates, more on restaurant food; aim for consistency and awareness, not accounting.
- Build order: (1) hint + correction (optional text line with the photo, edit screen for name, portion, calories; corrections saved) half a day; (2) ranges low/likely/high + confidence, day shown as a band, 2 h; (3) usuals: one-tap re-log of your ten most frequent meals with your corrected numbers, no AI call (largest real gain), half a day;
  (4) teach it: put the user's last five corrections for similar foods in the prompt; (5) itemised components with grams so a correction is "less rice"; (6) one-time reference-object tip; (7) "what should I eat" from remaining budget, time of day and usuals, one from the Slim Kitchen menu (1 day); (8) Sunday summary in Dr. Kim's voice.
- Personas: split the call (numbers first with a neutral prompt, then a cheap quip call that sees the numbers and the day); point Roaster at the food and the situation ("that salad is wearing a cheese disguise"), never the person.

## Freeze, and top seven
- Freeze: campaigns 5-12 and beyond (polish campaign 1); the bake-off/judge/writers'-room machinery (the fix is voice and data upstream, not more scoring); story council runs until voice cards exist; new room types, vibes, style effects; more anonymous scripted banter.
- Top seven: (1) voice cards + speaker-tagged banter (owner writes 8 cards, ~1 day; test: a friend quotes a line in the group chat); (2) friend doubles in the gym and the Drawer (2 days; a friend opens the app to see who is in);
  (3) food: hint, correction, ranges, usuals (1.5 days; logging lunch takes under 5 seconds and people log more meals); (4) lighting pass + time of day (half a day; someone screenshots the gym unprompted); (5) portrait set with expressions (1 evening + 2 h; friends pick a favourite);
  (6) Monday ceremony + handicap league (1.5 days; owner writes 15 superlatives; trash talk Monday morning); (7) rewrite campaign 1 chapters 1-8 as comic scenes with callbacks (2 evenings; a friend laughs at a cutscene and does not tap Skip).
- Owner's whole job: write the eight voice cards, collect the friend cards, pick the art reference, say "that's canon" when something lands. Everything else can go to the agent.
