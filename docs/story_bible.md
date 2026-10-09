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
Rewritten to the series plan (`story_series_plan.md`): one chapter per level, five
threads (the rival, Marcus's notebook, Lisa's drawer, the food thread, the two coaches)
that each pay off, and every chapter ends on a hook the next one picks up.
1. **Welcome to the street** (levels 1-8): the gym opens, Victor's very good coat and
   MaxOut's sign (it carries Marcus's line), his offer, Barry's free samples and his
   imaginary friend, Marcus's confession about the notebook. Ends on the lease hook:
   Barry's lease is sold to a company starting with V.
2. **The bidding** (levels 9-16): the Baron goes on sale; the MaxOut flyer credits "D. Voss"
   and Lisa's 2009 clipping gives the proof; Dana turns out to be Rivera's old rival; Dr. Kim's
   fries; the school photo (midpoint: Victor and Barry were best friends and Victor bought
   the lease); Victor's public bid; Marcus takes the notebook to the wall (Dana hung it,
   Victor never saw it); the Pavement Street Open is announced.
3. **The Open** (level 17+, four chapters): seven days, the gym's score is the XP it earns
   (`shared/gym3d/open.ts`); a winning or a losing chapter follows (one coin reward each);
   the finale: Barry keeps the Baron, smaller and with a salad, Rivera and Dana shake hands,
   the notebook goes on the street board and Lisa closes the drawer.

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

## Campaign 3: Harbour Road
Nine chapters (gym levels 1-9) in `shared/gym3d/storyHarbour.ts`. A working
harbour: the rival is Captain Mara Reyes's IronWave (a rowing club that grew a
weights room, "forty years", Rivera says thirty-nine), the food shop is Old
Joe's Fish Shack. A 1987 ledger shows IronWave once lost a race to Joe's
father; the rematch has three crews (the gym, IronWave, Joe's cousins) and one
harbour trophy, which they end up sharing.

## Campaign 4: Pavement Street again
Nine chapters (gym levels 1-9) in `shared/gym3d/storyReunion.ts`. The locations
repeat after three, so it is the first street some years on, with the first
cast: MaxOut is a smaller, quieter gym under Dana Voss, Victor drops in without
leaflets, and Barry reveals that the Burger Baron's secret is the pickle. The
street votes on a mural, ties between a pigeon and a burger, and paints a pigeon
holding a burger together; the arc ends in a street party.

## Campaign 5: Campus Row again
Nine chapters (gym levels 1-9) in `shared/gym3d/storyAlumni.ts`. The second
street some years after graduation, for alumni weekend: Professor Quill runs a
"longitudinal study" of the gym, Tess has added a mezzanine to the cafe, and
the alumni committee wants a fun run. The two gyms map a route through the
quad that passes the old library twice, two hundred people sign up (half of
them have not run since graduation) and the run ends with cake on the quad.

## Campaign 6: Harbour Road again
Nine chapters (gym levels 1-9) in `shared/gym3d/storyTides.ts`. The third street
some years on: Captain Reyes has retired (and is on the quay anyway), Old Joe's
shack has a queue he cannot explain, the road floods at spring tides and a storm
leaves the crew's boat in the car park. The arc ends in a small regatta.

## Campaign 7: Pavement Street, a third time
Nine chapters (gym levels 1-9) in `shared/gym3d/storyNight.ts`. The first street
once more, with a Friday night market: Barry's pickle stall, Dana sharing an
awning in the rain, Victor's old banner poles hung with lights, and the gym's
"five minute stand". The mural pigeon is spotted again. The council is asked to
keep the market and the street signs one list together.

## Campaign 8: Campus Row, a third time
Nine chapters (gym levels 1-9) in `shared/gym3d/storyExams.ts`. Exam week: the
library never closes, Professor Quill's "ten minute study break pass" with a
stamp, Tess's all-night cafe with a quiet corner, Dr. Kim's breathing advice and
a chair by the results door. The arc ends with two hundred stamps and the Row
sleeping in.

## Campaign 9: Harbour Road, a third time
Nine chapters (gym levels 1-9) in `shared/gym3d/storyLighthouse.ts`. The winter the
old lighthouse is restored: Captain Reyes counts eleven dark years, volunteers
relay supplies up a hundred and twelve steps, Old Joe feeds the crew, a gale
keeps everyone in the gym for two days and the street collects spare cable.
Marcus's nine-year-old nephew throws the switch.

## Campaign 10: Pavement Street, a fourth time
Nine chapters (gym levels 1-9) in `shared/gym3d/storyCapsule.ts`. The street turns
ten and digs up the tin Barry buried by the lamp post: a list for the next tin,
Rivera's two-line letter, Victor's banner pole marking the spot, a membership card
numbered 0001 (Lisa's), a hand-drawn gym map with one treadmill and a large plant,
forty opening-day photos with Derek in the corner of all of them, and a new tin
(a stopwatch, a better list, one pickle) buried with a date ten years on.

Campaign 11 onwards have no story yet (they can be finished from gym level 17).
