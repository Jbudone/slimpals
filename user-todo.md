# User TODO

Personal todo list for maybejosh. Sections below are grouped by topic — currently just Art.

## Art — Gym Pixel Art

Hand-drawn pixel art needed for the gym redesign. Style reference: `public/assets/gym/weights_dumbbells.png` (approved — match its palette/style).

**Status: 9/66 done.** Draw at whatever native size is comfortable — run `npm run check-assets -- --fix` after dropping files in and it'll nearest-neighbor resize them to spec. Run `npm run check-assets` any time to see live progress.

### Spec (applies to everything below)

- **Resolution:** the game renders tiles at 32px, but source art is drawn at **3×** (96×96) so `check-assets --fix`'s nearest-neighbor downscale stays crisp. Keep shapes chunky and blocky — detail that only reads at 96px will turn to mush at 32px.
- **Aspect ratio:** static props and tiles are square (96×96, 1:1). Animated equipment is a horizontal strip of square frames — e.g. 4 frames = 384×96 (4:1 overall), each frame still 1:1. Portraits are square (128×128, 1:1).
- **Colour palette** (sampled from the approved reference, `weights_dumbbells.png`):
  - Base/neutrals: cream `#f0f0e0`, warm white `#f0f0f0`, warm tan `#e0d0b0`, sand `#f0d0a0`
  - Metal/grey (frames, racks, machinery): warm grey `#a0a090`, `#b0b0a0`
  - Accent — rust/orange (upholstery, logos, highlights, neon sign, motivational typography): `#c06020`, `#a03000`, `#f09040`
  - Keep it warm and desaturated overall. Cooler or saturated colors (blue water jug, juice-bar fruit) are fine as small functional accents, not dominant fields.
- **Style:** chunky simple shapes, flat cel-shaded fills (1–2 shade steps), dark outline, no gradients/anti-aliasing/blur.

### Structure (6)
- [ ] `floor-tile.png` — rubber gym floor, subtle grid lines, warm earthy tones, seamless tileable
- [ ] `wall-tile.png` — concrete wall panel with motivational stripe, warm palette, seamless tileable
- [ ] `wall-horizontal.png` — horizontal wall segment, matches wall-tile, tileable left-right
- [ ] `wall-vertical.png` — vertical wall segment, matches wall-tile, tileable top-bottom
- [ ] `wall-corner.png` — wall corner piece joining horizontal + vertical segments
- [ ] `gym-door.png` — entrance door, matches wall style, clearly readable as an entrance

### UI (1)
- [ ] `equipment-locked.png` — padlock-style overlay icon for locked equipment

### Equipment (9)
- [ ] `cardio_treadmill.png` — **4 frames, 8fps (384×96)** — treadmill, black belt, metal frame, control panel
- [ ] `cardio_rowing.png` — **4 frames, 8fps (384×96)** — rowing machine, metal rail, sliding seat, chain handle
- [ ] `cardio_bikes.png` — **4 frames, 8fps (384×96)** — stationary bike, flywheel, padded seat, handlebars
- [ ] `cardio_stairs.png` — **4 frames, 8fps (384×96)** — stair climber, two pedals, tall frame
- [ ] `cardio_cinema.png` — **4 frames, 8fps (384×96)** — treadmill with mounted screen showing nature scene
- [ ] `weights_barbell.png` — bench press station, flat bench, barbell + plates, j-hooks
- [ ] `weights_cable.png` — cable crossover machine, tall frame, pulleys, weight stacks both sides
- [ ] `weights_smith.png` — Smith machine, guided barbell on vertical rails, plates
- [ ] `weights_olympic.png` — Olympic lifting platform, rubber mat with centre markings, barbell

### Amenity (5)
- [ ] `amenity_water.png` — water cooler, blue jug on top, drip tray
- [ ] `amenity_lockers.png` — row of lockers, combination locks, bench in front
- [ ] `amenity_showers.png` — shower room entrance, tiled doorway, showerhead visible
- [ ] `amenity_sauna.png` — wooden sauna entrance, cedar panels, small window with steam
- [ ] `amenity_juice.png` — juice bar counter, blender, protein shake bottles, fruit

### Decor (5)
- [ ] `decor_posters.png` — motivational poster, bold "STRONGER" typography
- [ ] `decor_plants.png` — large potted plant, leafy green, terracotta pot
- [ ] `decor_mirrors.png` — large wall mirror, chrome frame, reflective surface
- [ ] `decor_trophy.png` — glass trophy case, gold trophies + medals inside
- [ ] `decor_neon.png` — glowing neon "GYM" sign, orange/red

### Staff areas (5)
- [ ] `staff_reception.png` — reception desk, computer monitor, tidy surface
- [ ] `staff_trainer.png` — trainer corner, clipboard board on wall, small desk
- [ ] `staff_massage.png` — massage table, white linen
- [ ] `staff_physio.png` — physio table, resistance bands, foam roller
- [ ] `staff_nutrition.png` — nutrition desk, supplement bottles, food charts on wall

### NPC sprites (2)
- [ ] `sprites/worker.png` — construction worker, yellow hard hat, orange overalls
- [ ] `sprites/worker-cheer.png` — same worker celebrating, arms raised (upgrade ceremonies)

**Animation & direction spec for NPCs.** The goal is **real drawn animation** wherever it's worth the frames — walking should actually walk, not just rock. Today `NpcSprite.ts` renders NPCs as a single static 96×96 image and fakes motion with tweens (a rocking angle while moving, a bob while active); that tween approach isn't going away — it becomes the **fallback** the game uses automatically for any character/action that doesn't have real animation frames yet, so nothing is ever blocked on art and nothing regresses. Once art exists for a given key, the code should prefer it over the tween fallback.

- **Base pose (required, static):** every character still needs exactly one 96×96 base pose, facing the camera (front / three-quarter view, matching the 8 already-completed named NPCs). This is the idle frame and the fallback frame the rocking/bob tweens animate when no walk-cycle art exists yet.
- **Walk-cycle (the priority — real animation, not a tween):** a short horizontal-strip spritesheet, **same storage convention as the animated equipment above** — N square frames of 96×96 laid side-by-side into one PNG. Recommended spec: **4 frames, 8fps (384×96)**, matching the cardio-equipment convention already in the manifest. Single facing direction only (whichever way the base pose already faces) — reused via the existing code-side horizontal flip for leftward movement, and reused as-is for up/down travel, same as the base pose today. This deliberately does *not* add 4-directional art (still out of scope per `docs/prd-gym-pixel-art-redesign.md` — that's about facing sets, a separate concern from having a walk cycle at all).
- **Using equipment:** still a bob/tilt tween by default; the equipment itself carries the mechanical animation (spinning wheels, moving belts — see Equipment above). Per-NPC-per-machine exercise poses are a separate, already-scoped follow-up (below) — not part of the walk-cycle work.
- **Triggered full-pose swaps:** unchanged — `worker` → `worker-cheer` is a full alternate pose swapped by code for a specific event (upgrade ceremony), not an animation strip. Follow this pattern for any new one-off triggered pose.
- **Where this gets specified in `shared/gym-sprite-manifest.json`:** a walk-cycle is its **own manifest entry**, alongside the character's existing base-pose entry (it doesn't replace it). Key = base key + `_walk` suffix (e.g. base `npc_trainer_marcus` → walk `npc_trainer_marcus_walk`), `filename` under `sprites/`, `category: "npc"`, `frameWidth: 96`, `frameHeight: 96`, `frameCount: 4`, `fps: 8`, and a `description` of the walk cycle. This follows the exact same pattern as any multi-frame equipment entry — no new manifest fields or schema changes needed, `check-assets`/`PreloadScene`/animation-derivation all already work generically off `frameCount > 1`.
- **Not added to the manifest yet** — these entries get created (and this checklist updated with real filenames) once the code side lands: `NpcSprite.sprite` needs to become a `Sprite` (from `Image`) so it can actually play a spritesheet animation, plus a small check at load time — if the `_walk` texture key wasn't loaded (missing/placeholder), keep using the tween fallback instead of playing a broken/placeholder animation. That code work is queued as follow-up, not blocking this doc update.
- **Exercise pose art (separate, already scoped):** the PRD's per-(NPC, equipment) pose system — manifest entries keyed `npc_<npcKey>_<equipmentKey>` (e.g. `npc_trainer_marcus_cardio_treadmill`) — follows the same "real art preferred, tween fallback otherwise" principle, and can itself use `frameCount > 1` if a specific exercise pose is animated rather than static. Still don't draw these speculatively — added once a specific NPC/equipment pairing is chosen.

### Portraits — 128×128 (24)
Each NPC needs 3 expressions: neutral, happy (smiling), determined (focused). Head-and-shoulders, square crop.

- [ ] `portraits/trainer_marcus.png` / `_happy` / `_determined` — Marcus, muscular male trainer
- [ ] `portraits/receptionist_lisa.png` / `_happy` / `_determined` — Lisa, friendly female receptionist
- [ ] `portraits/regular_derek.png` / `_happy` / `_determined` — Derek, serious male powerlifter
- [ ] `portraits/regular_priya.png` / `_happy` / `_determined` — Priya, calm female yoga enthusiast
- [ ] `portraits/regular_tom.png` / `_happy` / `_determined` — Tom, enthusiastic male gym bro
- [ ] `portraits/regular_elena.png` / `_happy` / `_determined` — Elena, gym regular
- [ ] `portraits/specialist_coach.png` / `_happy` / `_determined` — sports coach, authoritative male
- [ ] `portraits/specialist_nutritionist.png` / `_happy` / `_determined` — nutritionist, caring female

---
All paths are relative to `public/assets/gym/`. Full spec (exact key names, categories) lives in `shared/gym-sprite-manifest.json` — this doc is a drawing checklist, not the source of truth.
