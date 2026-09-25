# Slice 1 — The loot run

The first deliverable we can build, deploy and playtest. It's part of the
[road to version 1](EPIC.md), builds on the systems in [DESIGN.md](DESIGN.md),
and tackles the early risks in [CHALLENGES.md](CHALLENGES.md).

## Goal

The player spawns at dusk near a hamlet, tired, hungry and thirsty. They loot
houses in real time against a few shamblers, manage what they carry and where,
eat and drink, survive the night (sleeping in compressed time if they dare),
save, and continue the next day.

## Playtest questions

1. **Looting:** is looting a house tense and fun when each item move takes real
   seconds while the world keeps moving?
2. **Pockets:** does choosing which pocket to use matter? Do players notice
   and use handling time?
3. **Scale:** does 0.5 m feel right for doors, stairs, interiors and
   furniture?
4. **Compressed sleep:** is sleeping in compressed time readable? Is the
   interruption clear and fair?
5. **Threat:** are a few dumb shamblers enough threat to make questions 1 and 4
   meaningful?
6. **Dread:** is the first night frightening? What scared players, and did it
   come from the dark and from sounds rather than from something that looked
   scripted?

## What a playtester does

1. Opens the Pages link, reads the controls card and clicks Play. It's dusk.
   The status panel says they're hungry, thirsty and tired.
2. Walks down a short asphalt road with 5 buildings on it. Two shamblers wander
   between the houses.
3. Enters a house (opening the door takes a moment) and searches the kitchen
   cupboards. Pulls cans and a bottle into their jeans and hoodie pockets.
   Finds a backpack, puts it on, and moves things into it.
4. While they're in the inventory screen, a shambler bangs into the door they
   left open. They drop what they were holding, grab a crowbar from the pile on
   the floor, and fight it off.
5. Drinks, eats, and turns on a flashlight. Night is dark. Something shuffles
   outside, closer than they'd like; they can't see it, and switch the
   flashlight off.
6. Closes the door, lies down on a bed and sleeps. The clock spins. At 03:40
   they're woken ("You hear something outside"), deal with it, and go back to
   sleep.
7. Closes the tab. Comes back later, clicks Continue, and it's the next
   morning.
8. Dies eventually. The death screen shows survival time and what they looted,
   then starts a new world.

## Scope

### In

- The scale measurement, and the switch to metre units with 0.5 m blocks.
- The simulation core:
  - game clock and day/night cycle
  - fixed-step scheduler, compression controller, pause
  - seeded random streams, event queue, entity store
- Content v2: Valibot schemas for blocks, items, furniture, loot tables,
  templates and zombie types, with a validator that checks cross-references.
- Items:
  - item instances, components and pockets
  - worn items and hands
  - piles on the ground
  - handling time and an action queue
- The inventory screen (two panes, drag and drop, keyboard) and a quickbar.
- Block entities: containers and doors. A block entity can span several cells.
- A hamlet near spawn: 5 building templates, flattened lots, loot tables, and a
  search action.
- Needs (calories, hydration, fatigue, stamina) and health as a single pool.
  Eating and drinking. Death and a new run.
- A flashlight that uses battery charge.
- Shamblers: perception (sight and player noise), chase with step-up and jump,
  melee in both directions, and simple box-figure rendering.
- Rest and sleep as a long action with compression and interruptions.
- Basic sound: positional footsteps, doors, shamblers and night ambience.
- Saves: one slot, OPFS with IndexedDB fallback, autosave, Continue, a save
  version, and a golden-save test.
- A playtest build: debug overlay, local session metrics with JSON export, and
  a controls card.

### Out (and which slice has it)

| Feature | Slice |
| --- | --- |
| Crafting, disassembly, repair, skills, books | 2 |
| Body parts and wounds, firearms, noise from walls (and sound muffled by walls), other zombie types, hordes | 3 |
| Region map, towns, far terrain, voxel light (dark interiors), the night sky (moon, stars, overcast), temperature and weather, the dystopian dressing and the radio broadcast | 4 |
| Construction, locks, bashing doors, electricity, fire | 5 |
| Vehicles | 6 |

Also out:

- **Block shapes** beyond full cubes. Stairs are made of full blocks: with
  0.5 m blocks, each step is one block and the player steps up it
  automatically.
- **Glass and transparent blocks.** Windows are openings with a frame.

## Milestones

Each milestone is one or two PRs, and each is merged and deployed to Pages
with CI green.

### 1.0 Scale measurement

Build a test scene in code: the terrain, plus a two-room house with a door,
stairs, a kitchen counter, a bed and a table. Render it at 1 m and at 0.5 m by
switching one constant, and measure:

| Metric | Details |
| --- | --- |
| Frame time | At 64, 96 and 128 m view radius, on the [reference laptop](DESIGN.md#reference-hardware) and on a desktop |
| Meshing | Time per chunk (median and p95); triangles per chunk |
| Memory | Stored chunks and memory for each radius, with and without the uniform-chunk trick |
| Walking | Whether meshing keeps up when walking and sprinting |
| Feel | Doorways, stairs, furniture and interiors, compared with screenshots |

**Done when:** the results and the decision are written into this file (under
"Results" below), together with the reference laptop's exact CPU model,
browser and browser version. The default is 0.5 m unless the numbers rule it
out.

The outcome also sets **the frame budget** that later milestones must hold: the
chosen block size and view radius run at 60 fps (16.7 ms a frame) on the
reference laptop, with meshing keeping up at sprint speed. This is the Slice 1
version of EPIC.md's 60 fps quality criterion.

#### Running it

During milestone 1.0 the block size was a URL parameter, so one build covered
both scales. After the decision the game always uses 0.5 m blocks; the
benchmark can still compare sizes, for example with `?bench=1&plan=1:96,0.5:96`.

- **Feel:** open the game with `?block=0.5` and with `?block=1`. The test house
  stands in front of the spawn point. Walk through the door, look at the
  counter, table and bed, and climb the stairs to the roof. With 0.5 m blocks
  you walk up the stairs; with 1 m blocks every step needs a jump.
- **Numbers:** open `?bench=1` on the reference laptop, in a maximised window,
  and leave the tab visible. In 1.0 it ran six configurations (both block
  sizes); it now runs 0.5 m blocks at 64, 96 and 128 m by default, reloading
  the page between runs, and takes about 3 minutes. Each run loads
  the world around spawn, turns the camera once around for 12 s, then flies
  away across the terrain for 15 s at jog speed and 15 s at sprint speed. The
  report page at the end has a table and a **Copy Markdown** button. Paste the
  table here, together with the CPU model and browser version.

What the benchmark can and can't tell us:

- Frame times are the time between animation frames, which the browser caps at
  the display's refresh rate. They show whether 60 fps holds, not how much
  headroom there is above it. The GPU's own time isn't measured separately.
- "Holes" are columns within one chunk of the view radius that aren't meshed
  yet. They show whether streaming keeps up with the player.
- Memory is calculated from the chunks in the world for the three layouts in
  [CHALLENGES.md](CHALLENGES.md#1-half-metre-blocks). Only the full layout is
  implemented today.
- Terrain is still generated on the main thread, 2 columns per frame. Holes at
  sprint speed with 0.5 m blocks would point at that limit rather than at
  meshing.

### 1.1 Metres and half-metre blocks

Milestone 1.0 already moved the player, physics, terrain and world height to
metres, and added step-up and a 1.1 m jump. What's left, plus what the
measurement found:

- The block size becomes a fixed constant, `BLOCK_SIZE = 0.5`. The benchmark
  keeps its own setting so it can still compare sizes.
- **Stop drawing the underside of the world.** The mesher treats what's below
  the bottom chunk layer as air, so every bottom chunk draws a 32 × 32 layer of
  faces nobody can see. That's about half of the non-empty chunk meshes (see
  Results). Treat below the world as solid.
- Uniform chunks are stored as a single value. Chunk data that hasn't been
  edited is dropped when it goes far out of range, and regenerated from the seed
  when needed. Today every generated chunk stays in memory for the whole
  session.
- Greedy meshing, with per-block colour variation moved into the fragment
  shader.
- A walk speed of 1.8 m/s alongside jog and sprint.
- The benchmark also records **work time per frame**: the milliseconds spent
  in streaming, simulation and the render call. Frame times stop at the
  display's refresh rate; work time shows how much of the 16.7 ms is used.
- Tests: greedy meshing gives the same visible surface as face culling
  (property test), storage round-trips for uniform chunks, no faces below the
  world.

**Done when:** a new benchmark run on the reference laptop meets the frame
budget from 1.0, and the Results below are updated.

**Status:** done. The first benchmark run missed the frame budget (see
Results, "1.1 first run"); after the fix, the run on the reference laptop meets
it at every radius (Results, "1.1 final run").
The walk toggle is on Z (Ctrl would collide with browser shortcuts such as
Ctrl+W).

### 1.2 Simulation core

- The game clock with ratio `r` (start at 1:8), sun position and sky colour,
  and fog by time of day.
- A fixed-step scheduler: systems register a tick rate, and the scheduler
  handles compression by growing the steps of slow systems.
- A compression controller: ramps `c` up and down, checks whether it's safe,
  and handles interruptions (tested here with a debug key, before real long
  actions exist).
- Esc pauses. Seeded random streams per system. An event queue. An
  `EntityStore` interface.

**Done when:** scenario tests show that a compressed hour and an uncompressed
hour give the same needs and clock state, within tolerance.

**Status:** implemented. The scenario test (`test/sim.test.ts`) runs an hour at
1× (27,000 frames) and compressed (about 960 frames): the clocks match, and needs
may differ by at most one grown needs step (4 game minutes). Other tests show an
interruption stops the simulation at the tick that raised it, compression is
refused while unsafe, and a frame at 30× costs at most one needs tick. Needs
only have their rates so far (the rest is 1.6). In the game, `?debug=1` gives
keys to compress time, interrupt it and make it unsafe (see PROJECT.md). The
night look is a first guess, to be tuned with the flashlight in 1.6.

### 1.3 Content v2

- Valibot schemas for all Slice 1 content. TypeScript types are inferred from
  the schemas.
- The validator checks cross-references: loot entries, template palettes,
  furniture loot and zombie loot all point at ids that exist.
- The base pack is rewritten in the new format.

**Done when:** `npm run validate` covers every content kind, and a broken
reference in a fixture fails CI.

### 1.4 Items and inventory

- Item instances, stacks, and the `container` (pockets), `wearable`, `food`,
  `tool`, `weapon`, `light` and `battery` components.
- The player: two hands and worn slots (head, torso, legs, back, waist).
  Carrying weight slows you down.
- Piles: dropping, picking up and rendering.
- The handling-time action queue. Handling stops sprinting and halves walking
  speed.
- The inventory screen:
  - two panes (you, and around you)
  - pockets as nested rows
  - drag and drop, and keyboard moves
  - handling time and the limits of each pocket shown on every row
  - take all of a category
- A quickbar with 5 slots.

**Done when:** scenario tests cover pocket limits (volume, weight, length),
handling times, stacking, and nesting (a backpack inside a duffel bag is
refused if it doesn't fit).

### 1.5 The hamlet

- Block entities: containers (cupboard, fridge, wardrobe, desk, shelf, crate)
  and doors (2 × 4 cells, open and closed, with handling time to open and
  close).
- The template format (ASCII layers) and 5 templates: small house, bungalow,
  gas station, corner store and shed.
- The hamlet is placed near spawn: a road, lots whose terrain is flattened, and
  the buildings. Loot is rolled per container from its loot table when the
  chunk generates.
- Searching a container you haven't opened takes a moment before its contents
  show.

**Done when:** the hamlet generates the same in any chunk order (property
test), and every template passes the validator.

### 1.6 Survival

- Needs: calories, hydration, fatigue and stamina, with rates per game hour.
  The spawn state is deliberately low on all of them, so they matter within a
  45-minute session.
- Health as a single pool, with regeneration while needs are met. Eating and
  drinking are short actions.
- The flashlight uses battery charge. Swapping batteries is handling.
- Death: a screen with the time survived and a looting summary, then a new
  world.

**Done when:** scenario tests cover need rates, catch-up of needs and food
decay (compared against live ticking), and death.

### 1.7 Shamblers

- Zombie types are data. Slice 1 has only the shambler: slow when wandering,
  shuffling when chasing, and it can't open doors.
- Perception: a sight cone with a ray cast, reduced at night, plus hearing
  player footstep noise (more when sprinting).
- Movement: steering, with step-up and a jump when blocked, using the same body
  physics as the player. A lost shambler wanders back.
- Melee in both directions: the zombie attack has reach and a cooldown; the
  player swings the wielded item (or fists) with a hit check.
- Rendering: instanced box figures with a two-frame shuffle.
- Spawning: markers in templates, plus a few wanderers. They don't respawn in
  Slice 1.

**Done when:** scenario tests show a shambler reaches the player through an
open door, not through a closed one, and loses the player after losing sight
of them.

### 1.8 Rest and sleep

- Rest (anywhere) and sleep (better on a bed) as long actions. They use the
  compression controller from 1.2.
- Interruptions: a shambler becomes aware of you or comes within 30 m, you take
  damage, or a need becomes critical. The game asks *Continue* or *Stop*.
- The screen shows the clock spinning, a progress bar, and an edge effect.

**Done when:** a scenario test shows the interruption comes at most one step
late, and playtests confirm players understand why they were woken.

### 1.9 Saves

- One slot. OPFS, with an IndexedDB fallback. `navigator.storage.persist()`.
- What's saved: metadata (version, packs, seed, clock), the player (stats,
  inventory tree), chunk diffs (string palette plus run-length encoding), block
  entities, piles and zombies.
- Autosave every 2 game hours, on `visibilitychange`, and before sleeping. The
  title screen offers Continue or New world.
- A golden save committed as a test fixture, loaded in CI.

**Done when:** save → reload → identical state (a state hash in a scenario
test), and the golden save loads.

### 1.10 Sound

- Web Audio, started by the Play click (browsers block sound until the first
  click).
- Positional sounds with distance falloff. Walls don't muffle them yet; that
  comes with the noise system in Slice 3.
- The player: footsteps by surface and speed, doors, eating and drinking, the
  flashlight switch, and heavy breathing when stamina is low.
- Shamblers: shuffling, groans, hits, and bumping into doors. At night they're
  heard beyond the 10 m they can be seen, so sound comes first.
- Ambience: wind, quieter at night. No music during play.
- Sounds are content: ids in the base pack, checked by the validator.

**Done when:** the validator fails on a missing sound id or file, and a
scenario test shows every noise event (footsteps, doors, fights) also emits a
sound event with its position.

### 1.11 Playtest build

- A debug overlay (F3):
  - frame time broken down into simulation, render and meshing queue
  - chunk, entity and memory counts
  - clock and compression
- A debug panel (`?debug=1`): spawn items, set the time, and reveal zombies.
- Session metrics, kept locally:
  - real seconds per container looted, split into handling time and UI time
  - deaths and their causes
  - time spent compressed, interruptions, and use of each pocket

  They export as JSON; nothing is sent anywhere.
- A controls card, and a "Send feedback" link to a GitHub issue template.

**Done when:** a playtester can play a full session and send back the metrics
file and their notes.

## Data format sketches

These are illustrative. The Valibot schemas in 1.3 are the real definitions.

An item with pockets:

```json
{
  "id": "hiking_backpack",
  "name": "Hiking backpack",
  "weight": 1400,
  "volume": 3000,
  "length": 600,
  "wearable": { "slot": "back", "encumbrance": 12 },
  "container": {
    "pockets": [
      { "name": "main", "volume": 35000, "weight": 30000, "length": 700, "rigid": false, "handling": 1.5 },
      { "name": "lid", "volume": 2000, "weight": 3000, "length": 250, "rigid": false, "handling": 1.0 }
    ]
  }
}
```

Furniture that contains items:

```json
{ "id": "kitchen_cupboard", "name": "Kitchen cupboard", "size": [2, 2, 1], "color": "#8a6a48",
  "container": { "pockets": [{ "volume": 60000, "weight": 50000, "length": 900, "rigid": true, "handling": 1.0 }] },
  "loot": "kitchen_cupboard" }
```

A loot table (`rolls` and `count` are inclusive ranges):

```json
{ "id": "kitchen_cupboard", "rolls": [1, 4], "entries": [
  { "item": "canned_beans", "weight": 5, "count": [1, 2] },
  { "table": "kitchen_tools", "weight": 2 },
  { "nothing": true, "weight": 3 }
] }
```

A template: layers from the bottom up; each layer is rows along z of
characters along x. Only the first two of the shed's six layers are shown.

```json
{ "id": "shed", "size": [8, 6, 6],
  "palette": { "=": "concrete", "#": "planks", ".": "air",
               "D": { "door": "wood_door" }, "C": { "furniture": "crate", "loot": "shed_tools" },
               "z": { "spawn": "shambler", "chance": 0.3 } },
  "layers": [
    ["========", "========", "========", "========", "========", "========"],
    ["###DD###", "#......#", "#.z....#", "#......#", "#....CC#", "########"]
  ] }
```

A zombie type:

```json
{ "id": "shambler", "name": "Shambler", "health": 60, "speed": { "wander": 0.8, "chase": 2.8 },
  "sight": 25, "hearing": 1.0, "attack": { "damage": 8, "reach": 1.2, "cooldown": 1.5 },
  "abilities": [], "loot": "shambler_pockets", "model": "figure_basic" }
```

## Content for Slice 1

| Kind | Count | Examples |
| --- | --- | --- |
| Blocks | about 15 | grass, dirt, stone, sand, asphalt, concrete, planks, brick, plaster, roof tiles, tiles, carpet, window frame |
| Furniture | 8 | cupboard, fridge, wardrobe, desk, shelf, crate, bed, counter |
| Wearables with pockets | 8 | jeans, cargo pants, hoodie, jacket, vest, fanny pack, school backpack, hiking backpack |
| Food and drink | 8 | canned beans, crackers, apple, chocolate, soda, water bottle, juice, canned soup |
| Tools and weapons | 8 | crowbar, hammer, kitchen knife, baseball bat, pipe, flashlight, lighter, can opener |
| Sounds | about 20 | footsteps on grass, asphalt, wood and carpet (walk, jog, sprint); door open and close; shambler shuffle, groan, hit and door bump; flashlight switch; eating; drinking; breathing; wind |
| Other | about 8 | batteries, bandage, painkillers, rag, duct tape, nails, scrap metal, book (inert until Slice 2) |

## Tunables to start from

| Tunable | Start |
| --- | --- |
| Clock ratio `r` | 1:8 (a game day is 3 real hours) |
| Compression cap `c` | 30× |
| Safe radius for compression | 30 m |
| Spawn time and state | 19:30. Calories 40%, hydration 35%, fatigue 70% |
| Handling times | A worn pocket 0.5 s, a backpack 1.5 s, the ground or a container 1.0 s, plus 0.2 s per litre. Opening a door 0.6 s |
| Shambler perception | Sight 25 m by day, 10 m at night (flashlight on: 25 m). Hearing: jogging 8 m, sprinting 15 m |
| Shambler count | 6–10 in the hamlet |

## Playtest plan

- **Who:** at least 3 people, including one who doesn't know CDDA or DayZ.
- **Where:** the Pages build in their own browser, in a 45-minute session.
- **Script:** "Survive until morning. Loot what you think you need." No other
  guidance.
- **Watch for:**
  - how long people spend in the inventory screen
  - whether they pick pockets deliberately
  - their first reaction to an interruption
  - what they do when they hear something they can't see
  - where they get stuck
- **Afterwards:** the 6 playtest questions, plus the most annoying moment and
  the best moment.
- **Collect:** the metrics JSON and the notes. The findings are written back
  into this file and into [DESIGN.md](DESIGN.md) and
  [CHALLENGES.md](CHALLENGES.md) before Slice 2 is planned.

## Definition of done

- Milestones 1.0–1.11 are merged and deployed, and CI is green: Biome, types,
  tests, content validation, golden save.
- The frame budget from 1.0 holds in the hamlet at night with every shambler
  active.
- The playtest has run and its findings are recorded.

## Open questions

- Is a 1:8 clock ratio right? A 45-minute session is only 6 game hours.
- Shamblers don't respawn in Slice 1 (see 1.7). Does a cleared hamlet make the
  second night too safe to test sleep interruptions? If so, add night
  wanderers after the first playtest.
- After death, does a new run in the same world keep the old piles? That's the
  version 1 design, but maybe not in Slice 1.

## Results

### 1.0 Scale measurement (2026-09-25)

**Setup.** The reference laptop: Intel Core i7-1185G7 (4 cores, 8 threads,
3.0 GHz), 32 GB RAM, Intel Iris Xe Graphics (TGL GT2). Firefox 140 on Linux,
which reports the GPU only as "Intel(R) HD Graphics, or similar". The canvas
was 1674 × 972 pixels at pixel ratio 1.2.

| Block | Radius | Load s | Chunks | MiB full / uniform / palette | Mesh ms p50 / p95 | Tris per chunk p50 | Look fps / p95 ms / slow | Draws | Jog p95 ms / slow / holes | Sprint p95 ms / slow / holes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 m | 64 m | 0.5 | 245 | 15.3 / 4.8 / 0.6 | 12.0 / 22.0 | 2048 | 60 / 17.2 / 0% | 26 | 17.2 / 0% / 0 | 17.2 / 0% / 0 |
| 1 m | 96 m | 0.8 | 405 | 25.3 / 7.9 / 1.0 | 12.0 / 20.0 | 2048 | 60 / 17.2 / 0% | 48 | 17.2 / 0% / 0 | 17.2 / 0% / 0 |
| 1 m | 128 m | 1.4 | 605 | 37.8 / 11.6 / 1.4 | 12.0 / 21.0 | 2048 | 60 / 17.2 / 0% | 77 | 17.2 / 0% / 0 | 17.2 / 0% / 0 |
| 0.5 m | 64 m | 2.4 | 968 | 60.5 / 10.6 / 1.3 | 14.0 / 21.0 | 2048 | 60 / 17.2 / 0% | 55 | 17.2 / 0% / 0 | 17.2 / 0% / 0 |
| 0.5 m | 96 m | 4.0 | 1800 | 112.5 / 19.4 / 2.3 | 12.0 / 19.0 | 2048 | 60 / 17.2 / 0% | 119 | 17.2 / 0% / 0 | 17.2 / 0% / 0 |
| 0.5 m | 128 m | 6.9 | 2888 | 180.5 / 31.8 / 3.8 | 15.0 / 28.0 | 2048 | 60 / 17.2 / 0% | 213 | 17.2 / 1% / 0 | 17.3 / 4% / 0 |

**Findings.**

1. **Frame rate:** 60 fps in every configuration, including 0.5 m blocks at
   128 m. Frame times stop at the display's refresh rate, so the only sign of
   strain is slow frames (over 18 ms): 1% while jogging and 4% while sprinting
   at 0.5 m and 128 m, and none anywhere else. How much headroom is left above
   60 fps isn't visible yet (1.1 adds work time per frame).
2. **Streaming keeps up:** no holes in any run, even sprinting at 0.5 m and
   128 m with terrain generated on the main thread. Moving worldgen to workers
   can wait until towns make it more expensive.
3. **Memory:** at the same radius, 0.5 m blocks take about 4.8× the memory of
   1 m blocks when every chunk is stored in full (180 MiB against 38 MiB at
   128 m). Storing uniform chunks as a single value brings 0.5 m at 128 m down
   to 32 MiB; palette packing brings it to 3.8 MiB. The totals are higher than
   the estimate in CHALLENGES.md because terrain is generated one ring beyond
   the view radius (19 × 19 columns × 8 layers = 2,888 chunks at 128 m).
4. **Meshing:** 12–15 ms median and 19–28 ms p95 per chunk in a worker, about
   the same at both block sizes (the work depends on a chunk's blocks, not on
   its size in metres). Firefox rounds timers to whole milliseconds.
5. **Load time:** 4.0 s at 0.5 m and 96 m, 6.9 s at 128 m. Both are within
   version 1's 10 s target.
6. **Wasted geometry.** The median of exactly 2,048 triangles per chunk in
   every run is the underside of the world: each bottom-layer chunk draws a
   32 × 32 layer of downward faces because the mesher treats below the world as
   air. Checked in Node: every bottom-layer chunk has exactly 2,048 triangles,
   while surface chunks have 2,300–3,000. They are about half of all non-empty
   chunk meshes, so a large share of the draw calls in the table are invisible.
   Fixing it is the first item in 1.1, and should make frames cheaper.

**Decision.**

- **Block size: 0.5 m.** The numbers don't rule it out: it holds 60 fps up to
  128 m on the reference laptop.
- **View radius:** 96 m by default, with no slow frames, which leaves room for
  zombies, lighting and UI. 128 m becomes a higher graphics setting.
- **Frame budget** for later milestones: 0.5 m blocks at a 96 m radius run at
  60 fps on the reference laptop in Firefox, with at most 1% slow frames in
  every benchmark phase and no holes at sprint speed.

**Feel test:** 0.5 m blocks feel far better than 1 m: doorways, furniture and
interiors read at a human scale, and stairs are walked instead of jumped.

The decision is final: 0.5 m blocks, a 96 m default view distance, and a view
distance setting (64, 96 or 128 m) for other hardware.

### 1.1 first run (2026-09-25): regression

Same laptop, browser and canvas as the 1.0 run.

| Block | Radius | Load s | Chunks | MiB held / if full / palette | Mesh ms p50 / p95 | Tris per chunk p50 | Look fps / p95 ms / slow | Draws | Jog p95 ms / slow / holes | Sprint p95 ms / slow / holes | Work ms p95 look / jog / sprint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 m | 64 m | 3.2 | 968 | 10.6 / 60.5 / 1.3 | 23.0 / 226.0 | 914 | 60 / 17.1 / 0% | 44 | 33.6 / 11% / 0 | 166.2 / 22% / 8 | 2.0 / 23.0 / 149.0 |
| 0.5 m | 96 m | 6.5 | 1800 | 19.4 / 112.5 / 2.3 | 21.0 / 53.0 | 930 | 52 / 33.5 / 14% | 79 | 33.6 / 6% / 0 | 17.2 / 4% / 0 | 13.0 / 19.0 / 20.0 |
| 0.5 m | 128 m | 7.8 | 2888 | 31.8 / 180.5 / 3.8 | 18.0 / 131.0 | 926 | 60 / 17.2 / 0% | 83 | 17.2 / 1% / 0 | 133.5 / 34% / 20 | 4.0 / 15.0 / 126.0 |

**What improved:** memory held fell to a sixth (19.4 MiB instead of 112.5 at
96 m), and triangles per chunk fell from 2,048 (mostly the world's underside) to
about 930.

**What got worse:** meshing took 21–23 ms median with p95 up to 226 ms (12–15 and
19–28 ms in 1.0), frames slowed while looking around at 96 m (14% slow), and
sprinting at 64 m and 128 m left holes, with main-thread work spiking past
120 ms. The frame budget was not met.

**Diagnosis.**

- Three quarters of all mesh jobs were **enclosed chunks**: solid all through,
  with solid neighbours, so they can't produce a single face. In Node, 200 of
  264 mesh jobs around spawn were like this.
- The greedy mesher **allocated small arrays for every face it examined**,
  including every block of those enclosed chunks. Node's engine hid the cost,
  but Firefox's didn't; garbage-collection pauses explain the p95 of 226 ms.
- The workers were heavily oversubscribed: 4 workers plus the main thread on 4
  physical cores. Busy workers took CPU time from the main thread, and on an
  integrated GPU they also share its power budget, which fits the slow frames
  while looking around.

**Fix.**

1. Enclosed chunks are never sent to a worker.
2. The mesher's inner loop uses index arithmetic into the padded array and
   allocates nothing.
3. The number of workers leaves a physical core for the main thread: 3 on the
   reference laptop (8 logical cores), and 1 on a 4-thread machine.

In Node, the mesh jobs around spawn fell from 264 to 113, and each takes 1.4 ms
(4.4 ms for 1.0's mesher): about 7 times less meshing work than the first 1.1
run. In headless Chromium, meshing went from 5.7 / 14.0 ms (p50 / p95) to 1.5 /
4.8 ms. The frame budget needs a new run on the reference laptop.

### 1.1 final run (2026-09-25)

Same laptop, browser and canvas as the 1.0 run, after the fix above.

| Block | Radius | Load s | Chunks | MiB held / if full / palette | Mesh ms p50 / p95 | Tris per chunk p50 | Look fps / p95 ms / slow | Draws | Jog p95 ms / slow / holes | Sprint p95 ms / slow / holes | Work ms p95 look / jog / sprint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 m | 64 m | 1.0 | 968 | 10.6 / 60.5 / 1.3 | 3.0 / 5.0 | 926 | 60 / 17.2 / 0% | 30 | 17.2 / 0% / 0 | 17.2 / 0% / 0 | 2.0 / 3.0 / 6.0 |
| 0.5 m | 96 m | 1.9 | 1800 | 19.4 / 112.5 / 2.3 | 3.0 / 6.0 | 930 | 60 / 17.2 / 0% | 51 | 17.2 / 0% / 0 | 17.2 / 0% / 0 | 3.0 / 4.0 / 10.0 |
| 0.5 m | 128 m | 3.0 | 2888 | 31.8 / 180.5 / 3.8 | 3.0 / 5.0 | 926 | 60 / 17.2 / 0% | 83 | 17.2 / 0% / 0 | 17.2 / 0% / 0 | 4.0 / 6.0 / 9.0 |

An earlier run the same day gave almost the same numbers (mesh 2.0 / 4–5 ms,
work p95 at 96 m 5 / 6 / 8 ms, no slow frames or holes). Firefox reported 12 CPU
threads in that run and 8 in this one; both give 3 mesh workers, so the
difference doesn't change the setup.

**Findings.**

1. **The frame budget holds:** 60 fps, no slow frames in any phase and no holes
   at sprint speed, at every radius, 128 m included.
2. **Headroom:** at 96 m the main thread's work p95 is 3 ms looking around,
   4 ms jogging and 10 ms sprinting, out of 16.7 ms. Sprinting streams the most
   terrain, which is still generated on the main thread. Work time doesn't
   include the GPU's own time.
3. **Meshing:** 3 ms median and 5–6 ms p95 per chunk, against 21–23 / 53–226 ms
   in the first 1.1 run and 12–15 / 19–28 ms in 1.0. This matches the Node and
   headless Chromium measurements of the fix.
4. **Load time:** 1.9 s at 96 m and 3.0 s at 128 m, half or less of 1.0's 4.0
   and 6.9 s.
5. **Geometry:** 51 draw calls at 96 m (119 in 1.0) and about 930 triangles per
   chunk (2,048 in 1.0). Memory is unchanged from the first 1.1 run: 19.4 MiB
   held at 96 m.

The 96 m default stays: 128 m also meets the budget, and the headroom at 96 m is
what later milestones (the simulation, zombies, lighting) will spend.
