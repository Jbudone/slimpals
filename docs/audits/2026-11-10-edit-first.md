# Audit 9: edit-first comedy, Bro Hype and Friday D&D (2026-11-10)

From an Opus subagent briefed as a satirical-news editor-in-chief. Verified in the repo: `RoomLine` is `{who, text}`; `SPEAKERS` has no Brody/Tom/other bros/crowd; the `fad` arc ends on a narrator summary; the `bro` coach block is stock. One web search confirmed 12-3-30, Japanese interval walking, rebounding, 75 Hard and "becoming Chinese" warm water as current; other fads are from memory.

## Why the samples failed
Tics, not premises (a habit with no situation is a catchphrase); private logic ("I've given it a spreadsheet", "Best I've felt about one" do not parse in one read); nobody started from a headline (a premise must be funny as one sentence before anyone writes dialogue). The fix is the order of work: headline, beats, draft, punch-up, with the owner's time on kills, not rewrites.

## Pipeline (owner = editor-in-chief)
1 Claude pitches 60 headlines, cuts to 20 against the rubric; 2 owner replies `keep 3 7 12` (2 min per 20, unnamed = dead); 3 five one-line beats per kept headline with the button stated; 4 draft 30% over length; 5 copy chief applies named moves and shows a BEFORE/AFTER/MOVE diff; 6 fact checker (contradictions, missing speakers, lines over 100 chars, body talk, gag advanced more than one step, out-of-card speech); 7 owner reads on the phone and replies `strike 4 9, button B` (2-3 min); 8 ship and append two ledger lines.
Ten punch-up moves: kill the narrator button; cut the restatement; make the callback the button; swap the safe noun for the weirder true noun and put a person in it; fake precision; give the straight man a short plain straight line that sets the trap; raise the stakes of the dumb thing until it has a consequence in the world; make it make sense in one read; one joke per line and drop the hedge; contractions and spoken rhythm.
Example: "Gym Bros Try Red Light Therapy" (topic, killed) -> "Bro's Red Light Mask Makes Him Look Like A Tomato" (about his looks, killed) -> "Bro In Red Light Mask Mistaken For Fire Exit Sign; Fourteen Members Follow Him Outside" (kept: pictureable, a consequence, only possible in this gym).

## Bro Hype
Roster (the improv teacher's four): Brody the pioneer, Kev the entrepreneur, Theo the sceptic (correct, then converts for an unrelated reason), Dale "since 2019" (retreats to an older worse version, "with a lamp"); Chad and Kyle are rare guests. Format (12-20 lines, ~40 s): cold open mid-fad; the pitch (fake-precise claim, Kev's price); Theo's straight line and Dale's claim; the demonstration goes wrong in the world (not on a body); the converted sceptic; the button belongs to a character (Brody may have the last word when sincere).
Fad generator: 52 a year, 26 real parodies and 26 invented, refreshed monthly by web search; eight twist operators (take the claim literally; apply it to the wrong thing; "-maxxing" past sense; Kev monetises it; the ritual outlives the reason; the measurement replaces the activity; invented ancient history; absurdly precise protocol); template "[Bro] [fad], [consequence]"; house rule: no fads about appearance or weight, performance/sleep/gadgets/supplements only.
Headlines (real trends parodied): 1 Man Doing 12-3-30 Workout Has Been On Treadmill Since 12:30. 2 Kev And Theo Still Arguing Which Three Minutes Of Japanese Interval Walking Were The Fast Ones. 3 Fibermaxxing Brody Announces He Has "Hit His Number," Leaves Very Quickly. 4 Dale Walking In Weighted Vest Now Wears Second Weighted Vest Under It "To Feel Something."
5 Brody Took Up Rucking In March, Has Since Carried Same Bag Of Sand To Three Weddings. 6 Kev's Creatine Gummies Independently Tested, Found To Contain Gummy. 7 Bros Unveil High-Protein Water; Dr. Kim Confirms It Is A Yoghurt. 8 Dale "Grounding" Barefoot In Car Park Since Tuesday, Has Been Assigned A Bay Number. 9 Bro In Red Light Mask Mistaken For Fire Exit Sign; Fourteen Members Follow Him Outside.
10 Mini-Trampoline Craze Reaches Gym; Ceiling Tile Count Down To Two. 11 Kev Asks Everyone To Speak In Full Sentences So He Can Check He's Still In Zone 2. 12 Brody Signs Up For Hyrox, Has Now Told Everyone In The Building, Including The Ghost Twice. 13 Sleepmaxxing Bro Falls Asleep During Own Sleepmaxxing Presentation, Calls It A Success. 14 Kev's Mushroom Coffee Delivers Unprecedented Focus, Mostly On What It Cost.
Invented: 15 Brody Discovers "Reverse Warm-Up," Cools Down Before Leaving The House. 16 Bros Adopt Lunar Training Calendar; Leg Day Now Every 29.5 Days. 17 Kev Launches Pre-Workout That Is Just Him Saying "Pre-Workout" Very Close To Your Ear. 18 "Ancestral Lifting" Bans Anything A Caveman Wouldn't Recognise; Dumbbells Out, Lisa's Stapler In. 19 Dale Has Done The "Silent Set" For Three Weeks; Nobody Can Confirm He Has Done A Set. 20 Brody Begins Hydrating In Advance For Next Week, Has Stopped Answering The Phone.
Scene "The Glow" (headline 9):
```
narrator | The weights room, after dark. Something behind the squat rack is glowing red.
brody | Nobody panic. It's me. It's my face.
theo | Why is your face red.
brody | Red light therapy. Six hundred and sixty nanometres. Mitochondria love it.
theo | Do you know what a mitochondria is.
brody | No. But I know it loves this.
kev | Forty-nine ninety-nine. Battery on a lanyard. I've got a box in the van.
dale | Been doing red light since 2019.
theo | Kev's had them since Tuesday.
dale | I was doing it with a lamp.
narrator | Alex dims the main lights for evening yoga. Brody is now the only light in the room.
narrator | Fourteen members stand up, calmly, and walk towards him in single file.
brody | Why is everyone walking at me.
lisa | You're red, you're glowing and you're by the door. They think you're the fire exit.
brody | I'm not the exit.
narrator | He backs out onto the pavement. All fourteen follow him.
marcus | Fourteen out in eleven seconds. Best drill we've ever had.
theo | ...Kev. Do they do a brighter one.
alex | Brody. You're on the fire rota now. Tuesdays. Stand by the door.
brody | I'm a regulation.
```
Scene "Kreatine" (headline 6; the real story behind it, from memory and unverified, is that lab tests found some creatine gummies with little or no creatine): Kev sells "Kev's Kreatine, five grams in every gummy" from a folding table; Theo "That gummy weighs about two grams"; Kev "It's concentrated"; Dale "on creatine since 2019" turns out to mean Kev's, which started Tuesday; Dr. Kim's lab result: "Each gummy contains: gummy."; Brody asks what he has been feeling, Kim: "Sugar. And belief. The belief was off the charts."; the next morning the label has been changed in marker to "Kev's Konfidence ... Now lab-tested."
Build: add `brody`, `kev`, `theo`, `dale`, `tom`, `crowd` to `SPEAKERS` with faces; a weekly slot in `staffRoom.ts` or a separate `hype.ts` arc; retire or fold the old `fad` arc as Season 0.

## Friday night D&D (new headlines; Dr. Kim stays Dungeon Master)
1 Dungeon Master Reads Out Her Own Shopping List As A Prophecy; Party Follows It Exactly. 2 Dr. Kim Rules Health Potions Must Now Be Logged With A Photo. 3 Party Kills Dragon, Spends Rest Of Session Splitting Hoard In Alex's Spreadsheet. 4 Goblins Unionise After Jordan Corrects Their Posture; Demand Lumbar Support. 5 Rivera's Cleric Declares The Boss Fight "A Warm-Up," Demands A Real One.
6 Guest Wizard Tom Announces Twelve Spells, Then Discovers He Hasn't Picked Any. 7 Derek Rolls His First Natural 20, Says Nothing; Session Stops For Twenty Minutes So Everyone Can Process It. 8 The Group Missed Thursday, So The Realm Has Lost Thursday (driven by real check-ins). 9 Barry Joins As A Tavern Keeper Nobody Asked For, Won't Let Anyone Leave The Tavern. 10 Party Spends Whole Session Choosing Rope; Rope Not Needed.
Scene "The Prophecy" (headline 1): Kim reads the hermit's "ancient prophecy": "Eggs. Oat milk. The good bin bags. Something for Saturday." Jordan "That's your shopping list." Kim "Prophecies are often written like shopping lists." Marcus "How many eggs." Kim "It doesn't say." Marcus "Then I don't move. A barbarian doesn't act on a prophecy with no numbers." Rivera "'Something for Saturday.' That's the boss." Jordan "Or it's crisps." Rivera "Then I fight Crisps. I've beaten worse. (whistle)"
Lisa has written the hermit a stock book ("It's very thorough"); the party returns with eggs, oat milk and bin bags; Rivera "A sword. Saturday's handled."; Kim "Now, out of character, I need that scroll back." Marcus "It's a sacred scroll." Kim "Marcus. I need eggs." Marcus "How many."

## Rubric (5 seconds)
Headline (kill on either of the first two): picturable in one read? second half a consequence nobody saw coming, not a description? target a fad or delusion, never a body? would I say it aloud to a friend? Line (one no = edit, two = cut): understood first time without lore? adds something (a turn, new information)? cover the name, do I know who said it? funniest word last? could it be shorter?
The AI never decides alone: keep/kill on a headline, the final button, anything that becomes canon, any line about a real friend, voice-card changes, what reaches players. No AI judge gates humour.
Collaboration tool: start in chat with the reply grammar (`keep`, `strike`, `button B`); if it sticks, build a small `/desk` page (headline board to swipe keep/kill, tap a line to strike or ask for three alternatives, a canon list) with verdicts in the database read by an export endpoint. Build only after two chat rounds work.

## First exercise (owner ~10 minutes)
Reply with the numbers to keep from the 20 Bro Hype and 10 D&D headlines, and `strike N` for any failing line in "The Glow" and "The Prophecy". Claude then writes the two best-kept headlines without scenes through the full pipeline (owner ~3 minutes). It worked if the owner keeps at least 5 of 20 headlines and ships at least one of the four scenes with two strikes or fewer (better: a friend quotes a line). If fewer than 3 of 20 survive, the premises are broken, not the dialogue: the owner writes five headlines and Claude executes them.
