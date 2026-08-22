# Gym Pixel Art — Asset TODO

Hand-drawn pixel art needed for the gym redesign. Style reference: `public/assets/gym/weights_dumbbells.png` (approved — match its palette/style).

**Status: 9/66 done.** Draw at whatever native size is comfortable — run `npm run check-assets -- --fix` after dropping files in and it'll nearest-neighbor resize them to spec. Run `npm run check-assets` any time to see live progress.

All static sprites are **96×96**. Animated sprites are a horizontal strip: **(96 × frame count)×96**, listed below. Portraits are **128×128**.

## Structure (6)
- [ ] `floor-tile.png` — rubber gym floor, subtle grid lines, warm earthy tones, seamless tileable
- [ ] `wall-tile.png` — concrete wall panel with motivational stripe, warm palette, seamless tileable
- [ ] `wall-horizontal.png` — horizontal wall segment, matches wall-tile, tileable left-right
- [ ] `wall-vertical.png` — vertical wall segment, matches wall-tile, tileable top-bottom
- [ ] `wall-corner.png` — wall corner piece joining horizontal + vertical segments
- [ ] `gym-door.png` — entrance door, matches wall style, clearly readable as an entrance

## UI (1)
- [ ] `equipment-locked.png` — padlock-style overlay icon for locked equipment

## Equipment (9)
- [ ] `cardio_treadmill.png` — **4 frames, 8fps (384×96)** — treadmill, black belt, metal frame, control panel
- [ ] `cardio_rowing.png` — **4 frames, 8fps (384×96)** — rowing machine, metal rail, sliding seat, chain handle
- [ ] `cardio_bikes.png` — **4 frames, 8fps (384×96)** — stationary bike, flywheel, padded seat, handlebars
- [ ] `cardio_stairs.png` — **4 frames, 8fps (384×96)** — stair climber, two pedals, tall frame
- [ ] `cardio_cinema.png` — **4 frames, 8fps (384×96)** — treadmill with mounted screen showing nature scene
- [ ] `weights_barbell.png` — bench press station, flat bench, barbell + plates, j-hooks
- [ ] `weights_cable.png` — cable crossover machine, tall frame, pulleys, weight stacks both sides
- [ ] `weights_smith.png` — Smith machine, guided barbell on vertical rails, plates
- [ ] `weights_olympic.png` — Olympic lifting platform, rubber mat with centre markings, barbell

## Amenity (5)
- [ ] `amenity_water.png` — water cooler, blue jug on top, drip tray
- [ ] `amenity_lockers.png` — row of lockers, combination locks, bench in front
- [ ] `amenity_showers.png` — shower room entrance, tiled doorway, showerhead visible
- [ ] `amenity_sauna.png` — wooden sauna entrance, cedar panels, small window with steam
- [ ] `amenity_juice.png` — juice bar counter, blender, protein shake bottles, fruit

## Decor (5)
- [ ] `decor_posters.png` — motivational poster, bold "STRONGER" typography
- [ ] `decor_plants.png` — large potted plant, leafy green, terracotta pot
- [ ] `decor_mirrors.png` — large wall mirror, chrome frame, reflective surface
- [ ] `decor_trophy.png` — glass trophy case, gold trophies + medals inside
- [ ] `decor_neon.png` — glowing neon "GYM" sign, orange/red

## Staff areas (5)
- [ ] `staff_reception.png` — reception desk, computer monitor, tidy surface
- [ ] `staff_trainer.png` — trainer corner, clipboard board on wall, small desk
- [ ] `staff_massage.png` — massage table, white linen
- [ ] `staff_physio.png` — physio table, resistance bands, foam roller
- [ ] `staff_nutrition.png` — nutrition desk, supplement bottles, food charts on wall

## NPC sprites (2)
- [ ] `sprites/worker.png` — construction worker, yellow hard hat, orange overalls
- [ ] `sprites/worker-cheer.png` — same worker celebrating, arms raised (upgrade ceremonies)

## Portraits — 128×128 (24)
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
