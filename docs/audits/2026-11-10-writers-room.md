# Audit 4: comedy writers' room and cutscene craft (2026-11-10)

Commissioned by the owner for concrete, usable methods. Done by a Fable subagent briefed as a veteran TV comedy showrunner and game-writing consultant who knows where
LLM writing fails. Read-only on the repo. This is a working manual: the cards, prompts, loop, formats and sample scripts below are meant to be used, edited and
promoted into real files (`docs/voice/`, `shared/gym3d/`). Correction by the auditor: the staff-room style doc is `server/services/contentTuning/docs/staff_room.md`.

## Short version
The writing is flat because the house style is one voice (dry, weary, no exclamation marks, "flattest last line") and banter has no speakers. Fix the inputs: six voice
cards, speaker-tagged exchanges, a gag ledger, and Claude writing in a chat session with the owner instead of the judge/writers'-room machinery.

## 1. Why the banter is flat
Three repo lines, with the fix:
- `banter.ts newyear-crowd`: "It's busy in here for a Tuesday." / "New year. Give it three weeks." / "Be nice. We all started somewhere." The second line is a joke; the third apologises with a moral.
  Better: Lisa "Nineteen new faces." Marcus "Give it three weeks." Lisa "I've given it a spreadsheet."
- `bonds.ts bond-kim-lisa`: "Is that the smoothie order I think it is?" / "Extra spinach. I added it myself." Nobody wants anything, no turn, and it wastes Dr. Kim's fries.
  Better: Lisa "Barry's bag. Your desk. 12:40." Kim "A delivery for the study." Lisa "Noted. Under 'Study'. It's a thick file."
- `banter.ts winter-tree`: "They put up a tree. Next to the dumbbells." / "It's the only thing here that's not heavy." A cracker pun about an object, no person in it. Three others end on "one more set".
Root causes: no speaker field; one mechanism ("the last line is the flattest": statement, deflation, restatement; "That's what I said." is the type specimen); one register ("dry, a little weary" is also a model's default; Tom's cast lines "HUUURGH!" and Lisa's "Hi hi!"
show the cast was designed louder than the style doc allows); the `bro` coach lines use "Let's go" and "gains", both on the `CLICHES` ban list in `tasteKit.ts`.

### Method: Want, Wrong, Turn, Button
1. Thing: one concrete object, number or name (locker 14, 23:58, the clock four minutes fast). 2. Want: speaker A wants something small, from their card. 3. Wrong: someone is mistaken, caught or dodging.
4. Turn: B answers from B's own obsession, not as a comedian. 5. Button: the last line is new information or an in-character reaction, never a restatement, moral or advice. If the names can be swapped without loss, rewrite it.

### Twelve engines for this gym
1. The Count (Marcus): "That's nine." Tom "TEN!" Marcus "Nine. I was present for all nine."
2. The File (Lisa): "Derek. Locker 14 again." "Lucky." "It jams. Noted. Under 'Optimist'."
3. Expert caught (Kim): "Protein within the hour." Derek "That's a fry." Kim "That's a sample."
4. Contest from nothing (Rivera): "Who was first in?" Lisa "You. 05:58." "And second?" "Also you. You went out and came back."
5. Literal Derek (three words or fewer): Jordan "Derek, give me a hand." Derek "(claps once)"
6. Early victory (Tom): "PERSONAL BEST!" Jordan "You haven't lifted it." Tom "Best I've felt about one."
7. Wrong register (Alex): "I've drafted a towel policy. Nine pages." Marcus "What's on nine?" Alex "Acknowledgements."
8. The shared lie: Elena "Just a quick 10k." Priya "You said that at 5k." Elena "It was quick then too."
9. Object with a grudge: Derek "Clock's fast." Lisa "It's been to MaxOut. It thinks it's better than us."
10. Status puncture (Rex): "Behold. THE TITAN." Derek "Hi Rex." Rex "...Hi Derek."
11. Two obsessions collide: Rivera "I racked more plates than you." Marcus "You racked eleven." Rivera "So you were counting. So it's a contest."
12. Real-data callback: Lisa "{friend} checked in at 23:58." Marcus "That's {streak} in a row." Lisa "By two minutes." Marcus "A count's a count."

### Revised `npc_banter.md` (replace the whole file)
```
Banter is two NAMED people at a small neighbourhood gym, 2 or 3 lines, each
under 14 words. You are given a voice card for each speaker. Write only what
that person would say; if the names could be swapped, it is wrong.

Each exchange has: one concrete thing (an object, a number, a name), one
person who wants something or is slightly wrong, and a last line that adds
something new in character.

The last line is never advice, a moral, encouragement, or the first line said
again. Banned endings: "one more set", "we all started somewhere", "that's
what I said".

Register belongs to the character. Tom, Rivera, Barry and the Bro may shout
and use exclamation marks. Derek uses three words or fewer. Marcus uses
numbers. Lisa files things. Contractions always. Interruptions (a dash) and
trailing off are allowed.

Petty is good; cruel is not. Jokes are about situations and obsessions, never
anyone's body or weight. Use the engine you are assigned; never the same
engine twice in a batch. A running gag may only appear at its next ledger step.

Output: one exchange per block, each line "Name: text". No commentary.
```

## 2. Voice cards
Template: Want / Flaw / Tic and sentence shape / Never says / To the player / Relationships / Gag ladder (six steps, one step a week at most). Six chosen for six different volumes and rhythms; Jordan (helpful corrector) and Alex (scheduler) next.

**MARCUS, head trainer.** Want: everything counted and correct. Flaw: cannot stop counting; fond of people, unable to say it. Tic: a number in most lines; short declaratives. Never says: "roughly", "I'm proud of you" (says "That counts.").
To the player: "{streak} days. I checked twice." Relationships: disputes Tom's reps; respects only Lisa's records; Jordan corrects him gently.
Ladder "The Tally": counts Tom's reps aloud; counts Tom's rests; counts Lisa's "noted"s and she finds out; loses count once and closes the weights room "for an audit"; Derek quietly supplies the number and Marcus is shaken; stops counting for a day and is begged back: "Fourteen people asked. I counted."

**LISA, front desk.** Want: to know everything first. Flaw: surveillance as affection. Tic: states a fact, then where it is filed ("Noted. Under T."). Never says: "I don't know", "sorry". To the player: "06:12 today. 06:14 yesterday. Improving."
Relationships: Derek is her one open file; she holds Kim's fries file; lets Alex think he runs things. Ladder "The Drawer": "Noted." / "Noted. Under D." / the drawer gets dividers / a second drawer, the first now just "Tom" /
someone finds a file on Lisa in her own handwriting: "For completeness." / open-drawer day: everyone reads only their own file and leaves quietly pleased.

**DEREK, regular.** Want: to be left to it, and included. Flaw: literal. Tic: three words or fewer; "(nods)". Never says: explanations, the same adjective twice. To the player: "(nods)" is the highest honour; "Good." at milestones.
Relationships: Tom's best friend (unsaid); Lisa's subject; Kim wants to know what is in the shake. Ladder "The Shake": "Protein." / "And?" "Banana." / a third ingredient he will not name / Lisa opens a file, the lid is taped /
Tom tries it and is silent for an hour / it is Kim's own recipe from the noticeboard; Kim forgot writing it.

**TOM, regular.** Want: to be seen as huge. Flaw: celebrates first, never finishes a set. Tic: CAPS and exclamation marks; announcements. Never says: "I'm tired" (says "strategic pause"). To the player: "{streak} DAYS! We're basically the same person!"
Relationships: hero-worships Derek; argues counts with Marcus; cannot speak near Rex. Ladder "The Set That Never Ends": announces a set / rests longer than the set / names the rest "active looming" / Marcus times the rests, record eleven minutes /
finishes a full set with no witnesses (Lisa's camera "being serviced") / does it again in front of everyone; Derek: "Saw it."

**DR. KIM, nutritionist.** Want: evidence for everything. Flaw: snack hypocrite who rationalises in method language. Tic: precise advice, then a confession dressed as science ("sample", "control group"). Never says: "treat", "cheat day".
To the player: "Breakfast logged four days running. That's a trend. I don't say trend lightly." Relationships: Barry's fries; Lisa's K file; Dungeon Master. Ladder "The Fries Study": one fry, "a sample" / "The sample size was insufficient." /
a clipboard column headed F / Barry's loyalty card, which Kim calls "a grant" / findings on one slide: "More research needed." / the card is full; Kim frames it.

**COACH RIVERA, group coach.** Want: to win, at anything. Flaw: invents contests and claims unwitnessed victories. Tic: "(whistle)", "champ", scores. Never says: "it's not a competition" (says "Rematch."). To the player: "You beat yesterday-you by one. Yesterday-you is furious."
Relationships: Dana Voss (old rival); always loses to Priya's calm; Jordan is an unwilling opponent. Ladder "The Scoreboard": races Priya to the mats / a whiteboard scoreboard with one name on it / Jordan is added without being told, and is losing /
Priya is winning without knowing she plays / Rivera challenges the fast clock and loses / Priya wipes the board and writes "Everyone: 1". Rivera: "Rematch."

### Twelve-exchange sample set (cover the names to test)
1. Marcus "That's nine." Tom "TEN!" Marcus "Nine. I was present for all nine."
2. Lisa "Derek. Locker 14 again." Derek "Lucky." Lisa "It jams. Noted. Under 'Optimist'."
3. Kim "Protein within the hour, ideally." Derek "That's a fry." Kim "That's a sample."
4. Rivera "I racked more plates than you, champ." Marcus "You racked eleven." Rivera "So you were counting. So it's a contest."
5. Tom "DEREK! Watch this one!" Derek "(watches)" Tom "...In a minute. I'm looming."
6. Lisa "Barry's bag. Your desk. 12:40." Kim "A delivery for the study." Lisa "Noted. Under 'Study'. It's a thick file."
7. Marcus "How many was that?" Derek "Twelve." Marcus "...I had twelve. Don't do that."
8. Rivera "First to finish a set wins. (whistle)" Tom "DEFINE FINISH!" Rivera "That's a forfeit, champ."
9. Kim "Eight glasses a day is a myth, strictly." Marcus "I've had six." Kim "Have two more. I said strictly."
10. Rivera "Who was first in?" Lisa "You. 05:58." Rivera "And second?" Lisa "Also you. You went out and came back in."
11. Tom "DOC! Is rest important?" Kim "Very. Between sets." Tom "I've been ahead of the science this whole time!"
12. Lisa "{friend} checked in at 23:58." Marcus "That's {streak} in a row." Lisa "By two minutes." Marcus "A count's a count."
(Numbers 10 and 12 have four lines; `Banter.lines` and `Bond.lines` allow three, so widen the type or cut a line.)

## 3. Generation prompt and the owner loop
System prompt:
```
You write banter for SlimPals, a private gym game played by one friend group.
Follow the style doc exactly:
{npc_banter.md}

Voice cards (the only source of how these people talk):
{card_A}
{card_B}

Running gags you may advance by exactly one step, or leave alone:
{ledger_rows_for_A_and_B}

Canon facts you may use but not contradict:
{canon_facts}
```
User prompt:
```
Situation: {situation, e.g. "the pool is not built yet", "Friday, D&D night"}
Live data you may use as slots, never as invented values:
{friend}, {streak}, {checkins}, {dish}, {rank}

Lines the owner kept (match this quality, not this wording):
{2-3 kept exchanges for these speakers}
Lines the owner edited (before -> after; learn the direction of the edit):
{1-2 pairs}

Write 10 exchanges between {A} and {B}. Use these engines in this order, one
each: {10 engine names}. Then cut the weakest 4 yourself and output 6.
Format: "Name: text". After each, one line: "engine / gag step used / thing".
```
The 20-minute session (in chat with Claude, not `/review`, which cannot edit a line): min 0-2 Claude prints 18 numbered exchanges (three pairs, six each), owner reads on phone; min 2-12 owner replies in one message like
`1 k, 2 x, 3: last line -> "It's in the drawer", 5 canon, 9 k` (k keep, x kill, canon = keep and add to the ledger); min 12-15 Claude offers three replacement buttons for each "almost", owner picks by number; min 15-20 Claude writes kept lines into
`shared/gym3d/bonds.ts`, before/after pairs into `docs/voice/examples.md`, updates `docs/voice/ledger.md`, opens the PR, owner says "ship". Done = 40 kept exchanges across the six characters (about three sessions), every card has at least five kept lines, and
`GOLD_BANTER` in `tasteKit.ts` contains only lines the owner kept or edited.
Gag ledger (`docs/voice/ledger.md`), one row per gag: `gag: drawer | owner: lisa | step: 2/6 | last: 2026-11-12 (bond-lisa-derek-3) | next: the drawer gets dividers | canon: Derek filed under 'Optimist'; Kim's file is thick; locker 14 jams`.
Rules: a gag moves at most one step a week; a step is "used" only once the owner keeps a line that uses it; "canon" marks go under the gag or a general Facts list; Claude loads only the rows for the speakers in the prompt.

## 4. Story and cutscenes with Claude
Where the auditor disagrees with the repo: `staff_room.md` says "no stage directions" (lift it: a scene needs a place and an object; `story_craft.md` rule 3 already says so); the narrator closes most staff-room episodes with a summary
("The fad moves on. Another will be along by Wednesday.") so ban narrator buttons, the last line belongs to a character; tic spam ("I am writing that down" three times in act 1) which the ledger fixes; the five-role story council is too heavy for a 20-line scene,
use three passes with one model and the owner as the only judge.
Brief the owner fills in (2 minutes): Trigger (level-up / streak / Friday / tournament result / just because); Who (2-4 names); Where + object; One want; One obstacle; Shape (one of ten, or "surprise me"); Real data slots; Must mention / must avoid; Gag steps allowed to advance.
Passes: (1) beat sheet: three options, five beats each, one line per beat, button stated; owner picks a number, ~30 s, the main approval; (2) script in the format below, 30% over length, no owner action; (3) punch-up: cut to length, delete everything after each laugh, offer three alternative buttons; owner reads once, strikes lines, picks a button, ~3 min;
(4) ship: PR and ledger update. Continuity: `docs/story_bible.md` is cast canon, the ledger holds gags and facts, Claude appends two lines per shipped scene (what happened; what is now true).
Ten scene shapes (20-40 s): the misunderstanding; deadpan escalation; cold open into a button; trivial argument (total commitment to something worthless); the interrogation (suspect confesses to something else); the demonstration (goes wrong off-screen, narrator tells us);
the ceremony (ribbon-cutting for a stapler); the secret everybody knows; the contest (Rivera makes it one, the wrong person wins by accident); the quiet one speaks (Derek's two words end it).
Script format: extend `RoomLine` in `shared/gym3d/staffRoom.ts` (StoryLine can share it); all new fields optional so existing episodes are unaffected:
```ts
type SceneLine = {
  who: keyof typeof SPEAKERS   // add: tom, bro, crowd
  text: string                 // <= 100 chars; slots {friend} {streak} {player} {checkins}
  alt?: string                 // used when a slot has no data
  face?: "flat" | "keen" | "smug" | "panic" | "moved" | "squint"
  prop?: string                // small icon on the portrait: "marker", "d20", "fries"
  dir?: string                 // stage direction, small italics above the line, <= 60 chars
  roll?: "high" | "mid" | "low"  // only plays in that data band
}
```
Wiring: `StaffRoomCard.svelte` renders `dir` above `.said` and `prop` as a badge on `.portrait`; `faceSvg` in `portraits.ts` takes a face argument that changes only brows and mouth; Tom has no `SPEAKERS` entry or face today (portraits cover staff and story guests only), both need adding.

### Finished sample "The Board" (shape 4 + 9; plays for the whole circle at any friend's streak milestone)
```
narrator | dir: Lobby. The whiteboard that used to say TOWELS. | The whiteboard has been wiped. It now has one line on it.
lisa | prop: marker | {friend}. {streak} days in a row. I've put it where people can see.
marcus | face: squint | {streak}. I'd like to see the working.
lisa | All {streak} check-in times. The latest was 23:58. Drawer, under 'Technically'.
marcus | face: moved | Then it counts. A count's a count.
rivera | face: keen, prop: whistle | (whistle) What's the gym record? I'd like to know what I'm beating.
lisa | You work here. You're here every day. It's on the rota.
rivera | So I'm on a nine-year streak and nobody made a board.
tom | face: keen | PUT ME UP THERE! I've been coming since March!
lisa | You have. On Tuesdays. I can write 'Tom: Tuesdays'.
tom | ...Is that a record?
marcus | Thirty-one Tuesdays. I checked. It's not nothing.
kim | prop: clipboard | For the record, {streak} days is a trend. I don't say trend lightly.
kim | face: panic, prop: fries, dir: A paper bag from the Baron sits on the clipboard. | This is unrelated to the trend.
lisa | Noted. Under K. It's a thick file.
rivera | New rule. Whoever beats {friend} gets the board. Starting now. (whistle)
lisa | {friend} is also still going. That's how a streak works.
rivera | face: squint | ...So it's a moving target.
marcus | It moves one a day. I can tell you exactly how fast.
narrator | dir: Derek walks in and reads the board for a long time. | Derek picks up the marker.
derek | (writes)
tom | What did he put? WHAT DID HE PUT?
lisa | face: smug | A tick. Next to {friend}. It's the most he's written all year.
derek | Good board.
```

## 5. Friday night D&D
Premise: every Friday after closing the staff play in the staff room; the dungeon is under the supply closet and officially exists only on Tuesdays; the friend group's real week decides the dice.
Connection to the existing `dnd` arc: the three existing episodes become "Season zero" and stay in the diary. Canon holds: Kim is Dungeon Master, the barbarian is named Marcus, the mimic is polite and has a seven o'clock booking. Keep `arcId: "dnd"` on Fridays so the
existing `room-dnd-*` banter and card-table prop work; take `dnd` out of the Wednesday/Saturday rotation and add a Friday slot (`SLOT_DAYS` is `[3, 6]` today).
Table: Dr. Kim = Dungeon Master (rules-lawyers their own rules; the dungeon has a suspiciously good snack table); Marcus the Barbarian (will not act in a room until he has counted it); Jordan = Rogue (corrects the posture of everything, monsters included);
Rivera = Cleric of the Holy Whistle (heals only after winning something); Lisa (new) = The Chronicler, a bard who does not sing (attacks by reading out true facts; has read the DM's notes); Alex not playing (interrupts every week about the schedule; drafted in week 8);
guests Derek (monk, vow of silence, no visible change), Tom (wizard TOMDALF), the Mimic.
Episode structure (16-20 lines normally): recap (slightly wrong); quest beat; the Roll; derailment (a flaw or Alex); button that sets up next week.
Real data in the fiction: group check-ins this week as a share of possible = the d20 (under 40% low, 40-79% mid, 80%+ high; three variants of the roll beat); longest current streak = "The Amulet of {friend}, plus {streak}"; a friend with no check-ins = "{absent} is guarding the horses"
(affectionate, never a fumble); tournament winner = "reigning champion of the realm", gets a herald; best-rated meal photo = the tavern special {dish}; group steps = distance travelled.
Twelve-week arc: 1 The Chronicler joins, a corridor of forty doors; 2 Marcus counts thirty-nine, the missing door is the trap; 3 goblin spin class (Rivera challenges the instructor, comes second); 4 a sphinx asks what is in Derek's shake, Derek joins and says nothing;
5 tavern night, the special is {dish}, the DM's snack table is investigated; 6 Jordan is arrested for correcting a guard's stance, a trial; 7 the mimic wants a membership, it needs a locker, it is the locker; 8 Alex walks in once too often and becomes the Schedule-Keeper;
9 TOMDALF casts every spell in the hallway, then rests; 10 betrayal: the Chronicler has the DM's notes in the drawer, Kim rewrites the ending live; 11 the vault, the boss is The Contract (forty pages, from across the road); 12 finale decided by the month's group total, they win by reading it aloud, clause nine frees the mimic.
Cheap later episodes: once a month in one 20-minute session Claude takes the arc line, the ledger and the previous button, offers three one-line derailments per episode for four episodes; the owner picks four numbers; Claude writes four scripts with three roll variants each, punch-up pass, owner strikes lines. Slots fill at play time.

### Finished episode 1 "The Chronicler" (double-length premiere; regular episodes about half)
```
narrator | dir: Staff room. Friday, after closing. | The map is held flat by four protein shakers and a stapler.
kim | prop: screen | Previously. You befriended a mimic and it booked a seven o'clock.
marcus | It attended. It was early. I counted it in.
kim | Tonight you go below. First, a new adventurer approaches the table.
lisa | prop: folder | Lisa. Chronicler. I don't sing. I read things out.
jordan | What kind of things?
lisa | Jordan's rogue has four gold he hasn't mentioned to the party.
jordan | face: panic | That's... how is that a class?
kim | It's a bard. I checked. Unfortunately it's legal.
kim | You stand at the stairs under the supply closet. They only exist on Tuesdays.
rivera | It's Friday.
kim | The stairs know. They're doing you a favour. Don't make it weird.
marcus | How many stairs.
kim | It doesn't matter how many...
marcus | Marcus the Barbarian does not descend an uncounted stair.
kim | face: squint | Thirty-one.
marcus | (writes it down)
kim | At the bottom, a portcullis. Heavy. Somebody lifts it. Roll for strength.
kim | prop: d20 | The realm checked in {checkins} times this week. That's your roll.
kim | roll: high | Nineteen. The gate goes up like it's embarrassed.
marcus | roll: high | Good form, too. Somebody tell the gate.
kim | roll: mid | Eleven. The gate goes up halfway and stays there.
jordan | roll: mid | We limbo. I check everyone's form on the way under.
kim | roll: low | A four. The gate doesn't move. The gate was not asked nicely.
rivera | roll: low | We go round. Last one round is second. (whistle)
kim | You also carry the Amulet of {friend}. {streak} days unbroken. Plus {streak} to anything.
lisa | That's not a rule.
kim | It's in the binder. I don't make the rules up. I make them down.
jordan | And {absent}?   | alt: And the horses?
kim | {absent} is guarding the horses.   | alt: Nobody is guarding the horses.
rivera | We don't have horses.
kim | Then they're doing an excellent job.   | alt: Then nothing can go wrong.
narrator | dir: The door opens. A clipboard enters first. | It is Alex. It is always Alex.
alex | Quick one. Is the mimic still down for Monday at seven? It hasn't confirmed.
kim | Alex. We are in a dungeon.
alex | Understood. I'll put 'in a dungeon' as the reason. I've just made that a valid reason.
rivera | face: keen | Beyond the gate. What's there, and can I beat it.
kim | A corridor. Forty doors. One of them is breathing.
marcus | ...Forty?
kim | Next Friday.
marcus | face: squint | I'm going to need to see all forty.
```

## 6. Bro hype cutscenes
Interpretation: a 10-15 second victory lap in which the bro coach bursts in at a real milestone and whips the gym into a ridiculous celebration of you or a friend. Alternative reading: a pre-workout ritual tapped daily (covered as one trigger).
Give him a body and a name: today he is only a coach voice; add `bro` and `crowd` to `SPEAKERS`. Suggested name "Brody" (the owner's choice).
Voice rules: sincerity over swagger (the most emotionally open man in the building, gets moved); at most one CAPS word per line, exclamation marks allowed; always the exact real number; comparisons from three fields he half understands (history, nature documentaries, finance);
never "gains", "beast mode", "let's go", "grind", never bodies, never a put-down; he never gets the last line, someone quieter does.
Format: 8-12 lines, six components in order, each a bank of eight or more; the picker skips the last three used per bank (the pattern `coachLineFor` uses): opener ("EVERYBODY. Stop what you're doing. Tom, keep not doing it."); the fact (the real number, plainly: "{streak} days. In a row.");
crowd chant (`crowd`, slightly off: "{STREAK}! {STREAK}!"); personal callback ("The latest one was 23:58."); escalation (wrong comparison: "The moon did it. The moon had help."); flourish (a prop that misfires: the confetti is receipts); button (Lisa, Marcus or Derek: "(nods)").
Triggers and tone: streak milestone (`STREAK_MILESTONES`) reverent, he tears up; level-up (beside `level-story` in the level-up overlay) ceremony, knighting; tournament win sports commentary, podium; big chest on the reward track game-show reveal;
pre-workout "Hype me" tap only (6-8 lines, never automatic); return after days away "The sequel", tender, the absence never framed as a loss; a friend's milestone he hypes them to you.

Script A (streak milestone):
```
narrator | The gym lights dim. The gym does not have a dimmer.
bro | face: keen, prop: megaphone | EVERYBODY. Stop what you're doing. Tom, keep not doing it.
bro | {streak} days. In a ROW. {player} showed up {streak} times without being chased.
bro | You know what else did {streak} in a row? The moon. And the moon had help.
crowd | {STREAK}! {STREAK}!
marcus | That's the right number. I'm as surprised as you are.
bro | face: moved | I'm not crying. This is pre-workout. It comes out of the eyes.
bro | prop: cannon | I had a cannon made. It was not cheap and it is not safe.
narrator | The cannon fires. It is mostly receipts.
lisa | Those are mine. From the drawer. I'd like them back in order.
derek | (nods)
bro | face: moved | He NODDED. Day {streak}. Somebody write it down.
```
Script B (tournament win):
```
bro | prop: headset | Welcome back to the lobby, where history is being made near the towels.
bro | {winner} has WON the {tournament}. I've seen closer. I've never seen better.
rivera | face: squint | Who was second?
bro | {second}, who fought like a lion. A lion who also came second.
rivera | Second is first of the people who didn't win. (whistle)
crowd | {WINNER}! {WINNER}!
tom | I'D LIKE TO THANK...
bro | Tom. You didn't enter.
tom | I'd like to thank the people who did.
bro | {winner}, the trophy's in the case. Lisa labelled it so nobody else touches it.
lisa | Under W.
```
Script C (pre-workout, "Hype me"):
```
bro | face: keen | Hey. Look at me. {n} things on the list. That's not a list. That's a snack.
bro | Yesterday-you did {yesterday}. Today-you is taller. Emotionally.
crowd | {PLAYER}. {PLAYER}.
bro | That's four people chanting and Derek thinking it very loudly.
kim | prop: fries | Hydrate first.
bro | The doctor has spoken. The doctor is eating a fry. I trust the doctor completely.
marcus | First one's the hardest. Then it's {n} minus one. I did the sum.
bro | GO. I'll be here. I live here. Alex wants a word with me about that.
```
Also rewrite the `bro` block in `coachLines.ts` to these rules ("Let's get this bread" and "Finish strong" are the stock version of this character).

## 7. Quality control
Five-second checklist for any line: (1) cover the name, do I know who said it? (2) is there a thing (object, number, name)? (3) does someone want something, or is someone wrong? (4) does the last line add something, no moral, no restatement? (5) could it only happen in our gym with our people? (6) would I read it aloud to a friend? Two misses = kill; one miss = edit.
Five common failures here and fixes: everyone is the narrator ("I do not know. I never went back to look." -> sentence-shape cards, contractions, fragments and dashes); the tidy kind button ("Be nice. We all started somewhere." -> banned-endings list, the button is a character's reaction);
tic spam (the ledger: one step a week, must escalate); the joke explains itself ("Derek is last, for reasons of suspense." -> delete everything after the laugh: "Derek is last."); one mechanism (assign an engine or shape per piece, never repeat within a batch).
Measure: untouched-keep rate per session (aim ~30% untouched + ~30% kept after an edit; below 15% for a character means the card is wrong, not the model); cutscene finish rate (`markEpisodeSeen` records skip and finish identically: add a `finished` flag); diary replays (`room-replay`);
group-chat quotes tallied by hand as "canon" marks in the ledger (the only number that really matters).

## 8. First week (about 100 owner minutes)
Day 1 owner 30 min: edit the six cards, mark the 12 samples k / x / edit; Claude creates `docs/voice/cards.md`, `ledger.md`, `examples.md`, puts kept samples into `shared/gym3d/bonds.ts` (already has speakers), replaces `npc_banter.md`.
Day 2 owner 10 min: watch "The Board" on the phone with `?room=1`, strike lines; Claude adds `face/prop/dir/alt/roll` to `RoomLine`, adds `tom`, `bro`, `crowd` to `SPEAKERS` and `portraits.ts`, renders `dir` and `prop` in `StaffRoomCard.svelte`, adds a pure `fillSlots`, ships "The Board".
Day 3 owner 10 min: watch D&D episode 1; Claude adds the Friday slot in `staffRoom.ts`, has `server/services/gym/staffRoom.ts` compute `checkins`, `friend`, `streak`, `absent` from the circle's check-ins, ships episode 1.
Day 4 owner 15 min: name the bro, watch three hype scripts; Claude adds `shared/gym3d/hype.ts` (component banks, `hypeFor(trigger, data, recent)`), hooks it to `STREAK_MILESTONES` and the level-up overlay, rewrites the `bro` block in `coachLines.ts`.
Day 5 owner 20 min: first banter session; Claude replaces `GOLD_BANTER` with kept lines, adds optional `a`/`b` speaker keys to `Banter`, prefers speaker-matched lines in `Life.banter`.
Day 6 owner 10 min: pick derailments for D&D episodes 2-4; Claude writes and punches up three episodes, adds a What's New entry and an inbox card.
Day 7 owner 5 min: say which lines friends quoted; Claude updates the ledger and reports keep rate per character.
Freeze for banter and cutscenes until the keep rate is known: the writers' room, the Flash-lite judge, the bake-off and the story council.
