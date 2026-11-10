# Ideas backlog

The owner's running list of what to build, with the best ideas from the audits in `docs/audits/` (2026-11-10). SlimPals is a game for the owner
and a few friends: quality and fun first. Newest additions at the top of each section. "Owner" items need the owner's taste or friends' input;
everything else the agent can build. Effort is a rough guess for one developer working with the agent.

## Next up (ordered)
1. Voice cards for ~8 characters + speaker-tagged banter (owner edits drafts the agent writes; ~1 day agent).
2. Friend cards + friend doubles in the gym + "The Drawer" page of canon jokes (friends fill 5 questions; ~2 days).
3. Meal logging that is actually useful: text hint, correct a log, calorie ranges, one-tap "usuals" re-log (~1.5 days). Later: teach-it from past corrections, itemised grams, "what should I eat", Sunday summary in Dr. Kim's voice.
4. Lighting pass + time of day (warm sun, cool bounce, tone mapping, night with lit windows; ~half a day; owner approves screenshots).
5. Portrait set with expressions for every named character (owner picks the reference style; ~1 evening + 2 h).
6. Monday ceremony card + handicap league tournament (owner writes ~15 superlatives; ~1.5 days).
7. Rewrite campaign 1 chapters 1-8 as comic scenes with callbacks (owner edits drafts; ~2 evenings).
8. Friday night D&D recurring cutscene and "bro hype" cutscenes (format being designed in the writers'-room audit).

## Story and banter
- Each chapter: one comic scene, one want, one obstacle; end on a joke, not a hook. A comic flaw per character (Victor vain, Barry over-shares, Lisa surveils, Marcus counts, Dr. Kim hypocrite about fries, Rivera competitive about nothing). Lift "no exclamation marks" for Barry and Rivera.
- Voice card per character: want / tic / never-says / feud or crush / running gag with a counter. Evolving gags advance one step a week. Callback slots from real data (streak, last meal, coins, check-in time, friend names, tournament rank).
- Add `a?: npcKey, b?: npcKey` to `Banter` and prefer speaker-matched lines. A "that's canon" button on lines; 2+ friend votes pins a running joke.
- Freeze: campaigns 5-12 and beyond, more anonymous scripted banter, story council runs until voice cards exist.

## Gameplay and gamified experiences
- Friend visits (friends' doubles walk in on days they checked in). Street Project (weekly group meter, everyone gets the decor). Dishes (a meal photo becomes a named dish card on the Slim Kitchen board; friends can order it). Sticker book of moments (~60). Evening coach debrief card reacting to the day. Rep Rush 20-second tap mini-game with a friend leaderboard.
- Rewards that depend on what you did (a walk vs a plank feel different); story beats that reference yesterday's behaviour.

## Seasons and events (12-month calendar)
Jan Resolution Amnesty (Lisa files resolutions) / Feb Secret Spotter (anonymous encouragement) / Mar Lucky Locker / Apr Spring Clean (lost-and-found hunt) / May Step Relay / Jun Pool Party build-up /
Jul Pavement Olympics (daily habit events vs MaxOut, reusing `shared/gym3d/open.ts`) / Aug Heatwave hydration co-op / Sep Back to Campus / Oct The Haunting (lonely ghost, seance meter, hidden stickers, keepable ghost pet) /
Nov Barry's Bake-Off (weekly meal photo, blind vote, Barry commentates, Dr. Kim eats the entries) / Dec Secret Santa (gift decor with coins).

## Challenges and tournaments
- Challenges: bingo card; dealer's choice (a friend sets your goal); group chain with a forgiven miss; colour week; 6 a.m. club; boss fight (group reps wear down a MaxOut machine); swap week; Barry's temptation (coins now vs a bigger Sunday payout).
- Tournament formats: duos draft; handicap league (vs your own 4-week average); coin pot (60% winner / 40% most improved); head-to-head ladder; prediction pool.
- Results as a Monday ceremony: podium with portraits, winner line in their coach's voice, one roast-style superlative each, a champion billboard in every gym, a trophy the loser must display.

## Art
- Style guide: "toy diorama at golden hour". One 12-colour palette file per location. Animation polish (squash and stretch, anticipation, head turns, idle fidgets tied to each tic). Generated posters as wall/billboard/bus-stop textures. Seasonal key art and sticker icons.
- AI is good at portraits, posters, icons, lighting/palette code; weak at consistent 3D models and judging its own output, so the owner approves from screenshots. Generate all portraits from one reference sheet in one session.

## Pacing and process (audit 1, still valid)
- Level by active days; hand-script the first week so each early active day has a win; track real use (events table, who comes back on day 7) once friends are playing; refit the pacing simulator to real check-ins.
- Run the four-arm banter experiment (one strong model with owner-approved examples / writers' room / human / templated) and stop generating if no AI arm reaches a 15% ship rate; add "Edit & approve" to `/review` and feed the owner's edits back as examples.
- Model slugs to verify with "Test OpenRouter": `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-chat`, `mistralai/mistral-large-2407`, `meta-llama/llama-3.3-70b-instruct`.
- Held for the owner's call: PR #334 (removes Compare with Friends; keeps weight out of AI prompts and feed posts).
