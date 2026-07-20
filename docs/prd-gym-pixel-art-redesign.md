# PRD: Gym Pixel Art Redesign

## Problem Statement

The gym canvas looks visually poor — flat icon-style equipment sprites, a missing NPC sprite (`worker.png`), and a floor tile that is a 1024×1024 image being downscaled to 32×32. Animation frames exist in the codebase but are never loaded or used. The gym does not feel like a living, believable space.

## Solution

Replace all gym visual assets with hand-generated Stardew Valley-style pixel art at 48×48px per frame, produced offline via the Recraft API. Equip and NPCs get animated spritesheets; the floor and background get proper tiled pixel art. A sprite management pipeline (manifest, generation script, validation loop, gallery scene) makes the asset set reproducible and maintainable.

## User Stories

1. As a gym visitor, I want to see animated pixel art equipment (barbells moving, treadmill belts spinning), so that the gym feels alive rather than a static icon board.
2. As a gym visitor, I want to see animated NPCs working out or moving around, so that I feel immersed in a shared gym environment.
3. As a gym visitor, I want to see static prop sprites (posters, mirrors, water cooler, benches) filling the gym space, so that the environment looks like a real gym and not an empty room.
4. As a gym visitor, I want the floor and walls to use proper pixel art tiles, so that the scene has a coherent visual style throughout.
5. As a developer, I want an offline generation script I can run any time to (re)create any sprite via Recraft, so that new assets can be added or updated without manual art work.
6. As a developer, I want to regenerate a single sprite by name without affecting the rest, so that I can iterate quickly on one asset.
7. As a developer, I want a style reference image passed to every Recraft call, so that all generated assets share the same pixel art palette and visual style.
8. As a developer, I want a sprite manifest (JSON) that records each sprite's prompt, Recraft params, frame count, animation fps, approved hash, and status, so that the pipeline is fully reproducible and auditable.
9. As a developer, I want an agent-style generation loop that retries with a refined prompt when validation fails, so that asset creation is mostly hands-off.
10. As a developer, I want perceptual hash validation to catch style drift between the approved and newly generated version of a sprite, so that a regenerated asset doesn't visually break consistency.
11. As a developer, I want a sprite gallery scene (dev-only, `/gym-sprites`) that renders every sprite side-by-side with its name, so that I can visually audit the full set and spot anything that doesn't fit.
12. As a developer, I want Phaser animation definitions to be unit-testable (correct keys, frame counts, fps), so that broken animation configs are caught before the browser.

## Implementation Decisions

- All sprite frames are **48×48px**. Spritesheets use a horizontal strip format: N frames wide, 1 row tall.
- `public/assets/sprite-manifest.json` is the source of truth for every sprite: name, Recraft prompt, params (style, frame count, fps), approved perceptual hash, and approval status (`pending` | `approved` | `rejected`).
- A single **style reference image** (`public/assets/style-reference.png`) is passed to every Recraft API call to lock palette and art direction across all assets. It is established via iterative human review before any other assets are generated.
- All existing flat icon PNGs, the broken floor tile, and the legacy `anim-*.png` frames are deleted as part of the cutover. The new pipeline owns `public/assets/` entirely.
- The generation script (`scripts/generate-assets.ts`) exposes three modes:
  - `--all` — regenerate every sprite in the manifest
  - `--sprite=<name>` — regenerate one sprite by name
  - `--validate-only` — check hashes without generating
  - `--loop` — agent-style: generate → validate → refine prompt → retry (up to configurable max attempts)
- Animation definitions are **data-driven from the manifest** — the Phaser scene reads frame count and fps from the manifest rather than hardcoding them in scene code.
- **`PreloadScene.ts`** must be updated to load spritesheets from manifest-driven key list instead of hardcoded individual PNGs.
- **`GymScene.ts`** must be updated to create Phaser animation objects at scene init from manifest data (frame count, fps, key). Equipment positioning may need adjustment for new sprite dimensions.
- **`NpcSprite.ts`** must be updated to use the new NPC spritesheet key and play an animation instead of displaying a static (currently missing) image.
- The sprite gallery is a **dev-only Phaser scene** (`GalleryScene`) registered under `/gym-sprites`. It is excluded from the production build via an env guard.
- The gallery renders all sprites in a grid, plays each animation, and labels each with its manifest name.
- Static prop sprites (posters, mirrors, water cooler, etc.) are non-animated single-frame entries in the manifest — same pipeline, just `frameCount: 1`.
- Recraft API calls are authenticated via an existing subscription key stored in `.env` (not committed). The subscription is already active.
- New dependency: `sharp` for perceptual hash comparison.
- No changes to NPC dialog, interaction, or relationship systems.
- No backend or database changes — sprites are static files served by Vite, no new routes or schema needed.

## Testing Decisions

- Good tests verify behavior through public interfaces, not implementation details.
- **Generation script** — unit test: given a mocked Recraft HTTP response, assert the script writes output PNGs to the correct paths with correct dimensions. Mock at the HTTP boundary (not internal helpers).
- **Manifest validation** — unit test: given a manifest entry and a generated PNG, assert dimension check and perceptual hash comparison produce correct pass/fail results.
- **Animation config** — unit test: for each manifest entry with `frameCount > 1`, assert the derived Phaser animation config has a valid key, correct frameCount, and fps > 0.
- **Canvas walkthrough** — functional: NPCs animate on idle, equipment animates when "in use", floor tiles tile correctly. Human-verified via browser walkthrough.
- **Sprite gallery** — visual human review: open `/gym-sprites`, confirm all sprites render, animations play, nothing looks out of place.
- Prior art: look at existing Vitest tests in `tests/` for API mocking patterns.

## Out of Scope

- Adding new equipment types (only replacing the existing 25 + floor tile + NPC sprites)
- 3D assets or any non-2D format
- Runtime / on-demand sprite generation in the browser
- Changes to NPC behavior, dialog, or relationship systems
- Mobile-specific canvas scaling or responsive canvas layout
- Sound effects or audio assets

## Further Notes

- The Recraft subscription is already active — no new accounts needed.
- The style reference is established through iterative human review of a single simple sprite (e.g. a dumbbell). Multiple candidates are generated and the prompt is refined until the style, palette, and feel are approved. Only then does bulk generation begin. This prevents generating 25+ sprites in a style that turns out to be wrong.
- `worker.png` is currently missing and NPCs are currently broken in the canvas — the NPC slice is the highest-impact fix.
- Existing `anim-*.png` files can serve as style inspiration for writing Recraft prompts but are replaced by the new pipeline output.
- The `sharp` package is the only new runtime dependency; Recraft calls use native `fetch` (Node 18+).
