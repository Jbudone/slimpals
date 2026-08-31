# PRD: Gym Progression Testing & Configurability

## Problem Statement

There's no way to see what the gym looks like at different points in its lifecycle without actually grinding real activity for weeks or months. On top of that, reloading the gym scene today looks like the gym is opening for the first time — every NPC walks in from the door on every load, including reloads where nothing actually changed — so even a working progression tool would look wrong the moment you used it.

## Solution

A dev/admin control that scrubs through "days since this gym started" via a slider with named, referenceable checkpoints (e.g. "Day 1 — Grand Opening", "Day 90 — Established"), regenerates a consistent gym state for that point, and reloads the scene so it reads as "the gym has been running the whole time, you're just looking in" — not a cold open. Ships alongside a much better placeholder-art fallback so the scrubbed states are actually legible before real sprites exist.

## What I found while scoping this

- **The "waking up" bug is real and separate from progression.** `GymScene.ts` spawns every NPC at a fixed door tile and tweens it to position with a fade-in + 1.5s walk, and this fires on *every* scene load or `scene.restart()` — not just genuine arrivals. Idle "bob" tweens also all start in lockstep (no phase offset), so a room of NPCs visibly pulses in sync. This needs fixing regardless of the progression tool, since switching progression points will reload the scene repeatedly.
- **Progression state is cheap to fake, no history replay needed.** Level/XP, per-NPC `relationshipLevel` (0-100), and `gymNpcDailyState`'s `gymDaysActive` counter (which directly drives each NPC's hardcoded "progression stage" thresholds — Derek≥30, Elena≥20, Tom≥15, Marcus≥1) are all plain columns settable directly; tests already do this (`tests/gym/npc-dialog.test.ts:239`). `userGyms.createdAt` already exists as a real "founded at" timestamp, just unused for this purpose today.
- **Crowd/liveliness has no progression lever at all today** — it's purely a function of hour-of-day (`CROWD_WINDOWS`), independent of gym level or age. This is exactly the "more people and activity around X point" lever requested, and it doesn't exist yet — it needs to be built, not just exposed.
- **Only 9 of 56 manifest-declared sprites exist on disk.** The other ~47 already fall back to a placeholder texture at runtime — except that fallback was silently broken (see below), so in practice they were rendering Phaser's built-in default "missing texture" icon instead.
- **Already fixed in this session** (see Implementation Decisions): the placeholder generator now draws a simple pixel-art person (colored by NPC, smiley face) for NPC sprites and a rough outline+icon for equipment/amenity/decor/staff props, instead of a magenta checkerboard. While implementing this, found and fixed the actual reason placeholders never rendered: Vite's dev server returns `200 text/html` (the SPA index page) for any unmatched asset path instead of a real 404, so Phaser's `loaderror` event never fired for missing sprites — the missing-key detection now checks texture existence after load completes instead, which works regardless of how the failure manifests.

## User Stories

1. As the developer, I want to jump the gym to "day 1," "day 7," "day 30," or "day 90" and have it look like a real, populated gym at that stage — not an empty room with people walking in.
2. As the developer, I want those checkpoints named and stable, so I can say "at the day-30 point we need more people around" and know exactly what state that refers to.
3. As the developer, I want a slider for finer-grained scrubbing between/beyond the named checkpoints, not just 4 fixed buttons.
4. As the developer, I want to see *some* visual reference for gym life right now, before real art exists — rough pixel people and equipment outlines are enough.

## Implementation Decisions

- **Fix the warm-start bug first** (`GymScene.ts`): only play the door-walk-in animation for a genuinely new NPC arrival (detectable — e.g. an NPC transitioning from absent to present between successive sim-state polls), not for every scene load/restart. On scene creation, place already-present NPCs directly at their current simulated position, already in their in-progress activity animation. Randomize each NPC's idle/bob tween start phase so a room of NPCs doesn't visibly pulse in unison. This directly fixes the "just woke up" problem and makes `scene.restart()` safe to reuse as the progression tool's reload mechanism (see below) — no new reload strategy needed once this lands.
- **Placeholder art improvements are already implemented** (`placeholderTexture.ts`, `spriteLoader.ts`, `PreloadScene.ts`, `GalleryScene.ts`): category-aware placeholders (NPC figure / equipment icon / flat structure fill) plus the loader fix so they actually render. Not yet committed — see final note.
- **Progression state derivation**: a new function computes, from a single `daysElapsed` input: `gymDaysActive = daysElapsed` (direct 1:1, matching the existing counter's meaning); synthetic XP via a documented daily-rate assumption (derived from existing real per-activity XP amounts in `server/services/gym/index.ts`, not invented from scratch) fed through the *existing* unlock-derivation logic so upgrade/NPC-roster unlocks stay automatically consistent with real gameplay thresholds — no separate unlock logic to maintain; per-NPC `relationshipLevel` scaled by `daysElapsed` (simple monotonic ramp for the first version, refinable later without changing the tool's interface).
- **Named checkpoints**: Day 1 ("Grand Opening"), Day 7 ("First Week"), Day 30 ("One Month In"), Day 90 ("Established") — matching the four phases described (early on / several days / several weeks / several months). Stored as stable ids so they can be referenced in conversation later.
- **Slider UI lives in the Admin panel** (new Gym-progression control), not a standalone dev route — this is squarely admin/testing tooling and belongs alongside the rest of the admin/testing work already underway (`docs/admin-testing-requirements.md`, issue #50). It overlaps with #50's "time/schedule override" bullet; this feature supersedes that specific bullet with a fuller design, the rest of #50 (dialog replay, animation jump, equipment viewer) is unaffected.
- **Crowd/liveliness scaling**: layer a new progression-based factor on top of the existing hour-based `CROWD_WINDOWS` (e.g., a floor/multiplier that rises with `gymDaysActive`), so higher progression visibly reads as "busier" — this is genuinely new simulation behavior, not just a tooling exposure, so it's scoped as its own slice with its own review.

## Testing Decisions

- Warm-start fix: unit-testable via existing `tests/gym/simulation-polish.test.ts`-style assertions on which NPCs get the arrival animation vs. direct placement; visual confirmation via screenshot per CLAUDE.md's canvas-testing guidance.
- Progression-state derivation: unit tests asserting `daysElapsed` → `(xp, gymDaysActive, relationshipLevel, unlockedUpgrades)` is deterministic, monotonic, and never produces an internally-inconsistent state (e.g., an unlock without enough synthetic XP for it).
- Crowd/liveliness scaling: unit tests extending `simulation-polish.test.ts`'s existing crowd-cap coverage with a progression dimension.
- Slider UI: screenshot-based verification at each named checkpoint, per CLAUDE.md.

## Out of Scope

- Authoring real sprite art — that's explicitly being done by hand outside this work; the placeholder system just needs to be legible in the meantime.
- Per-NPC personalized relationship ramp curves (different NPCs warming up at different rates) — first version uses a uniform ramp, refinable later.

## Further Notes

The placeholder-generator and loader-fix code changes described above are implemented but **not committed** as of this doc. Originally tracked as GitHub issues #60–#63; after a granularity review, #61 was closed and re-split:

| Issue | Title | Blocked by |
|---|---|---|
| #60 | Fix gym scene warm-start (unchanged) | — |
| #109 | Progression: XP/level/unlock derivation function | — |
| #110 | Progression: relationship-level ramp function | — |
| #111 | Progression: admin endpoint wiring | #109, #110 |
| #62 | Admin panel progression slider with named checkpoints (unchanged) | #60, #111 |
| #63 | Scale crowd density/activity with progression (unchanged) | #109 |
