# Story bible (campaign 1: "Pavement Street")

First cut of the authored story (#188). Hand-written, not AI-generated. Beats
live in `shared/gym3d/story.ts`; this file is the plan they follow.

## Premise
Slim Pals is a small gym on Pavement Street. Across the road a shiny chain,
MaxOut, is about to open, and the Burger Baron fryer next to it keeps tempting
the regulars. The owner (the player) grows the gym, and the street reacts.

## Tone rules
Dry and supportive. Nobody mentions weight or bodies. No shouting (no
exclamation marks). The rivalry stays affectionate: nobody is truly evil.

## Cast
- **Lisa** (receptionist): knows everything, keeps a drawer of evidence.
- **Marcus** (head trainer): used to be MaxOut's first trainer. Secret: he wrote
  their first programme and they printed it under someone else's name.
- **Alex** (manager): polite, immovable, good with leases.
- **Dr. Kim** (nutritionist): despairs of burgers, secretly likes the fries.
- **Coach Rivera**, **Derek**: the gym's chorus.
- **Victor Maxwell** (MaxOut): charming, coat too good, "everyone has a number".
- **Barry Baron** (Burger Baron): loud, warm, quietly worried about MaxOut too.
- **Dana Voss** (MaxOut head coach): precise, dry; Rivera's old rival (Rivera's first name is Marian).

## Acts (campaign 1)
1. **Welcome to the street** (gym levels 1-8, eight beats): the street changes,
   Victor makes an offer, Marcus's history comes up. Ends on a hook: Barry's
   lease is being sold, to a buyer whose name starts with V.
2. **The bidding** (gym levels 9-16, eight beats, written): the Baron goes on
   sale; MaxOut runs a half price weekend; Dana Voss, MaxOut's head coach, turns
   out to be Coach Rivera's old rival; Dr. Kim's fries; a school photo shows
   Victor and Barry were debate-club teammates; Victor bids for the Baron's
   building in public; Marcus takes the notebook to the wall (Victor never saw
   it, Dana printed it); the Pavement Street Open is announced.
3. **The Open** (gym level 17+, four chapters, written): the Pavement Street Open
   starts and runs for seven days (the gym's score is the XP it earns, MaxOut's a
   target by level, see `shared/gym3d/open.ts`). A winning or a losing chapter
   follows (one coin reward each), then the finale: Barry keeps the Baron going,
   smaller and with a salad; Victor takes the salad.

## Pacing
One beat at a time, in order. A beat opens when the gym reaches its level and at
least `MIN_BEAT_GAP_HOURS` have passed since the previous one, so a binge cannot
burn the story. Seeing a beat is recorded once (`gym_rewards` `story:<id>`); the
"Story so far" list in the goals card lets anyone catch up.

## Not yet
Seasonal stories, in-world scripted events (people walking in), art for the
speakers (initials for now), acts 2 and 3, and moving to a new location after
an arc (campaign system, see #188).

## Campaign 2: Campus Row
A shorter arc (nine chapters, gym levels 1-9) in `shared/gym3d/storyCampus.ts`.
The staff are the same; the street is new. The rival is Professor Ada Quill's
FitZone, a "research facility"; next door is her sister Tess's Campus Cafe
(Tess does the pastries, Ada does the squats, together they run the street).
The rivalry turns out to be about a 1998 "best campus gym" ranking that FitZone
lost to a basement. It ends with an exam (the gym that checks in the most keeps
the quad) and a graduation that points at the next street.

Campaign 3 onwards have no story yet (they can be finished from gym level 17).
