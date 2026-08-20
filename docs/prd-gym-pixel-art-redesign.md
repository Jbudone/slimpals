# PRD: Gym Pixel Art Redesign

## Problem Statement

The gym canvas looks visually poor — flat icon-style equipment sprites, a missing NPC sprite (`worker.png`), and a floor tile that is a 1024×1024 image being downscaled to 32×32. Animation frames exist in the codebase but are never loaded or used. The gym does not feel like a living, believable space.

## Solution

Replace all gym visual assets with hand-authored Stardew Valley-style pixel art, created directly by the developer and dropped into `public/assets/gym/`. `shared/gym-sprite-manifest.json` is the single source of truth for every required sprite and portrait: its key, file path, category, exact pixel dimensions, frame count/fps, and a short art-direction description. The pipeline's job is no longer to *generate* art — it's to make the required-assets list unambiguous, validate what's on disk against it, and keep the gym playable (via placeholders) while art is still being produced.

**This replaces an earlier attempt at AI-generated art (via the Recraft API).** That pipeline (`scripts/generate-assets.ts`, perceptual-hash validation, a generate→validate→retry loop) is removed — the generated output didn't meet the quality bar and there's no reason to keep machinery built around a discarded approach.

## User Stories

1. As a gym visitor, I want to see animated pixel art equipment (barbells moving, treadmill belts spinning), so that the gym feels alive rather than a static icon board.
2. As a gym visitor, I want to see NPCs moving around the gym, so that I feel immersed in a shared gym environment.
3. As a gym visitor, I want to see static prop sprites (posters, mirrors, water cooler, benches) filling the gym space, so that the environment looks like a real gym and not an empty room.
4. As a gym visitor, I want the floor and walls to use proper pixel art tiles, so that the scene has a coherent visual style throughout.
5. As a developer, I want a single manifest that tells me exactly which sprites are required, where each file goes, and at what exact dimensions, so I know precisely what to draw.
6. As a developer, I want a validation script that checks every manifest entry against disk and reports what's missing or wrong-sized, so I always know the current gap without guessing.
7. As a developer, I want the gym to stay fully playable — with an obvious placeholder and a clear error — when a sprite hasn't been drawn yet, so missing art never breaks the game or blocks testing.
8. As a developer, I want adding a new entity (a new NPC, a new piece of equipment, a new prop) to automatically become part of the required-assets list just by adding a manifest entry, with no other code changes needed to get validation and placeholder coverage.
9. As a developer, I want a single style reference image, so that hand-drawn assets stay visually consistent with each other.
10. As a developer, I want Phaser animation definitions to be data-driven from the manifest (frame count, fps), so that animated equipment can be wired up without hardcoding frame math in scene code.
11. As a developer, I want to draw a sprite at whatever native resolution is comfortable and have tooling normalize it to the manifest's exact spec, so the exact-dimension requirement doesn't force an artificial constraint on how I work.
12. As a gym visitor, I want at least some NPCs to visibly perform the specific exercise they're doing (not just a generic bob), so equipment use feels distinct per activity.
13. As a developer, I want an NPC's equipment routing to be hard-constrainable to a specific list of keys (not just softly preferred), so I can guarantee a given NPC only ever appears at equipment I've actually drawn a pose for.
14. As a developer, I want exercise-pose art to be entirely optional and additive — if it's missing for a given (NPC, equipment) pair, the NPC falls back to today's generic tween exactly as now — so nothing regresses while poses are still being drawn.

## Implementation Decisions

- **`shared/gym-sprite-manifest.json`** is the source of truth for every sprite and portrait. It lives under `shared/` (not `public/`) because it's build-time configuration consumed by both a Node script and the client bundle, not a runtime-fetched asset. Each entry:
  ```jsonc
  {
    "key": "cardio_treadmill",       // Phaser texture key (must match GymScene/NpcSprite literals) or a portrait_* id
    "filename": "cardio_treadmill.png", // path relative to public/assets/gym/
    "category": "equipment",          // structure | ui | equipment | amenity | decor | staff | npc | portrait
    "frameWidth": 96,
    "frameHeight": 96,
    "frameCount": 4,                  // 1 = static, >1 = horizontal-strip spritesheet
    "fps": 8,                         // 0 for static entries
    "description": "Treadmill — black running belt, metal frame, control panel. Frame 1: belt at rest, frames 2-4 cycling forward."
  }
  ```
- All sprite frames are **96×96px** (matches the already-approved style reference dumbbell). Portraits are **128×128px** (dialog art, not a tile-grid sprite — no established convention existed before, so this is a clean starting point). Spritesheets are a horizontal strip: N frames wide, 1 row tall.
- A single **style reference image** (`public/assets/gym/weights_dumbbells.png`) anchors the palette and art direction for every hand-drawn asset. It was approved by human review in a prior slice — don't overwrite it without going through that review again.
- **`scripts/check-assets.ts`** (`npm run check-assets`) is the only script left in this pipeline. It reads the manifest, checks every entry's file exists at the expected path with the expected pixel dimensions, and prints a categorized checklist (`PASS`/`MISSING`, grouped by category, with the expected path and size for every gap). Exits 1 if anything is missing or wrong-sized — safe to wire into CI later if desired. Flags: `--category=<name>` to filter, `--missing` to only print gaps.
- **`PreloadScene.ts`** loads every non-portrait manifest entry via `load.spritesheet(entry.key, path, {frameWidth, frameHeight})` in a loop over the imported manifest — no hardcoded key lists. On a `loaderror` for a given key, it generates an in-memory placeholder texture (`src/components/gym/placeholderTexture.ts`: a magenta/black checkerboard with the key labeled on it) under that same texture key, so every existing `.add.image(key)` / `.add.sprite(key)` call keeps working unmodified. It also logs a grouped `console.error` listing every missing key with its expected file path and dimensions, and stores the list in `registry.set("missingSprites", [...])`.
- **`GymScene.ts`** reads `registry.get("missingSprites")` and renders a small always-visible corner banner (`⚠ N sprite(s) missing — see console`) when the list is non-empty, so a missing asset is visible in the running app, not just buried in devtools.
- **Portraits** (`NpcDialog.svelte`) are plain `<img>` tags, not Phaser textures — they're in the manifest for the same validation/checklist coverage, but PreloadScene doesn't load them. `NpcDialog.svelte` falls back to its existing initial-letter placeholder div on an `<img>` `onerror`, so a missing portrait degrades the same way a missing canvas sprite does.
- **Extensibility**: adding a new required sprite is *only* a new manifest entry. `check-assets` picks it up automatically (nothing to configure), and PreloadScene picks it up automatically (it iterates the manifest, not a hardcoded list) — a missing file for a brand-new entity gets a placeholder and an error report with zero extra code.
- **`GymScene.ts`** builds equipment animation objects from manifest data (frame count, fps, key) at scene init, not hardcoded per-equipment-key — done, via `deriveEquipmentAnimConfigs`.
- No changes to NPC dialog, interaction, or relationship systems.
- No backend or database changes — sprites are static files served by Vite, no new routes or schema needed.
- `sharp` remains a dependency (used by `check-assets.ts` for dimension checks via image metadata) — no other new dependencies.

### Asset format normalization

- `scripts/check-assets.ts` gains a `--fix` mode: for every manifest entry whose file exists on disk but doesn't match the expected `frameWidth × frameCount` by `frameHeight`, nearest-neighbor resize it in place (via `sharp`, matching the pixel-art-preserving resize the old Recraft pipeline used) to the exact expected dimensions, then report what was resized.
- `--fix` never creates a file that doesn't exist — it only normalizes present-but-wrong-sized files. A missing sprite stays missing (and still gets the placeholder/error treatment); normalization is not a substitute for drawing the art.
- This exists because requiring artists to draw at one exact pixel size is an artificial constraint — draw at whatever native resolution is comfortable (e.g. 48×48) and let tooling scale it up cleanly before it reaches Phaser. Without this, a wrong-sized file loads "successfully" (no `loaderror`) but gets sliced incorrectly by the spritesheet loader — silently worse than a missing file, since it doesn't trigger the placeholder fallback.

### NPC animation & exercise pose system

Today, NPCs are a single static frame (no walk-cycle, no directional art beyond a horizontal `setFlipX()` mirror), and "using equipment" is depicted by the *equipment* animating (if it's one of the animated `cardio_*` entries) while the NPC does a generic bob tween regardless of which equipment it's at. This section adds an **optional, additive** layer on top of that — nothing here is required for the gym to look correct, and everything degrades to today's behavior when art/config is absent.

- **No true cardinal (4-directional) NPC art.** Movement continues to use horizontal flip only, exactly as today. Full directional sets would multiply NPC art requirements ~4x for a payoff that's easy to defer indefinitely; revisit only if flip-only visibly reads wrong once real art is in.
- **Equipment routing constraint** (`personalityProfile.allowedEquipmentKeys?: string[]`): stored in the existing `personalityProfile` JSON blob (no schema migration — same pattern as the existing `equipmentPreferences` soft preference). When set, equipment choice for that NPC is hard-constrained to only those keys within their scheduled category — never falls back to another unlocked/free item in the category the way it does today. When unset, behavior is completely unchanged (any unlocked, unoccupied item in-category, softly nudged by `equipmentPreferences`). This is deliberately a *behavior* concern, kept independent of whether pose art exists for that pairing — art availability must never silently change simulation behavior.
- **Exercise pose art**: optional manifest entries keyed `npc_<npcKey>_<equipmentKey>` (e.g. `npc_trainer_marcus_cardio_treadmill`), category `"npc"`, `frameCount` 1 or >1 exactly like any other sprite. Because `PreloadScene` already loads every non-portrait manifest entry generically, and `deriveEquipmentAnimConfigs` already derives an animation for any `frameCount > 1` entry with no category filter, **no changes are needed to either** to support these — they're picked up automatically by adding the manifest entry. Poses are drawn facing one canonical direction and flipped in code exactly like movement, consistent with the no-directional-art decision above.
- **Resolution + fallback**: a pure `resolvePoseKey(npcKey, equipmentKey)` function pins the naming convention. At the call site, a pure decision function (taking a set of currently-available texture keys, not `scene.textures` directly) decides `"pose" | "fallback"` so the choice logic is unit-testable without Phaser. `NpcSprite.sprite` changes from `Image` to `Sprite` (a strict superset — behaves identically to `Image` while not animating, so this is not a behavior change for any NPC that has no pose art).

## How to add a sprite

1. Add an entry to `shared/gym-sprite-manifest.json`: `key` (must match the Phaser texture key used in `GymScene.ts`/`NpcSprite.ts` if it's a canvas sprite — pick anything unique and prefixed `portrait_` for portraits), `filename`, `category`, `frameWidth`/`frameHeight` (96 for sprites, 128 for portraits, unless you have a specific reason to deviate), `frameCount`/`fps` (1/0 for static, >1/>0 for an animated horizontal strip), and a `description` of what the art should show.
2. Draw the PNG at exactly `frameWidth × frameCount` wide by `frameHeight` tall, transparent background, and save it to `public/assets/gym/<filename>` (matching the `filename` path exactly — `sprites/` and `portraits/` are subfolders under that root).
3. Run `npm run check-assets` — confirm it reports `PASS` for your new key. If it's a canvas sprite (not a portrait), also start the dev server and confirm the placeholder checkerboard is gone and your art renders in the gym.
4. If it's a new equipment/NPC/prop *entity* (not just replacing an existing sprite), also check whether it needs a `GymScene.ts` layout entry, a server-side catalog entry, and admin panel support per `CLAUDE.md`'s cross-cutting checklist — the manifest only covers the art requirement, not the entity's game logic.

## Testing Decisions

- Good tests verify behavior through public interfaces, not implementation details.
- **`loadManifest`** — unit test: given a manifest file, returns entries with all required fields.
- **`validateDimensions`** — unit test: passes for correctly-sized static and multi-frame files, fails with a clear reason for a missing file or wrong dimensions.
- **`checkAssets`** — unit test: given a mix of present/missing files, returns one categorized pass/fail result per manifest entry.
- **Animation config** (equipment, once wired up) — unit test: for each manifest entry with `frameCount > 1`, assert the derived Phaser animation config has a valid key, correct frameCount, and fps > 0.
- **Canvas walkthrough** — functional: with sprites present, they render correctly; with sprites absent, the placeholder + banner + console report all appear and the gym remains playable. Human-verified via browser walkthrough.
- **`--fix` normalization** — unit test: a wrong-sized-but-present file gets resized to the exact expected dimensions in place; an already-correct file is left untouched; a missing file is left missing (never fabricated).
- **Equipment routing constraint** — test through the existing public interface (`computeGymSimState`), not the private picker functions, matching the prior art in `tests/gym/npc-simulation.test.ts` / `simulation-polish.test.ts`: set `allowedEquipmentKeys` on a personality-profile fixture and assert on the resulting `NpcSimState[]`, not by calling internal pickers directly.
- **Pose resolution** — unit test `resolvePoseKey` (pure, naming convention) and the pose-vs-fallback decision function (pure, given a set of available texture keys — no Phaser dependency needed to test it).
- Prior art: look at existing Vitest tests in `tests/gym/` for patterns.

## Out of Scope

- Automated / AI-based art generation of any kind (this PRD explicitly moves away from that).
- Adding new equipment types beyond the existing 25 + floor tile + NPC/portrait sprites (only replacing/re-sourcing existing entries) — new entity types are a separate feature decision, though the manifest mechanically supports them.
- 3D assets or any non-2D format.
- Runtime / on-demand sprite generation in the browser.
- Changes to NPC dialog or relationship/memory systems. (Equipment *routing* behavior is explicitly in scope as of the NPC animation & exercise pose system section above — that's the one narrow exception.)
- True cardinal (4-directional) NPC art — deliberately deferred, see "NPC animation & exercise pose system" above.
- Mobile-specific canvas scaling or responsive canvas layout.
- Sound effects or audio assets.

## Further Notes

- `worker.png` is currently missing and NPCs are currently broken in the canvas visually (placeholders now cover this gracefully, but the real art is still needed) — the NPC slice remains the highest-impact fix once art is drawn.
- The style reference (`weights_dumbbells.png`) was established through iterative human review in a prior slice and is the one asset that's already finished — don't redraw it without reason.
- `shared/gym-sprite-manifest.json` currently has 66 entries across `structure`, `ui`, `equipment`, `amenity`, `decor`, `staff`, `npc`, and `portrait` categories. Run `npm run check-assets` at any time for the live, authoritative list of what's done and what's missing — this document intentionally doesn't duplicate that list, since it would drift.
