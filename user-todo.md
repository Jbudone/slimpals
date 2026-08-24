# User TODO

Personal todo list for maybejosh. Sections below are grouped by topic — currently just Art.

## Art — Gym Pixel Art

Hand-drawn pixel art needed for the gym redesign. Style reference: `public/assets/gym/weights_dumbbells.png` (approved — match its palette/style).

**Status: 10/74 done.** Draw at whatever native size is comfortable — run `npm run check-assets -- --fix` after dropping files in and it'll nearest-neighbor resize them to spec. Run `npm run check-assets` any time to see live progress.

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

### NPC sprites — 9 characters, one entry per animation
Each character in `shared/gym-sprite-manifest.json`'s `npcs` map is a set of named animations (`idle`, `walk`, `cheer`, and later per-equipment exercise poses), each with a `directions` map (only ever `"default"` today — no 4-directional art, see the spec below). `NpcSprite.ts` prefers real art per-animation the moment it's drawn; the rock/bob tween stays as the automatic fallback for anything not yet drawn, so nothing is ever blocked and nothing regresses.

- [ ] `sprites/worker.png` — construction worker, yellow hard hat, orange overalls (`worker`'s `idle` animation)
- [x] `sprites/worker-cheer.gif` — same worker celebrating, arms raised — `worker`'s `cheer` animation, swapped in by code during the upgrade-ceremony bounce (done — a single-frame gif works fine here, no conversion needed)

**Animation spec:**
- **`idle` (required, static):** exactly one 96×96 base pose per character, facing the camera. Also the frame the fallback tweens animate when no walk-cycle exists yet.
- **`walk` (priority — real animation, not a tween):** 4 frames, 8fps, 384×96 horizontal strip (or a plain animated GIF — see File format below). Single facing direction only, reused via code-side flip for leftward movement and as-is for up/down travel — this deliberately does *not* add 4-directional art (still out of scope per `docs/prd-gym-pixel-art-redesign.md`).
- **`cheer` / other triggered poses:** a full alternate static pose, swapped in by code for a specific event. `worker`'s `cheer` above is the pattern for any future one-off triggered pose.
- **Exercise poses (separate, already scoped):** per-(NPC, equipment) poses, named by the equipment key as the animation name (e.g. an animation called `cardio_treadmill` under `trainer_marcus`) — same "real art preferred, tween fallback otherwise" rule, can itself be a multi-frame animation. Don't draw these speculatively — add an entry once a specific NPC/equipment pairing is chosen.
- **File format — pick whichever's easier per animation:**
  - **Spritesheet PNG** — `"type": "spritesheet"`, declare `frameWidth`/`frameHeight`/`frameCount`/`fps` (and `offsetX`/`offsetY` if the sheet isn't cropped tight to frame 0).
  - **Animated GIF** — `"type": "gif"`, same frame fields as a target spec. Just drop the gif in and run `npm run check-assets -- --fix` — it converts to the spritesheet PNG automatically (resampling frames if the gif's frame count doesn't match what you declared).
  - **Single static image** — `"type": "static"`, just a `file` (png or gif both fine, e.g. `worker-cheer.gif` above).

### NPC walk-cycles (8) — add a `walk` animation with one of these files
- [ ] `sprites/npc_trainer_marcus_walk.png` — **4 frames, 8fps (384×96)** — Marcus walk cycle, matches his idle pose
- [ ] `sprites/npc_receptionist_lisa_walk.png` — **4 frames, 8fps (384×96)** — Lisa walk cycle, matches her idle pose
- [ ] `sprites/npc_regular_derek_walk.png` — **4 frames, 8fps (384×96)** — Derek walk cycle, matches his idle pose
- [ ] `sprites/npc_regular_priya_walk.png` — **4 frames, 8fps (384×96)** — Priya walk cycle, matches her idle pose
- [ ] `sprites/npc_regular_tom_walk.png` — **4 frames, 8fps (384×96)** — Tom walk cycle, matches his idle pose
- [ ] `sprites/npc_regular_elena_walk.png` — **4 frames, 8fps (384×96)** — Elena walk cycle, matches her idle pose
- [ ] `sprites/npc_specialist_coach_walk.png` — **4 frames, 8fps (384×96)** — Coach walk cycle, matches his idle pose
- [ ] `sprites/npc_specialist_nutritionist_walk.png` — **4 frames, 8fps (384×96)** — Nutritionist walk cycle, matches her idle pose

`worker`'s walk-cycle isn't listed yet since its `idle` base pose isn't drawn — add a `walk` animation entry for it once `worker.png` exists.

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
All paths are relative to `public/assets/gym/`. Full spec lives in `shared/gym-sprite-manifest.json` — the flat `sprites[]` list for props/tiles/equipment, and the nested `npcs{}` map (character → animation → direction → file) for characters — this doc is a drawing checklist, not the source of truth.
