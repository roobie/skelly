# deadvox — design

The core design of the game: what it is, and the systems it's made of. Read it
together with:

- [EPIC.md](EPIC.md): the road to version 1.
- [CHALLENGES.md](CHALLENGES.md): the hard problems and how we plan to tackle them.
- [SLICE-1.md](SLICE-1.md): the first playable deliverable.
- [PROJECT.md](PROJECT.md): the current code, how to run it, and technical decisions.

**Status:** agreed direction. The numbers in this document are starting points to
tune in playtests unless they're marked as decisions.

## The game in one paragraph

You are alone in a quarantined region some weeks after an outbreak. The world is
real-time and open, as in DayZ: you walk, sneak, loot, fight and run, and the
dead never stop wandering. Your survival depends on depth, as in
Cataclysm: DDA: what you carry, and in which pocket; what you can craft from
what you found; which wound will get infected. Towns are for scavenging. The
military cordon and the secret labs are where the good gear is, and the
strangest things. Everything is made of half-metre voxels, and everything can be
taken apart.

## Pillars

1. **Real-time tension, compressed time for long tasks.** Moving and fighting
   happen in real time. Crafting, reading, building and resting take hours of
   game time, but that time is compressed into seconds, and the world keeps
   moving while it passes.
2. **Depth through data.** Items, recipes, zombies, buildings and loot are data
   that combine through a small number of general systems. No one-off scripted
   items.
3. **Grounded weird.** The world is mundane first: houses, canned beans, dead
   cars. The weirdness has physical causes, gets stronger toward its sources,
   and can be understood (see [Tone](#tone)).
4. **The world moves on.** Time passes everywhere, including in places the
   player isn't. Food rots, generators run dry, hordes drift and zombies evolve.
   Areas the player left are caught up when they return, not frozen.
5. **Browser first.** A static site with no backend, running on a mid-range
   laptop. It's singleplayer, so the player's machine is the whole world.

## Reference hardware

Performance targets are measured on the **reference laptop**: the project
owner's laptop with an Intel Core i7-1185G7 (4 cores, 8 threads), 32 GB of RAM
and **Iris Xe integrated graphics**, running Firefox on Linux. The GPU is the
constraint to design for: integrated graphics share memory bandwidth with the
CPU, so triangle count, overdraw and draw calls matter more than CPU time. With
4 cores, workers (meshing, later worldgen and AI) compete with the main thread,
so keep their number small.

## Scale and units

| | |
| --- | --- |
| World unit | **1 unit = 1 metre.** Physics, rendering and content all use metres, and speeds are in m/s |
| Block size | **0.5 m** (decision; measured and play-tested in milestone 1.0, see SLICE-1.md Results). One constant, `BLOCK_SIZE`, converts between blocks and metres |
| View distance | **96 m** by default. A setting (64, 96 or 128 m) adapts it to the hardware |
| Chunk | 32³ blocks = a 16 m cube |
| Player | 1.8 m tall, 0.6 m wide, eyes at 1.62 m. Steps up 0.5 m (one block) without jumping. A jump clears about 1 m |
| Buildings | Doors 1 × 2 m (2 × 4 blocks). Storeys 3 m (6 blocks). Walls one block (0.5 m) thick |
| World height | Start at −48 m to +80 m (256 blocks, 8 chunks). Labs need depth below ground; towers need height above it |
| Mass, volume, length | Grams, millilitres, millimetres, as whole numbers |

Half-metre blocks make interiors, furniture, vehicles and body-sized details
readable without a separate prop system. The cost is 8× the blocks per volume;
[CHALLENGES.md](CHALLENGES.md#1-half-metre-blocks) covers the budget.

### Block shapes

Slice 1 has only full cubes. Later versions add a small, fixed set of shapes:
slab (half height), stairs, pane (thin wall or glass), pillar and ramp. Each shape
has its own mesher case and collision box. Blocks that need more detail than a
shape can give (furniture, machines) are block entities (see below) with a
voxel model.

## Time

### Two scales

- The **clock ratio** `r` is how many calendar seconds pass per simulation
  second. The starting value is `r = 8` (written 1:8), so a game day is 3 real
  hours. Content rates are written per
  game hour (for example "thirst +1 per hour"), so tuning `r` doesn't touch
  content.
- **Compression** `c` speeds up the whole simulation. It is 1 during normal
  play. During a long action it ramps up to a cap: start at 30, which makes
  1 real second about 4 game minutes. Physics, AI, needs and fires all run `c`×
  faster, and the player's own inputs are locked.

Real frame time × `c` gives simulation seconds; simulation seconds × `r` give
calendar seconds.

### Long actions

Crafting, reading, building, disassembly, repair, searching and sleeping are
**long actions**. A long action has a duration in game time. It runs with
compression on and shows a progress bar and the game time passing.

- **Compression is only allowed when it's safe:** no hostile is aware of the
  player, and none is within a safe radius (start at 30 m).
- **Interruptions:** a hostile noticing you, a loud noise, damage, fire, or a
  need hitting a threshold. The game drops back to real time and asks
  *Continue* or *Stop*. The progress made so far is kept.
- **Short handling** (moving an item, reloading, wielding) is not compressed.
  It takes real seconds while the world runs at 1× (see
  [Items](#items-and-inventory)).

### Pause

Esc pauses everything. The inventory screen does **not** pause the game. That
tension is intentional. A "relaxed" setting that pauses inside menus can come
later as an accessibility option.

### Catch-up simulation

When a chunk loads, it is advanced by the time it was unloaded. Each system
catches up in closed form where it can, and in coarse steps otherwise:

- Food decay and fuel burn: closed form (rate × elapsed time).
- Batteries: charge balance over the elapsed time, including when they ran out.
- Fires: coarse steps with a cap.
- Crops (after version 1): closed form.
- Zombies: they aren't in unloaded chunks individually. Hordes exist on the
  region map and turn back into individual zombies when their area loads (see
  [Zombies](#zombies)).

## Simulation architecture

- **Pure core.** Everything in `src/core` is pure TypeScript with no DOM and no
  three.js. That keeps the simulation testable in Node and movable into a
  worker.
- **Fixed-step scheduler.** Systems declare a tick rate in simulation seconds,
  for example:

  | System | Rate |
  | --- | --- |
  | Player physics | 60 Hz |
  | Active AI | 10 Hz |
  | Background AI | 2 Hz |
  | Needs, fire, power | 1 Hz |
  | Region map (hordes, evolution) | once per game minute |

  During compression, the per-tick step for the slow systems grows instead of
  the number of ticks, so the cost per frame stays bounded.
- **Entities.** Slice 1 uses plain objects behind a small `EntityStore`
  interface. When we have hundreds of zombies, that storage moves to
  structure-of-arrays typed arrays in a worker, without changing the systems'
  API (see [CHALLENGES.md](CHALLENGES.md#4-many-zombies-in-a-browser)).
- **Determinism.** Every system draws from its own seeded random stream derived
  from the world seed plus a system id, never `Math.random`. Given the same
  seed and inputs, a simulation test gives the same result, which makes bugs
  reproducible.
- **Events.** Systems don't call each other; they emit events. Noise, damage,
  block changes and item moves go on a per-tick event queue that other systems
  read.
- **Threads.** Meshing and worldgen run in workers. The simulation starts on the
  main thread and moves to a worker when its cost needs it. The pure core is
  what makes that move cheap.

## World

### Storage

- Chunks store block ids, and **uniform chunks** (all air or all stone) store a
  single value. Most chunks are uniform, and without this the memory budget at
  0.5 m doesn't work.
- Saves use a **per-chunk palette of string ids**, because runtime block ids
  depend on which content is loaded.
- Only chunks that differ from what worldgen produces are saved (as diffs).
  Anything else regenerates from the seed.

### Block entities

Blocks that have state beyond their id live in a sparse per-chunk map from
position to state. Examples: doors (open, locked), containers (cupboard, fridge,
crate), workbenches, generators, lights, wires, and fire. A container's state is
an item container (see below), so furniture and backpacks share one system.

A block entity can span several cells: a door is 2 × 4 and a fridge is
2 × 4 × 2. It's anchored at its lowest corner cell, and the other cells point
at the anchor.

### Generating the world in layers

Each layer is deterministic given the seed, so any chunk can be generated on its
own:

1. **Region map.** One map per 512 × 512 m region. It holds biome, elevation
   trend, the road graph, and sites for settlements and points of interest,
   each with a tier.
2. **Settlements.** Streets, lots and zoning (residential, commercial,
   industrial, military, lab).
3. **Structures.** Buildings from templates, plus procedural floor plans for
   variety. Each room has a room type (kitchen, bedroom, pharmacy, armoury),
   which picks its furniture and loot.
4. **Chunks.** Terrain, then any structure that overlaps the chunk, then block
   entities and item piles. Structures that span chunks are written from the
   region and settlement data, never by looking at neighbouring chunks.

**Template format.** ASCII layers in JSON, one layer per block height, with a
palette mapping characters to blocks, shapes, block entities and loot tags. It
diffs well, the validator can check it, and it's easy to write by hand for small
buildings. Importing from a voxel editor (MagicaVoxel `.vox`, which vengi also
reads) is added when buildings get big.

### Points of interest

| Tier | Examples | Loot | Threat |
| --- | --- | --- | --- |
| 0 | Farms, houses, gas stations | Food, basic tools, clothes | Shamblers |
| 1 | Towns: stores, pharmacy, police station, school | Medicine, better tools, a few firearms | Mixed types, small hordes |
| 2 | Cordon: checkpoints, crashed convoys, military camps | Military gear, ammo, vehicles, fuel | Soldier zombies, bigger hordes |
| 3 | Bases and labs: military installations, research sites (above and below ground) | Prototype tech, rare parts, lore | Special types, evolved and weird zombies, hazards |

Tiers rise with distance from the spawn area and around the lab sites. Labs are
the source of the weirdness: mutation pressure and hazard zones spread from them.

### Loot

Loot tables are data. A table has entries with weights, count ranges and
condition ranges, and entries can be nested tables. Room types and furniture
point at tables, and the point-of-interest tier scales them. Loot is rolled when
the chunk first generates, from the chunk's own random stream, so a save doesn't
need to store loot that nobody has touched yet.

## Items and inventory

### The item model

- An **item** is an instance: `{ type, count?, condition?, charges?, contents?, state? }`.
  Identical, stateless items stack (ammo, nails, matches). Everything else is its
  own instance.
- An **item type** is data with **components**. Examples:
  - `container` (pockets, below)
  - `wearable` (slot, warmth, protection, encumbrance)
  - `food` (calories, water, rots after)
  - `tool` (qualities such as `cutting: 2`, `prying: 1`)
  - `weapon` (melee or ranged stats)
  - `fuel`, `battery`, `light`, `book`
  - `vehiclePart` (after Slice 1)

  Behaviour comes only from components; the game never checks an item's id.
- **Pockets**, as in CDDA. A container has one or more pockets. Each pocket has
  limits on volume, weight and length (a rifle won't fit in a jacket pocket),
  and is rigid or soft. A pocket can be restricted to liquids or to specific
  kinds of item (holster, sheath, magazine). A soft pocket's size counts toward
  its container's volume.
- **The player carries** two hands plus worn items. Carrying capacity is the
  sum of your worn pockets. Too much weight slows you down and costs stamina.

### Handling time

Moving an item takes **real seconds** while the world keeps running. It's the
core tension of looting.

| Action | Base time (tunable) |
| --- | --- |
| From a worn pocket to your hands | 0.5 s, plus a little per litre of the item's volume |
| From a backpack (worn on your back) | 1.5 s + volume |
| From a container or pile on the ground | 1.0 s + volume |
| Search a container you haven't opened | 1–3 s, depending on its size |

Handling stops sprinting, and you walk at half speed while it happens. Actions
queue up, so you can drag five items and watch them transfer one by one.

### Inventory screen

HTML over the game view, and keyboard-first:

- Two panes: **you** (hands, then worn items with their pockets as nested rows)
  and **around** (piles, and containers within reach). Items move by drag and
  drop, or with keys.
- Columns: weight, volume, condition, and handling time for each row.
- Filters and search, and item details on hover or focus.
- A **quickbar** of shortcuts to items in your pockets. Using one still costs
  that pocket's handling time.

### Piles

Items on the ground form **piles** at block positions, like CDDA. A pile
renders as a small model, or a generic bundle if the item has no model.

## Crafting

- **Recipes** have a result, a time (in game time), skill requirements, **tool
  qualities** (for example `cutting ≥ 1`), and **components** as groups of
  alternatives (`2 × [plank | branch]`). Some recipes also need a workstation.
- **Where materials come from:** your hands and pockets, and piles and
  containers within 2 m. A workbench within reach provides its qualities and a
  speed bonus.
- **Disassembly** is a recipe run in reverse. It returns part of the
  components, depending on skill and the tools used.
- **Crafting runs compressed**, like other long actions, and can be interrupted
  and resumed. An interrupted craft leaves an "in progress" item that holds its
  components.
- **Skills** go up by doing (crafting, first aid, mechanics, electronics,
  firearms…), and faster when you read the right book. Reading is a long action.
- **Recipe discovery:** you know simple recipes from the start. Books and
  schematics teach the rest.

## Character

- **Needs:** calories, hydration, fatigue, stamina and body temperature. Rates
  are per game hour. Temperature comes after Slice 1.
- **Body.** Slice 1 has a single health pool. The body model that follows has
  head, torso, two arms and two legs, each with its own health and status
  effects:
  - bleeding: needs a bandage
  - infection: wounds left dirty get infected, which needs disinfectant
  - fracture: needs a splint
  - bite: raises zombification risk; how and whether that's treatable is part
    of the lore
- **Death is permanent.** A new run is a new world, or the same world with a
  new character (the item piles from the previous run stay).

## Combat and noise

- **Melee.** Weapons have damage, reach and speed, plus stamina cost and
  damage type (blunt, cut, pierce). Hit detection is a swept sphere cast from
  the camera against entities.
- **Firearms** come from gungen assemblies: part choices decide calibre,
  capacity, handling and noise. Ammo and magazines are items with pockets.
- **Noise** is an event with a loudness and position. Footsteps (worse when
  sprinting), melee, gunshots, doors, breaking glass and engines all make noise.
  Walls reduce how far noise travels. Zombies hear, investigate, and pass it on
  (see the screamer below). Stealth is a matter of managing noise and staying
  out of sight.

## Zombies

### Types are data

Each zombie type is data: base stats (health, speed, perception, armour),
**ability components**, a model and a loot table. Abilities are general systems,
reused across types: `grab`, `leap`, `scream`, `explode`, `acidSpit`,
`heatAura`, `lightEmitter`, `armoured`, `regenerate`, `burrow`.

| Tier | Type | Gist |
| --- | --- | --- |
| 0 | Shambler | Slow, weak, many |
| 0 | Crawler | Low profile, grabs your legs |
| 1 | Runner | Fast, fragile |
| 1 | Screamer | Weak, but its scream pulls in the horde |
| 1 | Bloater | Bursts into a noxious cloud |
| 2 | Brute | Big, knocks you back, breaks doors |
| 2 | Soldier | Armoured (from military sites) |
| 2 | Hazmat | Resists acid and fire (from lab sites) |
| 3 | Smoulderer | Hot to the touch; sets flammable things on fire |
| 3 | Incandescent hulk | A brute running a fever of a thousand degrees: glows, sets fires, warps glass. Seen from far away at night |
| 3 | Lantern | Bioluminescent lure that draws you in, and others |

### Evolution

A zombie can change into a tougher type after enough game days. Where it lives
decides the options: near labs they turn weird, around military sites they
toughen up. This is the game's long-term clock: the longer you survive, the
worse the world gets.

### Senses and AI

- **Senses:** sight (a view cone and range, worse at night and when you
  crouch), hearing (noise events) and smell (a trail the player leaves, which
  rain washes out).
- **Behaviour:** a small state machine: idle, wander, investigate, chase,
  attack, lost track. Pathfinding runs on the block grid and allows one-block
  steps, jumps and drops. It handles dynamic changes, so a door you close
  changes the route.
- **Level of detail:**

  | Level | Where | Simulation |
  | --- | --- | --- |
  | Active | Within about 48 m | Full AI at 10 Hz, per-frame physics |
  | Background | Loaded chunks further away | 2 Hz, steering along a shared flow field |
  | Abstract | Unloaded chunks | Hordes moving as groups on the region map |

### Models

Blocky figures with rigid limbs and keyframed animation. This is where skelly's
skeleton roots come in: a zombie's body is a small assembly of connected parts.

## Base building and electricity

- **Construction is crafting that places blocks and block entities:** walls,
  doors, barricades, furniture, workbenches, machines. Deconstruction is
  disassembly.
- **Doors and locks.** Doors have strength; zombies bash them (brutes faster)
  and you can barricade them. Locks can be picked or pried.
- **Electricity** is a graph:
  - **Nodes:** generators (burn fuel), solar panels (depend on the time of
    day), batteries (store energy), and consumers (lights, fridges, radios,
    workbench tools).
  - **Edges:** wires.
  - Connected components are recomputed only when wiring changes. Each power
    tick balances supply, storage and demand for each network.
  - When a base catches up after being unloaded, the calculation is closed
    form: when the fuel ran out, then when the batteries emptied.
- **Fire** is a world system: burn rate per material, spread to neighbouring
  flammable blocks, smoke and light. Hot zombies and molotovs use the same
  system.

## Vehicles

- **A vehicle is a grid of parts** on the 0.5 m grid: frame, wheels, engine,
  seats, fuel tank, battery, storage, lights, armour. Each part is an item with
  the `vehiclePart` component and its own condition.
- **Building and repair are crafting.** A vehicle can be pieced together from
  wrecks. The fuel tank is a liquid container; the battery is part of the
  electricity system.
- **Physics:** a rigid body with a box collider for each part, and ray-cast
  wheels with suspension. Collisions damage the parts that hit something.
  Arcade handling first. Rapier (a WebAssembly physics engine) is the candidate;
  see [CHALLENGES.md](CHALLENGES.md#8-vehicles-on-voxels) for driving over
  terrain that rises in 0.5 m steps.
- **Vehicles make noise.** Driving is fast and loud.

## Content and modding

- **Content types are defined with a schema library.** Valibot is preferred for
  its bundle size. The schema gives both the TypeScript types and the runtime
  validation, replacing today's hand-written checks.
- **Packs.** A pack is a folder of JSON files. The base pack loads first; mods
  load after it and can add new ids or override existing ones. Ids are strings,
  namespaced by pack when they would clash (for example `base:shambler`).
- **Every kind of content goes through the same validator:** blocks, shapes,
  items, recipes, loot tables, templates, zombie types, vehicle parts. It
  reports references to missing ids.
- **Versioned saves.** A save records which packs, and which pack versions, it
  was made with. Ids that no longer exist are kept as "unknown" rather than
  dropped (see [CHALLENGES.md](CHALLENGES.md#7-saves-and-migration)).

## Rendering

- **The look:** flat colour per block, with small per-block variation, ambient
  occlusion and fog. Textures only if colour alone can't carry the look.
- **Day and night** from sun and sky colour and fog. Nights are dark enough
  that a flashlight matters.
- **Voxel light**: sunlight, plus light from torches, lamps and hot zombies,
  spread through the block grid. It's needed for dark interiors and comes after
  Slice 1.
- **Far terrain:** chunks beyond the near radius switch to low-detail meshes.
  The targets are 96–128 m near detail and 512 m or more of far terrain; to be
  measured.
- **Entities** are drawn with instanced meshes; zombie limbs are instanced
  boxes.

## UI principles

- **HTML and CSS** over the canvas. Dense, legible, and keyboard-first, with
  the mouse also fully supported.
- The world never pauses for UI (except the Esc menu). UI should make actions
  fast: search, filters, "take all food", and repeating the last move.
- Every number the simulation uses (weight, time, condition, noise) can be seen
  somewhere in the UI. Depth is only fun when you can read it.

## Tone

**Working premise** (names are placeholders): a regional outbreak, a military
cordon around the region, and *Project Lantern*, a research programme working
with a heat-producing (thermogenic) organism. The spill turned the outbreak
strange. Most of the dead are just dead. Some run hot.

- **Allowed:**
  - mutation and evolution
  - bioluminescence and heat
  - experimental technology: prototype exosuits, EMP devices, strange ammo
  - hazard zones around labs
  - a military that did bad things to contain it
- **Not allowed:** gods, magic, portals to other dimensions, eldritch horror,
  sanity mechanics.
- **Every weird thing has a cause** you can find out from notes, terminals and
  lab records. The closer you get to the labs, the stranger it gets.
