# PRD: Content-Tuning Framework

## Problem Statement

Most of the game's flavor content — coach messages, monthly challenges,
weekly sprints, tournament victory messages, weekly inspiration, gym NPC
dialog, gym events, NPC portraits — is generated live by Gemini
(`server/services/ai/index.ts`'s `GeminiAIService`). The prompts steering
all of it were hardcoded strings scattered across TS files, with no way to
iterate on tone/quality without editing source and redeploying, and no
shared mechanism to capture "this felt off, here's why" feedback and fold
it back in.

## Solution

A generic, extensible **generate → tag/free-text feedback → AI ingests
feedback into a living tuning doc → regenerate** loop, driven from a
dev-only admin page at `/content-tuning`. Submitting feedback triggers a
Gemini call that rewrites the relevant tuning doc based on the sample,
selected feedback tags, and a free-text note (scoped either to that one
sample or as a durable rule for the subcategory going forward), writes it
to disk, and immediately regenerates a new sample reflecting the change —
one submit round-trips ingest → update → regenerate, so a session can run
indefinitely.

## Decisions made while scoping this

1. **In-app admin page, not a Claude Artifact** — it needs to call the
   real backend Gemini services and write real repo files, which only an
   in-app tool can do.
2. **Feedback ingestion is fully automated** (a Gemini call rewrites the
   doc), not a manual/session-based review step — trading a small amount
   of AI-rewrite drift risk (mitigated by the audit trail + revert, see
   below) for a tool that's actually fast to iterate with.
3. **Living tuning docs, not drift-prone snapshots** — tuning docs are
   read from disk on every real generation call (not cached at process
   boot), so a tuning-page edit takes effect immediately, with no drift
   between "what we tuned" and "what ships."
4. **Gym layout is an explicit experimental preview, not a real content
   type** — `server/services/gym/layout.ts`'s `UPGRADE_LAYOUT` is a
   static, hand-tuned coordinate map in production, not LLM-driven. The
   `gym_layout` tuning type lets Gemini propose a layout against a tunable
   spacing/zoning doc for preview purposes only; it deliberately does
   **not** write back into `UPGRADE_LAYOUT`. Promoting a tuned layout to
   production is a separate, deliberate follow-up decision.
5. **Gym simulation is out of scope entirely** —
   `server/services/gym/simulation.ts` (~900 lines) is a deterministic
   scheduling/state-machine engine, not a single bounded "propose one JSON
   blob" generation task the way layout coordinates were. There's no
   existing LLM-generation prompt to extract (NPC `personalityProfile`
   data is hand-authored in `server/db/seed.ts`, not LLM-produced), and a
   meaningful preview would require watching live, multi-tick canvas
   behavior rather than a static sample — doesn't fit this framework's
   snapshot-and-feedback shape. Would need its own design pass if ever
   tackled (most likely: a "generate a new NPC personality profile from a
   themed prompt" feature, which is a different problem than "tune this
   existing generator").

## Architecture

- **Registry** (`server/services/contentTuning/registry.ts`): one
  `ContentTuningType` entry per content type — key, label, `sampleKind`
  (`"text"` default / `"image"` / `"layout"`), subcategories (each with a
  `tuningDocPath`), `contextParamFields` (hand-rolled select/text
  descriptors — no zod, matching the rest of `server/`'s manual-validation
  style), `feedbackTags`, and a `generateSample` function. Adding a future
  content type is one new file + one registry entry — no route/page/DB
  changes needed.
- **Tuning docs**: plain `.md` files, mostly under
  `server/services/contentTuning/docs/` (coach-personality docs stay
  alongside their existing `.ts`→`.md` prompt files in
  `server/services/ai/prompts/`), read via
  `server/services/contentTuning/fs.ts`'s `readTuningDoc`/`writeTuningDoc`
  — resolved from `process.cwd()`, not `import.meta.url`, so they work
  identically under `tsx` dev and the compiled `dist/` build (which
  doesn't copy non-`.ts` assets). The `Dockerfile`/`.dockerignore` were
  updated to ship these `.md` files in the production image.
- **Audit trail**: `content_tuning_feedback` DB table (migration
  `0016_content_tuning.sql`) — every feedback submission records the
  before/after doc, the sample, tags/note, and an AI-written changelog.
  This is the real safety net against AI-rewrite drift over many
  iterations (not just the ingestion prompt's own "consolidate, don't
  balloon" instruction), and powers the page's revert action.
- **Routes**: `server/routes/contentTuning.ts` (`createContentTuningRouter`,
  admin-gated via `requireAdmin` — dev-only, same as the rest of the admin
  panel) — `GET /types`, `GET /:type/:subcategory/tuning-doc`,
  `POST /:type/:subcategory/generate`, `POST /:type/:subcategory/feedback`,
  `GET /:type/:subcategory/history`,
  `POST /:type/:subcategory/revert/:feedbackId`.
- **Page**: `src/pages/ContentTuning.svelte` — content type → subcategory →
  context-params picker, generated sample (text / image / an inline SVG
  spatial preview for `layout`), feedback tag chips + free-text note +
  sample-vs-global scope toggle, and a history sidebar with per-entry
  revert.
- **AI methods** (`server/services/ai/index.ts`): `generateCoachSample`,
  `refineTuningDoc` (the content-type-agnostic ingestion meta-prompt), and
  `generateGymLayout` were added; `generateVictoryMessage`,
  `generateWeeklyInspiration`, `generateMonthlyChallenge`,
  `generateWeeklySprint` had their inline prompt templates extracted to
  external docs; `server/services/gym/dialog.ts` and
  `server/services/gym/content.ts` gained shared `buildNpcDialogPrompt`/
  `buildGymEventPrompt`/`buildPortraitPrompt` functions so the real
  generation path and the tuning-preview path share one prompt-construction
  source of truth (only the *shared* scaffolding is tunable — e.g. NPC
  dialog's per-NPC `personalityProfile`, which already has its own admin
  editor, stays untouched).

## Registered content types

| Type key | Tuning doc(s) | Notes |
|---|---|---|
| `coach_personality` | `server/services/ai/prompts/{5 personalities}.md` | Cascades into `victory_message`/`weekly_inspiration` below — tuning a persona affects those too. |
| `sprints` | `docs/sprints.md` | |
| `monthly_challenge` | `docs/monthly_challenge.md` | |
| `victory_message` | `docs/victory_message.md` | Wrapper rules layered on the persona doc. |
| `weekly_inspiration` | `docs/weekly_inspiration.md` | Wrapper rules layered on the persona doc. |
| `npc_dialog` | `docs/npc_dialog.md` | Shared scaffolding only, not per-NPC. |
| `gym_events` | `docs/gym_events.md` | |
| `npc_portraits` | `docs/npc_portraits.md` | `sampleKind: "image"`; preview files write to a small fixed set under `public/assets/gym/portraits/_tuning-preview/` (gitignored, overwritten per preset×stage, cache-busted query param) — never the real per-NPC portrait paths. |
| `gym_layout` | `docs/gym_layout.md` | `sampleKind: "layout"`; **preview only**, does not affect `UPGRADE_LAYOUT`. |

## Testing Decisions

`tests/contentTuning/*.test.ts` — one file per rollout batch, covering
401/403/404 auth and shape cases plus a happy path per content type via a
stubbed `AIService` (real Gemini calls are exercised manually, live,
during development — see the git history for this feature's commits for
verified real-API round trips). The generic feedback/history/revert
mechanics are tested once (`coach_personality`) rather than duplicated
per type, since that logic is content-type-agnostic.

## Out of Scope

- Gym simulation tuning (see Decision 5 above).
- Promoting the `gym_layout` preview into the live `UPGRADE_LAYOUT`.
- A "delete stale preview" cleanup job for `npc_portraits` previews —
  unnecessary given the fixed-filename-overwrite scheme already bounds
  disk usage.
