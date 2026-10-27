# Story council (design)

Why: the chapters read flat (the diagnosis and the rules are in
`server/services/contentTuning/docs/story_craft.md`, which the council reads as its
brief). A single model writing dialogue chapter by chapter has nothing to be good at:
no arc that earns the scene, no scene that earns the line. The fix is to decide the big
things first, cheaply, with you approving them, and only then spend words.

## Levels, and who decides each

| Level | Output | Roles (each its own model route) | Approval |
|---|---|---|---|
| 1. Arc | A campaign: premise, stakes, threads, a chapter list (one logline and one turn each) | **Showrunner** proposes three options, **Reader** (another model family) says where each bores, what is cliché and whether the stakes are real, the showrunner revises the best | **You approve** (one page) |
| 2. Outline | Per chapter: place, an object in hand, goal, conflict, turn, emotional beat, who wants what, how it ends | **Showrunner** outlines all chapters, **Advocate** speaks for each character (does everyone want something? do they sound alike?), showrunner revises | **You approve** (one paragraph a chapter) |
| 3. Scene | The chapter itself: title, recap, 3 to 6 lines | **Writer** drafts using comedy devices where they fit, **Critic** reads it cold against the craft rules, writer revises | Review queue; nothing replaces live text until you approve |

Each level only starts from the approved output of the level above. A rejected draft
takes your note ("make Victor warmer", "this chapter has no turn") and the stage runs
again with the note in the brief; the old draft is kept, marked superseded.

## Why approval sits at levels 1 and 2
A bad arc cannot be fixed by good lines, and reading a page of outline takes a minute
where judging a chapter of dialogue takes ten. Your hour is spent where it changes the most.

## Models
Roles are routes (`content_config`): `showrunner`, `reader`, `advocate`, `writer`, `critic`.
Put a strong model on the showrunner and writer, and a different family on the reader,
advocate and critic. A story run costs a few calls per level; a campaign is a few dollars at
most, so it runs as an owner request (`reserve: true`), outside the daily banter budget.

## Data
`story_drafts` (migration 0042): campaign, level (`arc|outline|scene`), ref (the campaign
number for an arc, the chapter id otherwise), status (`draft|approved|rejected|superseded`),
body (json), trace (the council's notes), cost. Approved scenes become live by overriding the
chapter in `getStoryDto` (same ids, levels and rewards, so seen-story records keep working);
a campaign with no authored story yet is built entirely from approved drafts.

## Status
Built: the engine, the review page (`/story-review`) and the override layer for campaigns with no
authored story (13 and up). Not built: replacing an authored campaign (needs a mapping from council
chapters to existing chapter ids so seen-story records survive), and a first real run.

## Engine slice (earlier note)
This slice is the engine: prompts, parsers, validators, the three stages and the gates
between them, tested with fake models. Next: the review page and API (read a draft, approve,
reject with a note), then applying approved scenes to the game, then a first real run by the
owner from the Admin card.
