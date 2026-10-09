# Progression UX plan: unlocks, theming and Today

Owner feedback (2026-10): the reward track and upcoming unlocks are hard to find,
the UI should follow the month and the joined challenge much more, and challenges
and tournaments feel disconnected from Today.

## 1. Challenges and tournaments inside Today
Today shows the player's tasks. Challenge goals are "did you do this today?"
checks, so they join the list, clearly a different kind:
- A **challenge group** in the task list (Today page and the gym's Today drawer):
  a themed header with the challenge banner colours and a "Challenge" chip, one row
  per goal still to log today (one tap logs the day's amount), auto goals shown as
  "counted for you".
- It counts apart from tasks ("3 tasks, 1 challenge check"), so a missed challenge
  never reads as an unfinished task.
- **In the running**: the tournaments you are in, with your rank, under it.
- The separate Compete card at the top of Today goes away; the Compete tab stays
  for browsing and joining.

## 2. Upcoming unlocks, with some mystery
Where it shows (without going looking): the gym HUD (a "next unlock" chip with a
progress ring), the level-up overlay (what this level unlocked, then what is next),
Today (a small "next up" rail) and the Rewards page (the full path).
Rule: **reveal three, hint one, hide the rest.**
- The next three unlocks (by XP) show fully: picture, name, room, XP or level to go.
- The fourth is a silhouette: a "?" card with only its level.
- Anything further is not shown. As you level up the silhouette resolves and a new
  one appears, so something is always about to be discovered.
Presentation: sticker-like cards with a small wobble, a progress ring on the next
one, a flip when one unlocks, confetti already exists. The gear list is data
(`lockedGear`); the pure picker lives in `src/lib/unlocks.ts`.

## 3. The reward track is easy to find
- A **track pill** on the gym home under the HUD: the month's theme, "step 9 of
  30", pulsing when today's step is ready; a tap goes to the Rewards page.
- Today's step is also on the level-up overlay and Today's top row (already there).

## 4. Month and challenge skins
The look today is a backdrop plus an accent. It becomes a **skin**: tokens for the
HUD, level ring, chips, coach bubble, cards, tab bar, level-up overlay and the
confetti (pumpkins in October, snow in December, pixels for arcade), chosen by the
joined challenge first, else the month. Slices: HUD, level ring and level-up
overlay with themed confetti; Today and Compete card headers; the gym world
(sky tint, door dressing already exists).

## Build order
1. Challenge group in Today (section 1).
2. Unlock rail, mystery fade and level-up reveal (sections 2 and 3).
3. Story reveal pipeline (see `story_series_plan.md`).
4. Campaign 1 rewrite.
5. Skins (section 4).
6. Campaigns 2-10 re-threading.
