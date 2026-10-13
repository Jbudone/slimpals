# Content pipeline: design (draft, not built)

Extends `docs/prd-content-tuning-framework.md` (generate, feedback, tuning doc,
regenerate, driven from the Admin page). That framework tunes one type at a
time by hand. This document is the plan for a shared pipeline that all
generated content (text and art) goes through, with a budget, telemetry, a
review loop that fits in about an hour a week on a phone, and a weekly report.

Status: design only. Nothing here is built. The order of work is at the end;
we go slowly and each phase ships on its own.

## Decisions already made (by the owner)

- **Budget** is a tunable value: **$5/day for the first week, then $1/day**.
  Both numbers live in config and can be changed from the web page.
- **Weekly email report** (spend, feedback, content stats) plus a **web page**
  for the same numbers, behind `isAdmin`.
- **Art goes through the pipeline too**, not only text.
- **Providers**: OpenRouter and Gemini (keys held by the owner).
- **Human time**: about **1 hour a week** for the first several months, on a
  phone, in the web app.
- **Exposure**: at least **85% of generated (published) content should be seen
  by a real player**; paid-for content nobody sees is waste.
- Global vs per-gym content: my call (below): **global by default**.

## What exists today (so we build on it)

- `server/services/contentTuning/`: a registry of types (coach lines, sprints,
  monthly challenge, victory message, weekly inspiration, NPC dialog, NPC
  banter, story chapters, staff room, gym events, NPC portraits, layout) each
  with a style doc under `docs/`, feedback tags and `generateSample`.
- One provider: `GeminiAIService` (`server/services/ai/index.ts`).
- Nightly jobs (`scheduler/jobs.ts`) and one real pool, `banter_pool`
  (newest 8 per situation, shared by every gym).
- Pure validators that already act as gates: `cleanBanterLines`,
  `cleanCoachLines`, `validateGeneratedChallenge`, `cleanTournamentFlavor`,
  plus tone tests (no exclamation marks, no body talk).

Gaps: no shared lifecycle, no cost accounting, no record of what was shown,
no provenance (which model, prompt and style-doc version), feedback does not
feed an eval set, one provider, no art lane, no report.

## Principles

1. **Pull, not push.** Generate only what players will see. The unseen backlog
   of a situation decides whether we generate more for it.
2. **Cheap gates first, expensive judges last.**
3. **Every item has provenance** (model, prompt version, style-doc version,
   cost) so we can say what a change did.
4. **Autonomy in tiers** (below). Money and story are never fully automatic.
5. **Models are knobs.** A routing table in config picks the model per task;
   nothing in the code names a model.
6. **No personal data leaves the app.** Prompts get gym state (room types,
   gear, season, NPC names), never player weight, food photos, names or
   emails.

## Global or per-gym content

**Global pool, personalised at play time.** With a small player base, per-gym
generation would leave most items unseen and break the 85% target. The cast
(NPCs, pairs, coaches) is the same in every gym, so lines for an individual or
a pair are global too. Personalisation comes from selection (the situation
matching this gym's state) and slots filled in at runtime (`{gym}`, `{room}`),
not from generating per gym. Per-gym generation is allowed only for something
that cannot be shared and is requested by a player action.

## The pipeline

```
Brief -> Generate -> Gates -> Judge -> Review queue -> Publish -> Telemetry
  ^                                                                  |
  +------------- refine, retire, tune prompts and budget <----------+
```

1. **Brief.** A content type plus a situation or gap (for example "banter,
   gym without a sauna, November"). Briefs come from coverage: situations
   whose unseen backlog is low or whose repeat rate is high.
2. **Generate.** A small batch from the routed model(s). Style doc and a few
   approved gold examples go in the prompt (cached where the provider allows).
3. **Gates (free).** Length, tone rules, banned words, schema validity, exact
   and near-duplicate check against the pool and recent plays (embeddings).
4. **Judge.** A cheap judge pre-scores against a rubric built from the style
   doc (specific, dry, in character, not AI-speak). A stronger judge only sees
   the top candidates and the ones the cheap judges disagree on. Judges are a
   different model family than the generator, to avoid self-preference.
5. **Review queue.** Human reviews the items where a label is worth the most
   (below).
6. **Publish.** Versioned, behind a flag, optionally to a share of gyms first.
7. **Telemetry.** Impressions, repeats, skips, who saw what.
8. **Refine or retire.** Low performers and flagged items leave. Feedback
   becomes eval examples and proposed tuning-doc edits.

### Item record

One table for all types (a thin envelope; the type-specific payload stays in
its own shape): `content_items` with type, situation key, payload, status
(`candidate | approved | published | retired | rejected`), provenance (model,
prompt version, style-doc version), cost in USD, judge scores, human label,
`shown_count`, `first_seen_at`, `last_seen_at`. Migrating `banter_pool` onto it
is the pilot.

## Cost control

- **Ledger.** `ai_spend` row per call: provider, model, tokens in and out,
  images, USD from an editable price table, content type, purpose.
- **Budget.** `content_budget`: a schedule of daily caps (`$5/day` from day 0,
  `$1/day` from day 8; editable) and per-type share weights. The first week at
  $5 is deliberately a measuring period: it tells us the cost per accepted
  item before we squeeze to $1.
- **Enforcement.** Estimate before each call, refuse when the day's cap is
  reached, keep about 10% in reserve for owner-requested regenerations, a kill
  switch, and alerts on a spend spike.
- **Art share.** Images cost far more per item, so art has its own share
  (starting guess 30%) and a lower volume.
- **Efficiency target.** Report cost per *published* item and cost per
  *seen* item, not only total spend.

## The 85% exposure rule

Two numbers are reported weekly:

- **Exposure rate**: of items published at least 14 days ago, the share seen by
  at least one real player. Target: **85% or better**.
- **Yield**: cost of items that were published and seen divided by total spend
  (rejected candidates count as spend). This shows the real waste.

How the pipeline protects them:

- **Demand-driven generation**: a situation with an unseen backlog is not
  topped up. Batch size scales with active gyms and observed plays per day.
- **Exposure-first selection**: when picking a line to play, unseen items get a
  boost until they have been seen once (this does not fight the repeat rule,
  it is just the first play).
- **Coverage-aware briefs**: spend goes where players actually are (situations
  that occur often) before rare ones.
- **Retire the unseeable**: items for situations that never occur are retired
  and reported, and the brief generator learns not to ask for them.
- The first-week $5 budget will probably overshoot what the player base can
  see; the exposure rule, not the cap, is what stops generation then.

## Human review (about one hour a week, on a phone)

A page behind `isAdmin`, mobile first, one card at a time, in the real
context (a speech bubble over the gym, a cutscene line with its portrait, an
art thumbnail):

- Big targets: **Good / Meh / Bad**, one-tap reason chips for Meh and Bad
  (the existing feedback tags), a free-text line only if wanted, **Skip**.
- **Pairwise mode** ("which is funnier?") for taste, which is faster and more
  reliable than a 1-5 rating.
- The queue is ordered by **value of a label**: judge uncertainty, judge
  disagreement, new types and models, plus a small random audit of items that
  were auto-published.
- A session is about 10 minutes (around 60 cards). Six of them fills the hour.
- Labels become the **eval set**, the gold few-shot examples and **judge
  calibration** (we track judge-human agreement; as it rises, the review share
  falls and the hour shrinks).
- The first session is a **model bake-off**: the same briefs from four or five
  models, blind, ranked by the owner. It picks the generator and judges with
  evidence and creates the first labels.

## Autonomy tiers

| Tier | Content | Who publishes |
|---|---|---|
| Automatic | banter, coach lines, challenge flavour, tournament names | gates + judges, with a random human audit |
| Review-gated | cutscenes, story drafts, staff room episodes, art | human approves; AI drafts and edits |
| Human only | economy numbers (payouts, costs), anything that spends a player's coins | owner; tuned from data, not by an LLM |

## Models (recommendations, to be confirmed in the bake-off)

I have not checked live prices; confirm slugs and prices on OpenRouter and the
Gemini price list before relying on these, and put them in the editable price
table.

- **Bulk generation (text)**: a fast, cheap tier. Gemini Flash-class (already
  wired) plus a Claude Haiku-class model via OpenRouter, so the voice differs
  between sources and one family's habits do not dominate the pool.
- **Cheap judge and pre-filter**: a different family from whichever generated
  the item.
- **Strong judge and editor**: a Claude Sonnet-class or Gemini Pro-class
  model, used only on the top candidates, on disagreements and on tier 2
  content. An Opus-class model only for story drafting, rarely.
- **Council** (several models draft or critique, one editor merges): worth the
  cost for story and cutscenes and for calibrating judges, not for banter. A
  council trends to the bland average, so it needs a diversity prompt per
  member and the human gold examples as the taste anchor.
- **Dedupe**: a small embedding model (Gemini or via OpenRouter); cents per
  thousand items.
- **Art**: Gemini's image model (the key is already used for NPC portraits)
  with a vision judge for style, safety and legibility, then human thumbs. See
  below.
- **Routing**: a `model_routes` table in config (task -> model, fallback,
  max cost). A thin `ModelClient` with OpenRouter and Gemini adapters.

## Art lane

- Fits: NPC and speaker portraits, billboards and posters, cosmetic icons,
  banners and the season looks. The gym itself is low-poly three.js built in
  code, so generated bitmaps are not a drop-in for 3D props.
- **Art as data** (a spike, not a promise): ask a model for a constrained JSON
  list of parts (boxes, spheres, colours) for a prop, validate it against a
  schema and render it with the existing builders (`pBox`, `pGeo`). Judge it by
  rendering a screenshot and showing it to a vision judge and then to the
  owner. This keeps art inside the draw-call budget and the engine's style.
- Style lock: a style doc plus reference images, a palette check, size and
  format gates, an NSFW and likeness check.
- Review is a thumbnail grid (cheaper to review than text).

## Telemetry and the weekly report

Events: item shown (content id, gym, time), skipped or dismissed where it
applies, repeat count per player, review labels, spend. No personal data.

**Page (`/admin/content`, admin only, mobile friendly)**: spend by day, type
and model against the cap; items generated, published, seen; exposure rate and
yield; repeat rate; review count and time used; judge-human agreement; best
and worst items; pipeline health and alerts; the budget and share knobs.

**Weekly email** (Monday, configurable time and zone): the same numbers in
plain text with a link to the page. Needs an email provider (below).

With a few players there is no statistical power for A/B tests on player
behaviour. Quality comes from human labels; telemetry is for exposure, repeats
and cost, not for taste.

## More ideas worth having

- **Shadow mode**: run a new prompt or model beside the live one, compare
  judged scores and cost, promote only on a win.
- **Golden-set regression**: when a prompt, style doc or model changes, replay
  the eval set and show the change in judge scores before it goes live. The
  deterministic part runs in CI.
- **Prompt and style-doc versioning with one-tap revert.** The current
  framework lets a model rewrite the tuning doc automatically; change that to
  *propose* an edit the owner approves in one tap, with the diff shown.
- **Anomaly alerts**: cost spike, exposure falling, repeat rate rising,
  rejection rate rising.
- **Continuity memory** for story types: the story bible and the last seen
  chapters as retrieval context so drafts do not contradict canon.
- **Optional in-game reaction** (a small laugh or thumb on a bubble) as a cheap
  extra signal, only if the human hour proves too thin.

## Needed from the owner before the matching phase

- An **OpenRouter API key** (server env, never in the repo) and confirmation
  of which models you are happy to use.
- An **email provider** for the weekly report. The app has none today. A small
  transactional provider such as Resend (HTTP API) or any SMTP account; needs
  a key and a verified sender address.
- The report **day, time and time zone**.

## Phases (each ships alone)

0. **Foundations, no behaviour change**: `ModelClient` (Gemini adapter, then
   OpenRouter), price table, `ai_spend` ledger, budget config and enforcement,
   admin page shell showing spend.
1. **Item record and exposure telemetry**, with `banter_pool` as the pilot
   (existing plays get logged; nothing about what plays changes yet).
2. **Gates, judge, embedding dedupe, review queue on the phone, eval set**, and
   the first **model bake-off** (this is the first review hour).
3. **Weekly email and the full dashboard.**
4. **Exposure-first selection and demand-driven briefs** for banter, then the
   other automatic types (coach lines, challenge lines, tournament flavour,
   staff room variety).
5. **Art lane** (portraits first, then the parts-as-data spike).
6. **Tier 2 drafting** (cutscenes, story) with a council, shadow mode, golden
   regression, proposed-edit tuning.
7. **Budget step-down** to $1/day on its schedule, with a review of cost per
   seen item before and after.

Banter freshness work (#303) is the first consumer, and the pipeline is how it
gets done.
