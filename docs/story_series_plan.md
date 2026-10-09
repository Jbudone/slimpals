# The series plan: one story, paced by levels

Owner feedback (2026-10): the story feels random and disconnected, the cutscenes
are hard to notice, and nothing follows a real arc or pace. This plan replaces
"a beat whenever the level and a timer allow" with a designed spine, sub-stories
and one reveal per level-up. Tone rules in `story_bible.md` still hold (dry,
supportive, nothing about bodies, no exclamation marks).

## The spine (all ten campaigns)
**Who is a gym for?** Every street the gym lands on has someone who thinks fitness
is a number to be measured against (a rival's leaderboard, a ranking, a regatta
time). Each campaign ends the same way: the street decides the number is not the
point, and an entry goes in the Hall of fame. Later campaigns find the earlier
entries (the 1987 ledger, the tin with card 0001), so the campaigns read as
seasons of one series, not ten separate stories.

Recurring motifs, so callbacks land: Marcus's notebook, Lisa's drawer of
evidence, Barry's pickle, Derek warming up, the large plant, the Hall of fame.

## Campaign 1 in full (levels 1-17): the origin
Three acts, **one chapter per level-up**, five threads woven through them (each
chapter carries a `thread` tag and ends on a hook that the next one picks up):

| Thread (`thread` tag) | Question | Pays off |
|---|---|---|
| `rival` (A, MaxOut) | What does MaxOut want from the street? | The lease buyer is Victor (L13), the public bid (L14), the Open |
| `notebook` (B, Marcus) | Who wrote MaxOut's first programme? | The sign's slogan (L4), the confession (L7), the flyer (L10), the wall (L15), the street board (finale) |
| the drawer (C, Lisa) | What is she keeping evidence of? | The 2009 clipping (L11), "it is all in the drawer" (L15), closed (finale) |
| `food` (D, Barry and Dr. Kim) | Can the Baron survive a gym street? | The free samples (L3), the imaginary friend (L6), the sale (L9), the fries (L12), the salad (finale) |
| `coaches` (E, Rivera and Dana) | Why do they not speak? | The reveal (L11), "same rules as 2011" (L16), the handshake (finale) |

| Level | Chapter | Thread | Beat |
|---|---|---|---|
| 1 | Opening day | street | The gym opens; Lisa's drawer; someone peels paper off the shop across the road |
| 2 | A very good coat | rival | Victor announces MaxOut: "everyone has a number"; Marcus has heard the line before |
| 3 | Free samples | food | Barry's free burgers; someone measured his shop |
| 4 | The new sign (set piece) | notebook | MaxOut's sign carries Marcus's line: "Show up. Start small." |
| 5 | The offer | rival | Victor offers to buy the gym and asks to keep Marcus, who knows "the programme" |
| 6 | A friend of a friend | food | Barry's imaginary friend and his lease |
| 7 | The notebook | notebook | Marcus's confession; Lisa: "I have a date for that" |
| 8 | Fine print (act break) | rival | Barry's lease is sold to a company starting with V |
| 9 | Downsizing | food | Barry puts the Baron up for sale; an offer from a very good coat |
| 10 | Half price | notebook | The flyer says "Programme by D. Voss" |
| 11 | Old rivals | coaches | Dana and Rivera; Lisa's 2009 clipping |
| 12 | Research | food | Dr. Kim's fries; Barry made them for a debating team in '99 |
| 13 | Class of 99 (midpoint) | rival | The school photo: Victor and Barry were best friends, Victor bought the lease |
| 14 | The deal | rival | Victor bids in public; Barry says not yet; Dana watches from the window |
| 15 | The wall | notebook | Marcus takes the notebook in; Victor never saw the wall; Dana hung it |
| 16 | The poster | coaches | The Pavement Street Open is announced |
| 17+ | The Open | rival | Seven days, a win or a lose chapter, then the finale (the salad, the handshake, the street board, the drawer closed) |

Rule: **every level 1-16 has exactly one chapter**; the set pieces (L4 the sign,
L8 the lease, L13 the photo, L16 the poster, then the Open) also bring a guest into
the gym and a change in the street (a sign, a banner, a crowd), so a reveal is
something you can see, not only read.

## Campaigns 2-10: seasons of the series
Each keeps its own place, rival and nine chapters (levels 1-9, one per level-up),
and gets a **callback chapter** at level 5 to an earlier campaign's Hall of fame
entry, and a **closing line** that names the entry it adds. Rewrite after campaign 1.

## How a reveal is presented
- **At the level-up**: the level-up overlay ends with "Chapter N is ready" and
  plays the cutscene next (Continue the story), instead of a card waiting
  somewhere in the gym. More than one pending (a big jump) queue in order.
- **Title card**: "Act 2 · Chapter 12 · The photo", a "Previously" line (one
  sentence from the last chapter of the same thread) and a progress ribbon
  (12 of 20).
- **A marker in the gym** until it is seen: a glowing speech bubble over the
  character who speaks first, and a dot on the stars button.
- **A teaser** for the next chapter in the story list: its title as "???" and the
  level that opens it.
- **No time gap.** The 16 hour gap goes; the level is the pacing (levels are
  already earned by habit), and one pending chapter at a time is the cap.

## Build order
1. Reveal pipeline (this section): `thread`, `previously`, chapter numbers, the
   level-up chain, the marker, queueing, no gap.
2. Rewrite campaign 1 to the table above (one chapter per level, threaded).
3. Re-thread campaigns 2-10 (callback chapter at level 5, closing line).
