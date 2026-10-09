---
read_if:
  - you decide how sunlight and shadows should read in play
  - you trade near-player shadow detail against distance
  - you're choosing world scale, view distance or performance targets
  - you're changing world block shapes or slab geometry
  - you're changing the rules for time, survival, light or zombies
  - you're changing the rendering of zombie actor models
  - you're integrating a mobgen amalgam body, its collision envelope or member hit ownership (#308)
  - you're changing the holes hits carve in the amalgam or the flesh chunks that fly off
  - you're recording or reconciling BR's crawler silhouette rulings
  - you're changing crawler gait, hit response or generation validation
  - you're changing clock boundaries, temporal field names or time conversion arithmetic
  - you're changing the derived day phases that drive the sky, zombie sight, hordes or spawn words
  - you change shambler attention, movement, obstacle response or floor-transition behavior
  - you're reviewing Slice 3 milestone 3.9 background simulation and its first horde
  - you're restructuring the per-tick zombie simulation
  - you change the game's design, especially inventory layout, held-item feedback, body damage or treatment, or hand ownership
  - you tune body infection or unconsciousness through content packs
  - you reconcile BR's rulings with player interaction and presentation
  - you're changing game audio or its relationship to simulation events
  - you're changing the debug test-house scene or firearm-handling range
  - you're changing firearm recoil, dispersion or aim control
  - you're changing firearm attachments, nested item slots or their save behavior
  - you're changing melee weapon contact behavior, stamina recovery timing or seeded damage variation
  - you're changing the quiet-key and noisy-prying alternatives for locked doors
  - you change what vehicles are for, or how their parts fit, come off and behave
  - you're changing held-item throwing or its range tuning
  - you're choosing or changing the building-weathering look and its dilapidation direction
  - you're authoring dilapidated structures or breached perimeters
  - you're changing player-facing item descriptions or their boundary with control guidance
---

# deadvox — design

The core design of the game: what it is, and the systems it's made of. Read it
together with:

- [EPIC.md](EPIC.md): the road to version 1.
- [CHALLENGES.md](CHALLENGES.md): the hard problems and how we plan to tackle them.
- [INTERACTIONS.md](INTERACTIONS.md): how moving, using, crafting and appliances
  work in the code, and the contract with the UI (draft).
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
taken apart. It should feel dystopian and frightening: alone in the dark, in a
place the authorities gave up on.

## Pillars

1. **Real-time tension, compressed time for long tasks.** Moving and fighting
   happen in real time. Crafting, reading, building and resting take hours of
   game time, but that time is compressed into seconds, and the world keeps
   moving while it passes.
2. **Dread, not shocks.** The game should be scary. The fear comes from being
   vulnerable and hunted: the dark, the noise you make, what you hear but can't
   see yet, and knowing that death is permanent. The systems make the
   frightening moments; nothing is scripted to startle you. The world shows how
   badly things went, and who made them worse (see [Tone](#tone)).
3. **Depth through data.** Items, recipes, zombies, buildings and loot are data
   that combine through a small number of general systems. No one-off scripted
   items.
4. **Grounded weird.** The world is mundane first: houses, canned beans, dead
   cars. The weirdness has physical causes, gets stronger toward its sources,
   and can be understood (see [Tone](#tone)).
5. **The world moves on.** Time passes everywhere, including in places the
   player isn't. Food rots, generators run dry, hordes drift and zombies evolve.
   Areas the player left are caught up when they return, not frozen.
6. **Browser first.** A static site with no backend, running on a mid-range
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
| Block size | **0.5 m**, the measured and play-tested choice. `BLOCK_SIZE` converts between blocks and metres |
| View distance | **96 m** by default. A setting (64, 96 or 128 m) adapts it to the hardware |
| Chunk | 32³ blocks = a 16 m cube |
| Player | 1.8 m tall, 0.6 m wide, eyes at 1.62 m. Steps up 0.5 m (one block) without jumping. A jump clears about 1 m |
| Buildings | Doors 1 × 2 m (2 × 4 blocks). Storeys 3 m (6 blocks). Walls one block (0.5 m) thick |
| World height | Start at −48 m to +80 m (256 blocks, 8 chunks). Labs need depth below ground; towers need height above it |
| Mass, liquids, item size | Grams and millilitres, as whole numbers. In inventories, an item takes w × h cells |

The 2026-09-25 feel test found 0.5 m blocks far better than 1 m: doorways,
furniture and interiors read at a human scale, and stairs are walked instead of
jumped. A 0.25 m look on 2026-10-01 did not feel better and would have cost
about eight times as many chunks at the same view radius, plus a redraw of
building templates. The frame budget and why the default is 96 m are in
[CHALLENGES.md](CHALLENGES.md#1-half-metre-blocks). The choice is implemented by
`src/core/scale.ts`, `BLOCK_SIZE`.

### Block shapes

Slice 1 has only full cubes. Later versions add a small, fixed set of shapes:
slab (half height), stairs, pane (thin wall or glass), pillar and ramp. Each shape
has its own mesher case and collision box. Blocks that need more detail than a
shape can give (furniture, machines) are block entities (see below) with a
voxel model.

BR's 2026-10-07 12:50 rulings refine this slab plan: “right okay; well we won't
convert to 0.25 m blocks” and “but we won't implement it prior to playtest1”.
The size set remains under discussion in #221. BR's 2026-10-07 13:10 purposes,
in rough priority order, are roofs and silhouettes; movement aids such as
half-steps and low walls to climb or vault; cover behind sandbags or low walls;
and finer building detail. Movement and cover mean slabs are simulated for
collision, sight and shot blocking, not only drawn. BR said at 13:10, “they are
roughly in priority order too” and “We will want to build finer detailed
buildings, making ergonomic movement aids, hiding behind stuff that are built
partly from half slabs.”

## Time

### Three clocks and canonical units

Three clocks are explicit throughout the simulation boundary. BR asked, 2026-10-06 21:41, “what is our standard overall? Like, for all temporal fields - do they use the one or the other or is it mixed?” At 21:44: “yes, but let's be even more explicit, so that we use  SimSeconds and GameSeconds” and “that would be the complete pair? Or, we might have use of RealSeconds too, that aren't sim-bound - i.e. wall clock time”. At 21:48: “as for time: I think we'd do best with (b) having support for different units _or_ even have a uniform TimeSpan kind of struct or string, which would allow for any resolution needed at any point”. BR chose numeric fields with a mandatory clock and unit, and the outer Real-to-Sim boundary: “1. (b)” / “2. (i) + a custom linter that tries to detect violations” (2026-10-06 22:25).

Simulation time advances only by a Sim-seconds step. `src/game/frameDriver.ts`, `advanceLiveFrame`, processes between-frame interruptions before ramping compression and sizing the live step; `src/game/play.ts` routes live play through that driver. Replay remains a separate deterministic path: `Simulation.frameReplay` checks interruptions before applying recorded compression to its fixed Sim step. The core accepts Sim seconds and never samples a wall clock. Game time advances from Sim time through the saved clock ratio; Real time is reserved for the frame/input/presentation boundary.

The conversion is `SimSeconds = RealSeconds × compression`, followed by `GameSeconds = SimSeconds × CLOCK_RATIO`. `src/core/time.ts` owns named conversions: minutes normalize by multiplying by 60, hours by 3,600, and rates per minute or hour normalize by dividing by those factors. Timestamp conversion also includes the Game-clock origin; duration conversion does not. Game-clock content rates are authored per Game hour, so tuning the clock ratio (`CLOCK_RATIO`) does not change content.

Authored temporal field names include their clock and unit. Content schemas parse numeric values to branded canonical seconds or rates; `src/core/temporalFields.ts`, `TEMPORAL_FIELDS`, catalogs authored fields and dimensions. The brands prevent assignment where a different branded unit is required; they do not prevent arithmetic between unlike brands. `deadvox/tools/time-lint.mjs`, `lint:time`, checks the simulation dependency graph for Real-clock sources, temporal names without clock-and-unit, arithmetic mixing branded clocks using the TypeScript checker, and the runtime-name baseline. The type-based checks use the TypeScript program assembled by `typeProgram`; if a simulation `.mjs` module gains clock arithmetic, widen that program before relying on those checks there. The baseline holds owner-boundary names deferred to r46; its ratchet requires each such field to leave when renamed. Gungen's internal cycle estimates are outside deadvox `lint:time`; exported action metadata follows deadvox's clock-and-unit schema, guarded by the root gungen-to-deadvox contract test. Owner-field and save-format renames are r46 work; persisted-name changes require a save-schema bump because older saves are rejected.

### Long actions

Crafting, reading, building, disassembly, repair, searching and sleeping are
**long actions**. A long action has a duration in game time. It runs with
compression on and shows a progress bar and the game time passing.

- **Starting an action:** a nearby or aware hostile does not block a long
  action, and time still fast-forwards. BR (2026-10-05 20:09) answered
  "fast forward". BR (2026-10-05 22:28) chose option B; the lead's wording for
  B was "No: only a hit or another real event (hunger, thirst...) wakes you".
  BR said "it's up to the player to make the area safe for them to do the long
  action. We're not holding hands".
- **Interruptions:** emitted events such as a hit, loud noise, fire, or a need
  hitting a threshold stop the action. A shambler noticing the player does not
  interrupt it. `src/core/sim.ts`, `Simulation.checkInterruptions`, admits
  emitted events; `src/core/longAction.ts`, `LongActions.syncInterruption`,
  wakes a sleeper, clears the interruption and frees input. Other actions drop
  back to real time and ask *Continue* or *Stop*. Progress made so far is kept.
- **Short handling** (moving an item, reloading, wielding) is not compressed.
  It takes real seconds while the world runs at 1× (see
  [Items](#items-and-inventory)).

### Pause

The pause card pauses everything. F9 opens it (the main menu), and so does
releasing the mouse: Esc is the browser's key, and it only unlocks the pointer,
which brings the card up. The inventory screen does **not** pause the game. That
tension is intentional. A "relaxed" setting that pauses inside menus can come
later as an accessibility option.

The card is an opaque panel docked to the right edge, vertically centred, with no
dimming, tint or blur over the frozen view, so the middle of the screen stays
clear for screenshots.

### Catch-up simulation

When a chunk loads, it is advanced by the time it was unloaded. Each system
catches up in closed form where it can, and in coarse steps otherwise:

- Food decay: none needed. An item's age is the clock minus when it was made,
  so food in a chunk that was unloaded for a week is exactly as rotten as food
  you carried.
- Fuel burn: closed form (rate × elapsed time).
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
  | Active AI | `src/game/simulationRates.ts`, `ZOMBIE_RATE` |
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

Authored sites need restrained terrain variation so their shaped ground and vegetation do not read as flat platforms with polygon-cut tree borders. `src/core/authoredSite.ts`, `AuthoredSite`, applies seeded simplex texture while fading it out around structures, routes and spawn, varies woodland edges, and sparsely admits young trees on open ground; the authored-site generation tuning stays in base content so layout geometry remains about authored places, not generator settings. The same seed and coordinates determine the result, independent of chunk request order.

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

### Debug scenes

The firing range belongs to `?site=testHouse&debug=1`, not to ordinary world sites:
it lets firearm handling be exercised without turning the test stock into a playable-world
loot source. `src/core/range.ts`, `HandlingRange`, owns the shared lane geometry, while
`src/game/testHouseRange.ts`, `testHouseRangeStock`, derives the rack contents from registry
firearm and ammunition compatibility. `HandlingRange.approachHeight` and
`DebugTestHouseSite` keep the debug lane connected to the test-house pad at the same floor;
`test/testHouseRange.test.ts` exercises the south-gate route with player collision.

### Loot

Loot tables are data. A table has entries with weights, count ranges and
condition ranges, and entries can be nested tables. Room types and furniture
point at tables, and the point-of-interest tier scales them. Loot is rolled when
the chunk first generates, from a random stream keyed by the container's
position, so a save doesn't need to store loot that nobody has touched yet, and
chunks can generate in any order.

## Items and inventory

### The item model

- An **item** is an instance: `{ type, count?, condition?, charges?, contents?, state? }`.
  Identical, stateless items stack (ammo, nails, matches). Everything else is its
  own instance. BR, 2026-10-07 12:13: "let's think it through: in my world, the
  item would be a unique instance, with its own properties and state, so it's not
  a different item in the inventory and on the ground for example". BR, 12:19:
  "yes: (a) Things with their own state are unique: guns, magazines with their
  rounds, later anything that wears or breaks. Identical stateless things stay
  counted stacks." A unique item looks like its own state wherever it is drawn
  ("One item, one look" below).
- An **item type** is data with **components**. Examples:
  - `container` (pockets, each a grid; below)
  - `wearable` (slot, warmth, protection, encumbrance)
  - `food` (calories, water, rots after)
  - `tool` (qualities such as `cutting: 2`, `prying: 1`)
  - `weapon` (melee or ranged stats)
  - `fuel`, `battery`, `light`, `book`
  - `vehiclePart` (with vehicles, #322)

  Behaviour comes only from components; the game never checks an item's id. For d59-1, BR ruled (BR, 2026-10-05), "yes, rule covers drawing too": first-person displays and ground-pile presentation follow declared components as well; see `src/render/hands.ts`, `HeldItems.syncHand` and `HeldItems.shape`, and `src/render/piles.ts`, `PileMeshes.drawPile` and `PileMeshes.planSpentCases`.
- **Space is a grid**, as in DayZ. An item takes w × h cells and can be
  rotated. A container has one or more **pockets**, each its own grid: a jeans
  pocket is 1 × 2, a hoodie pocket 3 × 2, a school backpack 5 × 6, a kitchen
  cupboard 8 × 6. The grid is the only size limit, so a crowbar (1 × 5) doesn't
  fit in a jeans pocket. A pocket can be restricted to liquids or to kinds of
  item (holster, sheath, magazine). Liquids are measured in millilitres inside
  their container.
- **Only empty bags nest.** A container with anything in it can't go inside
  another container.
- **The player carries** two hands plus worn items; their pockets are your
  carrying space. Pockets have no weight limit, but the total weight you carry
  slows you down and costs stamina.
- **Condition** reads as a word: pristine, worn, damaged, badly damaged or
  ruined. Inspecting an item shows the exact numbers.
- Item descriptions describe the item, not how to operate it. Bindings can change,
  so operating instructions belong in the binding table and its displayed controls
  list (`src/game/inputBindings.ts`, `INPUT_BINDINGS` and `POINTER_ACTIONS`), not
  in the description.

### Hands: what you see is what's there

The inventory is diegetic, as in DayZ, with one exception for long actions.

- **Wield, then activate (BR, 2026-10-04):** "diegesis: wield item->activate".
  Using an item means holding it and using the ordinary held-item activation,
  aimed at its target if it has one: "using the key means wielding it, and
  activating it on the door". Ammo boxes are unpacked the same way, never from
  the inventory screen, and no modifier chord bypasses it.
- **Rummage feedback (BR, 2026-10-04, d50):** "there is no anim for when
  opening the box of shells / i think we should add a generic \"hands go
  together and rummage with the held item\"". Handling needs visible feedback,
  not a second action owner. See `src/render/rummagePose.ts`, `rummageFrame`
  and `RUMMAGE_POSE`, and `src/render/hands.ts`, `HeldItems.poseRummage`.
  BR approved on 2026-10-04 at 23:55: "very nice; rummaging approved".
  On stowing: "putting away the shotgun from being wielded also plays rummaging
  anim - i think it kinda fits". The longer-term direction is "over time, we'll
  maybe add more specific anims." The shell-loading animation is in #248; BR
  approved it on 2026-10-05: "approved". Approval does not pin `RUMMAGE_POSE`
  tuning: see
  `../docs/deferred-assertions.md`.
  Following #213's merge (d50-3), compass handling must not introduce a second
  rest-pose owner: `HeldItems.handBases` retains the raised inspection grip for
  `HeldItems.poseRummage`. The needle's world-heading owner remains independent
  of hand motion: see `src/render/compass.ts`, `createCompass`.
- **Handedness (BR, 2026-10-04):** whether "one's avatar is right- or
  left-handed dominant is a thing we should accomodate". Quick actions, the
  dominant and off-hand activations, holds and drawing follow the character's
  dominant hand. Dominance is immutable actor identity, not a reassignment of
  anatomy or inventory slots. Creation chooses it before the accepted launch;
  Continue uses the saved identity. See `docs/character-handedness.md` for why
  preferences follow roles while placement and mechanical axes stay physical.
- **You use things from your hands:** eating, drinking, bandaging, reading,
  striking a match, switching a light on. Getting the item into your hands costs
  its handling time; using it is a separate action. A two-handed item takes both
  hands.
- What you hold shows in first person, what you drop lies on the floor as a
  pile, and furniture holds what its grid shows. For #252, a burning carried
  light needs its world point light and a self-lit held presentation: a visible
  flame for firestarter lights and a self-lit body. `HeldItems.render` draws the
  hands in a separate scene, so the world light cannot illuminate that model. See
  `src/render/hands.ts`, `HeldItems.shape`,
  and `src/render/lightPool.ts`, `LightPool.update`.
- **Primary action (BR, 2026-09-26, issue #27):** "Left click does the thing
  with the thing you're holding." Activation follows the character's dominant
  and off-hand roles, not a fixed physical side. A held item must never turn
  into an unarmed attack, and a reserved support hand must not redirect an
  action. See `src/game/inputBindings.ts`, `INPUT_BINDINGS` and `POINTER_ACTIONS`, for inputs;
  `src/game/primaryAction.ts`, `selectPrimaryAction`, for capability admission;
  and `src/core/playerCombat.ts`, `PlayerCombat`, for the saved physical fist
  sequence. Continue preserves that sequence rather than reseeding it.
- **Long actions gather what they need.** Crafting, repair, disassembly and
  reading take their items from within reach (your hands, what you wear, and
  piles and furniture within 2 m) at the start. The gathering time is part of
  the action, which runs in compressed time with both hands busy.
- **Numbers are there when you look.** Inspecting an item shows its exact
  weight, condition, qualities and times (see [UI principles](#ui-principles)).

### Handling time

Moving an item takes **real seconds** while the world keeps running. It's the
core tension of looting.

| Action | Base time (tunable) |
| --- | --- |
| From a worn pocket to your hands | 0.5 s, plus 0.05 s per cell of the item's size |
| From a backpack (worn on your back) | 1.5 s + size |
| From a container or pile on the ground | 1.0 s + size |
| Moving between two containers | Taking it out of one plus putting it into the other |
| Search a container you haven't opened | 1–3 s, depending on its size |

Handling stops sprinting, and you walk at half speed while it happens. Actions
queue up, so you can drag five items and watch them transfer one by one.

### Inventory screen

HTML over the game view, and keyboard-first:

- Two panes: **you** (hands, then each worn item with its pockets drawn as
  grids) and **around** (piles, and containers within reach, also as grids).
  Items move by drag and drop with a destination preview, or with keys. R rotates.
- So Items fits small zoomed screens, the compact view leaves unused cells out of
  the empty **At your feet** target, and a content-owned width limit keeps an
  oversized locker from dominating the nearby pane; wider containers carry a reason
  in content.
  See `src/ui/inventoryScreen.ts`, `InventoryScreen.viewModel`, and
  `src/core/content.ts`, `checkContainerWidth`.
- Each item shows its name, a stack count and its condition word. Each pocket
  shows its handling time. Weight, exact condition and times are in the item's
  details.
- Filters and search, and item details on hover or focus.
- A **quickbar** of shortcuts to items you carry. BR (2026-10-05, 00:02):
  "one thing that feels not quite right to me is that pressing the quickbar
  number activates the item […] what if the number itself only wields or
  unwields it, but T+number activates it?" BR settled at 00:08: "1. hold-number,
  no doubt. This is the best UX / 2. agreed". The old number-use duplicated
  left-click, `=` and R; a double press could rack a drawn gun, eject a live
  shell, or eat food, and there was no way to put an item away. A tap now takes
  an item into its capability-directed hand or puts it away; a hold uses an
  available action from its current location. Weapons, keys and tool-only items
  have no pocket use and give a short notice; firearm cycling stays on R. Weapons
  and tools use the primary hand, lights the off hand, and two-handed items both
  hands. When a held item
  is put away, it returns to its captured source or the best pocket; this source
  is saved because the tap's put-away behavior must survive a save/load. See
  `src/game/quickbarInput.ts`, `QuickbarInput`, and `QUICKBAR_HOLD_ESTIMATE_MS`
  for the presentation-only gesture estimate; `src/game/quickbarActions.ts`,
  `QuickbarActions`, for tap/hold routing; `src/core/options.ts`, `quickbarTake`
  and `quickbarPutAway`, for item-directed hand choice and return; and
  `src/core/inventory.ts`, `Inventory.quickbarOrigin` and `Inventory.snapshotState`,
  for the captured source saved in `InventoryState.quickbarOrigins`. Firearm cycling
  remains on R only.

### Piles

Items on the ground form **piles** at block positions, like CDDA. An item
with a model lies at its place in the pile's grid, drawn with its own look
("One item, one look" below); items without one make a generic bundle. For d59-2, spent cases read as loose debris rather than stacked
material, so their content-owned pile-display component selects scattering; see
`src/core/schema.ts`, `PILE_DISPLAY_KIND`, and `src/render/piles.ts`,
`PileMeshes.planSpentCases`.

### Item models

Items have simple, low-poly models: glTF files in the content pack, named by id
and checked by the validator, like sounds. A model says where the hand holds
the item, names points such as a flashlight's lens, and names the slots where
fitted parts sit, such as a rifle's magazine. It's what you see in a
pile and in your hands; an item without one is a bundle on the ground and a
plain box in your hands. Files are small, and follow
[Assets and credits](#assets-and-credits).

### One item, one look

BR, 2026-10-07 12:19, approved these three lines with "Good:":

- "One function builds an item's model from that item's own state: the rifle
  body, plus the fitted magazine's own model in the magazine well, plus
  attachments later (#347's suppressors)."
- "Every view uses it: in your hands, carried on the body, on the ground and in
  the inventory preview. The same rifle looks the same everywhere."
- "The ground renderer batches by what an item looks like, so an AK with a
  magazine and one without draw differently."

It answers BR's FIX on #337 at 12:09 (d114-11), "the model should reflect
reality" ("Combat and noise", rifles). A firearm's model names its magazine
slot, as #347's export contract does: the magazine node baked into the export
and the frame a fitted magazine sits in. Every view hides the baked node and
draws the fitted magazine's own model in that frame, so a rifle with its
magazine out shows none, in the hands and on the ground alike. The validator
requires the slot of every magazine-fed firearm. The hands and piles are the
views that draw item models, and any later one (on the body, an inventory
preview) builds the same look. See `src/render/itemLook.ts`, `itemLook`;
`src/render/models.ts`, `ModelLibrary.heldLook` and `ModelLibrary.groundLook`;
and `src/core/content.ts`, `checkItemFirearm`.

### Assets and credits

- **Licences.** Asset files (models, sounds, textures) are made for the game,
  or are CC0 1.0, CC BY 3.0 or CC BY 4.0. Other licences, such as share-alike
  or non-commercial ones, aren't accepted.
- **The asset manifest.** Each pack has one (`assets/manifest.json`), listing
  every source the pack's files came from: its title, page, author, licence,
  the file downloaded, the pack's files made from it, and what we changed. The
  validator refuses a licence we don't accept, a CC BY source with no author or
  link, a file listed twice, a file under `assets/` the manifest doesn't list,
  and a listed file that's missing.
- **The credits screen** lists every source, CC0 included: the title linked to
  its page, the author, the licence linked to its text, and what we changed. It
  opens from the start and pause card, and it's how we give the credit CC BY
  asks for.
- **The sound sheet stays, curated (BR, 2026-10-01):** "let's keep the audio
  sheet, and keep it curated. We'll have to incrementally work on the audio
  anyways." `/sounds.html` lists every sound event with its variants and a
  status (approved, placeholder, to replace). Any change that adds, replaces or
  re-levels a sound updates it in the same PR.

## Crafting

- **Recipes** have a result, a time (in game time), skill requirements, **tool
  qualities** (for example `cutting ≥ 1`), and **components** as groups of
  alternatives (`2 × [plank | branch]`). Some recipes also need a workstation.
- **Where materials come from:** your hands and pockets, and piles and
  containers within 2 m (see [Hands](#hands-what-you-see-is-whats-there)). A workbench within reach provides its qualities and a
  speed bonus.
- **Disassembly** is a recipe run in reverse. An authored yield or salvage list
  keeps the result specific to the item's design; it isn't calculated by
  reversing every alternative or every recipe that could make the item. See
  `docs/crafting.md`, `planDisassembly`.
- **Crafting runs compressed**, like other long actions, and can be interrupted
  and resumed. An interrupted craft leaves an "in progress" item that holds its
  components.
- **Skills** go up by doing (crafting, first aid, mechanics, electronics,
  firearms…), and faster when you read the right book. Reading is a long action.
- **Recipe discovery:** you know simple recipes from the start. Books and
  schematics teach the rest.

## Character

- **Needs:** calories, hydration, fatigue, stamina and body temperature. Rates
  are per game hour. Body temperature isn't simulated; #366's heat property
  could later serve it.
- **Body.** BR (2026-10-06 07:23) approved the five defaults: “yes, take the five
  defaults”. The model makes injury decisions consequential beyond a single
  health value: see `src/core/body.ts`, `Body`; `src/core/needs.ts`, `stepNeeds`;
  and `src/ui/inventoryScreen.ts`, `InventoryScreen`.

  BR's 08:33 treatment rule is “the \"treat with rag\" is not the way to go.
  You wield the rag and left-click apply it (or quickbar-hold)”;
  `src/game/survival.ts`, `Survival.use` and `Survival.useFromQuickbar`, own
  that path. BR's 08:35 follow-up was “however, there need to be a \"select\"
  mechanism in the UI for when wielded where to apply - it could be a message
  box (visible only when messages/hints are enabled)”. BR then ruled at 08:36:
  “scrolling on mouse changes which action is selected for the wielded item”.
  `src/game/itemActions.ts`, `ItemActionSelection`, and `src/ui/playHud.ts`,
  `playHudText`, cue selection and its hints-only presentation. BR's 08:41 default
  is recorded in [SLICE-3.md](SLICE-3.md), 3.4.

  BR (2026-10-06 11:05) agreed to time-based infection onset, an antiseptic
  window, deterministic infection risk and a timed knockout, adding “agreed
  with your suggestiong; but let's keep them tunable”. The wake-shock setting
  is a starting tuning value, not a number BR chose. BR clarified at 11:32:
  “and, just to be clear, the aim is to define all content and tunables via
  mods - even the _core game_”, and at 11:34: “yeah, let's do it now”.
  BR's 14:41 ruling was “knockout = totally black and no sound and prone”. BR approved the look at 16:35: “looks good - black screen and then death 👍”. See `src/game/session.ts`, `playerEyeHeightMetres`; `src/game/audio.ts`, `GameAudio.setOutputMuted`; `src/game/play.ts`, `frame`; `src/ui/style.css`, `body.unconscious`; and `src/core/schema.ts`, `BodyTuningSchema`.
- **Death is permanent.** A new run is a new world, or the same world with a
  new character (the item piles from the previous run stay).

## Combat and noise

- **Melee.** Weapons have damage, reach beyond the player's hand, and speed,
  plus stamina cost and damage type (blunt, cut, pierce). The swing reaches the
  player's 1.2 m effective eye-to-hand reach (including the lean into a swing)
  plus the weapon's reach; hit detection tests posed shambler body-region boxes
  along the aim ray. A click locks aim and starts a wind-up; the hit resolves at
  contact after `min(0.4 × cooldown, 0.25 s)`, with recovery filling the rest of
  cooldown. Misses and wall-blocked swings still spend stamina and cooldown.
  Active swings are saved and fingerprinted so Continue preserves one pending
  hit; changing held items cancels that hit without refunding cooldown. BR
  (d113-1, 2026-10-06 23:52): “calling it 'cosmetic' seems like a bug”. Holding right
  mouse with a melee weapon or empty hands enters en-garde; holding S while
  en-garde attempts to block incoming melee, with success by melee-combat skill.
  En-garde does not change movement pace. See `src/game/melee.ts`,
  `shouldEnterMeleeReady` and `shouldBlockFromEnGarde`, `src/game/session.ts`,
  `hurtPlayer`, `src/core/meleeCombat.ts`, `blocksAttack`, and
  `src/game/player.ts`, `movementPace`. First-person motions use shared blunt-arc,
  cut-slash, pierce-thrust and alternating-fist profiles; two-handed items
  animate both arms. Confirmed hits add only clamped first-person recoil.

  BR's 2026-10-07 ruling:

  > blunt: lower variance, greater head damage, generally slower weapons
  > edged: severs limbs more easily, medium variance, medium speed
  > stabbing (piercing): in many cases faster, big damage variance

  These class differences make weapon choice matter at contact instead of making every hit a fixed subtraction. The class defaults and per-weapon overrides are provisional content tuning so BR can adjust how those tradeoffs feel. `src/core/schema.ts`, `MeleeClassSchema` and `WeaponSchema`, validate the authored defaults and overrides; `src/game/melee.ts`, `resolvePlayerMeleeWeapon`, resolves them with the swing-time body slowdown into the saved active action, and `src/core/zombies.ts`, `ZombieSystem.applyMeleeHit`, applies the contact effects. Damage variation uses one draw from `Zombie.dismemberRng` per class-weapon hit, before dismemberment checks and even at zero spread. Keeping draw order independent of spread prevents later dismemberment rolls from shifting when tuning moves to or from zero. Zero stamina refuses a swing, and the authored stamina-recovery wait is saved as remaining simulation time so Continue does not restart or skip that delay; see `src/core/needs.ts`, `spendStamina` and `stepStamina`, and `src/core/sim.ts`, `Simulation.restoreState`.
- **Firearms** come from gungen assemblies: part choices decide calibre,
  capacity, handling and noise. Ammunition and magazines are items; a magazine holds its
  cartridges and fits a rifle's magazine slot (see "Magazines" and "Rifles" below). The
  simulation's `AimController` publishes the same offset to shot resolution and
  held-firearm presentation, so the weapon does not visibly aim somewhere other
  than its shot ray. Aim state is saved because it can change hit outcomes. BR,
  2026-10-07 10:16, said “completely wrong ... indeed the hip-fire goes to the
  cross hair, but the rifle points completely wrong” and proposed “we should
  perhaps do it the other way: the crosshair (when wielding a readied firearm)
  should point where the muzzle is pointing or even where the bullet _would_ hit
  if fired at that moment”. BR, 2026-10-07 10:21, chose the bore-line hit rather
  than the next shot's random spread (“choose: (a)”), and said “and additionally,
  when debug=1 the center of screen should be shown using an X mark so we can
  relate to where center of screen is even when this is implemented”. BR,
  2026-10-07 12:16, said verbatim: “#341: works really well overall - except
  that the muzzle crosshair stays (or is defaulted to center) after having
  raised -> then release so it's unraised. I'd expect the muzzle cross hair to
  be off screen when rifle is unready (poiting down)”. BR, 2026-10-07 13:30,
  ruled: “i want it kept: it shows truthfully where the muzzle points, so there's
  nothing wrong with that”. At 13:31 BR clarified: “i just thought it would
  have pointed off screen, but that was just inference from my side”. The
  unready crosshair therefore stays at the projected muzzle point wherever it
  lands, and is hidden only when outside the view or behind the camera; with no
  firearm wielded, the main-game center crosshair remains. BR, 2026-10-07 14:55,
  on the rifle turned for a rack or a magazine job (d114-12): “as recommended:
  Follow the turned muzzle”. While a job turns the drawn rifle, the crosshair
  follows the turned muzzle (with the rifle raised it stays in view, along the
  turned barrel) and comes back as the turn eases out; by #341's rule it leaves
  the view only if the turned muzzle point does. The pump's cant toward its port
  during a rack moves the mark the same way, though only slightly, since it
  rolls the gun about its own barrel (d114-13). `src/render/handlingTurn.ts`,
  `handlingRotation`, supplies the same turn to `src/core/heldPose.ts`,
  `heldFirearmTransform`, for the drawn firearm and its crosshair. Shots keep the
  unturned bore:
  `FirearmMechanics.fire` refuses one while a handling job or a cycle runs, so
  the two never disagree at a shot.
  An earlier instruction was: “Also, "hipfire" is way off the mark (cross hair / center of
  screen) - i.e. when simply readied the rifle and shooting one single round”.
  BR's 2026-10-07 10:16 and 10:21 rulings above supersede that instruction,
  replacing convergence toward the crosshair surface or posed zombie with the
  bore-line hit.
  Shots now leave along the visible firearm's bore, plus firearm-owned spread.
  `src/game/firearmAim.ts`, `firearmBoreRay`, supplies that shared line to both
  shot resolution and the held-firearm crosshair; `src/game/play.ts`,
  `heldFirearmBore`, supplies its current raise progress. `src/ui/playHud.ts`,
  `projectCrosshairScreenPosition` and `playCrosshairFrame`, hide it outside the
  viewport and keep the centered default only when no firearm is wielded. The hip pose reuses the hand placement but not the melee
  wrist rotation, so the visible bore follows the player's look. The debug X is
  separate from the optional crosshair. BR, 2026-10-07 16:20, ruled: “Really,
  in ADS, the recoil should let the firearm move (i.e. follow the
  muzzle-crosshair) without the view following - that is the 'uncontrol' that
  recoil and other handling aspects brings”. In ADS the undeviated sight
  direction and up axis, including cant and eye relief, align to the fixed view
  in `heldFirearmTransform`; recoil, sway and handling then move that shared
  firearm pose and bore while the view stays put. `HeldItems.update` keeps the
  optic window attached to the shifted sight, and `heldFirearmBore` uses the
  same transform for the crosshair. The intentional over-limit pitch shift still
  moves the view through `src/game/session.ts`, `applyAimViewPitchShift`
  (`controls.adjustPitch`).
  `src/debug/index.ts` owns the development target-range readout. BR's earlier requirement remains: “the number on the screenshot
  should be a maximum of sub-1-meter”. Whether the readout meets it is for BR's
  look. BR's 2026-10-05 look at the range found that "the gun on screen is
  climbing (and plateauing)" and ruled,
  "at the ~7° screen limit -> start scrolling the screen with it / no plateauing."
  While an automatic trigger is held, recoil does not
  recover; over-limit pitch shifts the saved view pitch. The shifted view stays
  after release while the on-screen weapon offset recovers, so mouse look can
  counter the climb. BR also clarified that "dispersion is not a skill issue,
  but control is": firearm-owned `dispersionRadians` is sampled per round, while
  `firearmsSkillEffects` controls sway, kick per shot and recoil recovery,
  with legendary progression granting no control beyond ordinary expert per
  BR's ruling. When the AK (then a debug item, now `rifle_ak`) fired on full auto at skill 0, BR reported
  (2026-10-06): “also; now that i can properly fire from ADS on the AK, I can
  note that a firearm skill level zero (=0) is way too good at controlling
  automatic fire with a 7.62x39 AKM-looking rifle” / “it should be 3x worse”.
  BR then said, “i think at skill=0 the handling should be even worse - like at least 4
  _times_ worse”.
  BR chose four times what they felt at `7a8c72db` as the comparison (“1: a”). They wanted
  kick, shot-to-shot dispersion and recovery all worsened (“2: all”), mostly for automatic
  follow-ups but for singles too (“3: mostly full auto, but singles too”). BR approved
  moving the values into moddable content with live debug controls: “yes, make them content
  and add debug sliders”. Accordingly, skill-zero endpoints for single/first shots and
  automatic follow-ups are separate values in `src/content/base/recipes.json`, under the
  firearms-combat skill's `skillZeroHandling`; `src/core/schema.ts`, `SkillSchema`, validates
  them. A follow-up is a committed shot from the same firearm within its burst window; see
  `src/game/firearmHandling.ts`, `FirearmMechanics.handlingShotKind`. The expert
  endpoint stays on the existing curve, so skill-10 shot handling is unchanged;
  legendary still matches expert.
  The starting point was twice the skill-zero handling BR felt at `7a8c72db` for singles
  and four times for follow-ups. BR approved those values and ruled that guns need different
  factors: “oh yeah! Now we're talking. #324 approved as such / but it's important to note
  that we need different factors for different guns - e.g. a MP5 style SMG does not have the
  same kick as a AK/M pattern gun”. d112 puts the optional skill-zero factors beside base
  recoil in each item's `firearm` data in `src/content/base/models-firearms.json`; the
  `FirearmSchema` in `src/core/schema.ts` requires a complete in-range shape when present.
  A per-gun shape replaces the shared skill-zero endpoints as a whole; absent factors use the
  global firearms-combat endpoints. Keeping the override complete avoids mixing fields from
  different guns. `src/game/firearmHandling.ts`, `FirearmMechanics.skillZeroHandlingFor`,
  selects the effective factors, and `src/core/firearmsSkill.ts`, `firearmsSkillEffects`,
  interpolates them toward the same expert endpoint. The provisional per-gun starting values
  follow base recoil and await BR's slider review for d112. The MP5 comparison has no matching
  in-game SMG item; d112 adds factors to existing firearms, not a new gun. `src/debug/index.ts`,
  `firearmsSkillEffectSlider`, renders the tuning controls; `attachDebugTools`,
  `changeFirearmsSkillZeroEffect`, applies them at runtime, and `copyFirearmsSkillZeroHandling`
  copies the current gun's values.
  The controls are runtime-only, reset on reload, and do not alter saves. The shared skill
  effects are computed in `src/core/firearmsSkill.ts`, `firearmsSkillEffects`;
  per-firearm recoil and pellet spread remain firearm-owned. The pump keeps its pellet
  spread and adds no firearm cone. This reuses the already saved player pitch, so no
  aim-state field or save-schema change is needed. See
  `src/game/firearmAim.ts`, `firearmBoreRay`, `firearmBoreTarget`,
  `src/core/crosshairTarget.ts`, `crosshairTarget`, `src/core/zombies.ts`, `ZombieSystem.aimAt`,
  `src/core/pellets.ts`, `coneDirection`,
  `src/core/aim.ts`, `AimController.recordShot`, `AimController.advance` and
  `AimController.applyViewPitchShift`, `src/game/session.ts`, `createSession`,
  `src/game/input.ts`, `adjustLookPitch`, and `src/core/saveFormat.ts`,
  `SAVE_SCHEMA_VERSION`.

  BR (d117-1, 2026-10-07 00:30): “but a note: having skill=10 should be even faster
  at loading and racking - likely 2x as fast”. The shared reload and rack curves now
  live beside `skillZeroHandling` in `src/content/base/recipes.json`, with bounds in
  `src/core/schema.ts`; `src/core/firearmsSkill.ts`, `firearmsSkillEffects`, applies
  them without changing skill-zero time. `src/game/firearmHandling.ts`,
  `FirearmMechanics.load` and `FirearmMechanics.cock`, multiply their existing base
  durations by these shared curves rather than tuning them per firearm. At skill 10,
  each is about half the previous curve's duration; legendary remains clamped to skill 10.
  BR, 2026-10-07 10:23: “yep, feels good” on the handling comparison for PR #343.

  Readied-gait sway and look lag follow firearms skill, while dispersion and recoil remain separate. An unskilled character's readied sway is large with any firearm because they've never handled one; at skill 10, the character hardly sways. Each firearm's skill-zero values set the relative steadiness between guns. Automatic follow-ups sway at least as much as single shots, so sway does not drop during burst fire. Sharing `src/core/footsteps.ts`, `FootstepClock`, keeps the stride-synced path aligned with gait, and content owns the shape and skill endpoints. See `src/core/aim.ts`, `frameFromState`, and `src/core/firearmsSkill.ts`, `firearmsSkillEffects`.

  Mean-reverting Brownian drift replaces stride-eased jitter; the shared walking lune remains separate, and firearms skill continues to scale sway. Mean reversion avoids unbounded drift, while smoothing keeps fixed-tick noise from reading as frame-level twitch. Content owns the noise tuning. Saving the running state lets Continue and replay segments preserve the exact path, avoiding a motion discontinuity in the drift chosen by feel. The vertical/horizontal lune ratio remains independently tunable for BR's shape comparisons; it does not change the OU drift. See `src/core/aim.ts`, `advanceOrnsteinUhlenbeckAxis` and `AimController.snapshotState`, `src/core/saveState.ts`, `snapshotSession`, `src/game/inputReplay.ts`, `encodeInputReplay`, `src/game/config.ts`, `configFromUrl`, and `src/content/base/recipes.json`, `firearms_combat`.

  BR's earlier 2026-10-05 report on the skill scale
  before d83 (#274)—that skill 12 still had "too much dispersion/sway at full auto"—
  led to d62-4 (#262); the later ruling
  separates firearm quality's dispersion from skill-controlled handling.
  The #267 ruling makes ready stance gate firearm fire, prohibits firing while
  sprinting, assigns duck-walk speed to firearms combat and block success to
  melee combat. 3.1 ([SLICE-3.md](SLICE-3.md)) implements those rules. BR
  (d113-1, 2026-10-06 23:51): “i tested the shotgun on gungen/ak-muzzles / issue: when RR
  racking, a readied shotgun returns to unreadied during racking / this happens
  too when loading / i don't think it should”. A held, completed ready stance
  remains active through firearm rack/load handling; raising still takes its
  skill-scaled simulation time. See `src/game/session.ts`,
  `advancePlayerReadiness`. Racking and loading also train firearms handling. A rifle's
  magazine change and charge, and loading a round into a magazine, follow the same rule (d114-2):
  each trains handling, and the first two keep a held ready stance. See
  `src/game/firearmHandling.ts`, `isFirearmTrainingAction`. Until 3.1 lands, aim-sway look comparisons use the current movement rules;
  afterward, moving-fire comparisons use the skill-dependent duck-walk speed.
  d62 leaves practice unawarded until its source is ruled; #275 sets tiered
  training, while tiers for existing sources and above-tier practice remain
  open. The d62 reading of BR's "swing" is look-turn rate; BR's answer to the
  d62 questions triggers reinterpretation. The d62 reading of BR's "reload
  time" is per-shell insertion, not magazine reload; BR's answer to the d62
  questions triggers expansion.
- **Shot impacts (BR, 2026-10-05):** "yes, let's do #1 which is the real gameplay diegesis thing". Each round that meets world geometry leaves a surface mark; marks and dust are presentation, not simulation damage or save state. `src/game/firearmHandling.ts`, `FirearmMechanics.fire`, publishes committed round directions, while `src/render/shotTrace.ts`, `traceShot`, gives marks and debug lines one shared world trace; `src/render/impactEffects.ts`, `ImpactEffects.fire`, owns the bounded display. When a wall lies between the eye and muzzle, starting from the eye leaves the near wall visibly marked even if the muzzle has passed it. The test-house practice prop declares `FurnitureSchema.shotTarget` in `src/core/schema.ts` and is placed by `src/game/worldSetup.ts`, `DebugTestHouseSite.furnitureIn`. BR's firearm ruling, planned in [SLICE-3.md](SLICE-3.md), settles real ammunition and magazine loading plus body-region damage by calibre. Visible shambler marks are desired ("ideally, yes") and await the 3.2 first look.
- **Magazines (3.2, d114):** BR, 2026-10-05 21:04: "magazines are real, you load them one by one, like in dayz". A detachable magazine is an item whose exported model carries gungen's fitted round column. Its calibre and capacity come from that model, as the pump's tube capacity does, so the geometry that fits the rounds also sets how many go in. Its cartridges are item state in feed order, top round first, and save with the magazine; loading pushes onto the top and stripping takes from it, as with a real spring-fed box. Each round loaded or stripped is one handling job, so releasing R loses nothing and the inputs replay deterministically. Hold R loads; stripping is the held magazine's item action, not an R gesture, because R's gestures load, rack and remove (CONTROLS.md, "Reload, rack, remove"). Loading and stripping a round both use the firearms skill's reload factor, extending d62's per-shell reading to per-round handling. See `src/core/magazine.ts`, `magazineSpec`, and `src/game/magazineHandling.ts`, `MagazineHandling`.
- **Rifles (3.2, d114):** A magazine is a child item of its firearm, so removing it preserves its identity and state; nested accessories and batteries use the same ownership. Cartridge data owns calibre-specific damage. A magazine change is one handling motion, so holding R does not repeat it and releasing R does not cancel it. Deadvox hand-authors `chargingHandleDegrees` because Gungen exports no value for it. See `CONTROLS.md`, “Reload, rack, remove,” and `docs/firearm-cycle-playback.md` for the player actions and their presentation; `src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`; `src/core/pellets.ts`, `projectileShot`; `src/core/zombies.ts`, `ZombieSystem.firePellets`; `src/core/magazine.ts`, `magazineWellCalibre` and `slotsReason`; `src/game/firearmHandling.ts`, `FirearmMechanics`; and `src/render/handlingTurn.ts`, `handlingRotation`.
- **Modular weapons (3.7, d118):** Fitted accessories remain complete child items so removal and saving preserve identity, condition and nested contents. Default and fitted models use the same slot-frame contract; connector axes keep distinct attachment shapes aligned without per-kind guesses. Dynamic fitting trusts gungen's certificates instead of duplicating its geometry solver, while rail footprints remain separate because a slot anchor does not describe the full occupied span. These boundaries keep rendering, saves and compatibility consistent. See `src/core/items.ts`, `ItemFactory.create`, `snapshotItem` and `restoreItem`; `src/core/itemTree.ts`, `walkItemTree`; `src/render/itemLook.ts`, `itemLook`; and `src/render/models.ts`, `hideSlotNodes` and `ModelLibrary.attachParts`.

  Optics keep their authored reticle and use one content-authored magnification setting, preserving a recognizable sight picture without adding a cycling input. Magnification stays within gungen's supported range. The digital thermal optic stays out of loot, fitting and ADS until its thermal view exists; exposing an optic without its defining view would mislead the player. See `src/core/opticView.ts`, `opticViewSettings` and `projectLensAperture`; `src/render/opticLens.ts`, `OpticLensRenderer`; and `src/game/firearmAttachmentHandling.ts`, `FirearmAttachmentHandling.fitReason`.

  Gungen's geometry and material export is the single source for attachment mass; `weightOf` uses `massKg` for attachment items, so their required content `weight` is not authoritative. `muzzleLoad` combines fitted attachment mass with mount distance from the grip to feed the existing handling response. Runtime skill-zero tuning remains separate from attachment response so editing a debug endpoint cannot apply the attachment effect twice. Suppressors affect recoil, noise and wear; foregrips affect aim and stance; a powered light nested under a held firearm remains exposed to carried-light and sense behavior and drains its owned battery on simulation time. Effect estimates remain tunable until attachment behavior has been playtested. See `src/core/firearmAttachments.ts`, `muzzleLoad`, `firearmAttachmentResponse` and `wearFirearmAttachments`; `src/game/firearmHandling.ts`, `skillZeroHandlingSettingFor` and `skillZeroHandlingFor`; `src/core/items.ts`, `weightOf`; and `src/core/lights.ts`, `lightExposureFor`. Heat (#366), improvised accuracy, fouling and smoke (#365, all in #367) are deferred until after the playtest.

- **Military loot (3.2):** Restricting magazine-fed firearms and their compatible ammunition to military sources keeps ordinary scavenging from supplying a rifle. Recursive validation covers military items acquired through nesting, repackaging, crafting, salvage and fixed loot. Exported attachments use military loot in playtest 1 without being validation-locked to it, allowing later sites to carry optics. Reachability checks keep authored military sites part of the progression. See `src/core/magazine.ts`, `militaryLootItems`, `src/core/content.ts`, `checkMilitaryLoot`, and `src/core/reachability.ts`, `worldSources`.
- **Spent cases per block:** Save a calibre-specific case count in the block where
  each case lands; this keeps recoverable cases with their actual landing place
  without saving an individual physics body for every shot. A deterministic
  scatter represents the pile visually. See
  `docs/decisions/0006-firearm-handling.md`, `src/game/firearmHandling.ts`,
  `FirearmMechanics.ejectionDrop`, and `src/core/scatterPile.ts`,
  `spentCaseScatter`.
- **Noise** is an event with loudness and position. Sprinting makes footsteps
  louder; melee, gunshots, doors, breaking glass and engines also make noise.
  Walls reduce how far it travels. Zombies hear, investigate and pass noise on
  (see the screamer below), so stealth means managing noise and staying out of
  sight. Suppressor effects apply across firearms through attachment metadata;
  the shot event selects the sample, not another radius. Near hearing ends at the
  scaled base radius, while the far tier follows the listener's hearing model. At
  full condition, a real suppressor brings that far tier to half the unsuppressed
  base radius; an improvised suppressor is louder, and wear makes either louder.
  Keep suppression local to shots so other noises retain their range. See
  `gungen/src/gun/attachments.ts`, `suppressors`;
  `src/core/firearmAttachments.ts`, `firearmAttachmentResponse` and
  `wearFirearmAttachments`; `src/core/zombies.ts`, `hearVocalNoise`;
  `src/game/audioPresentation.ts`, `firearmShotEmission`; and
  `src/game/play.ts`, `fireWeapon`.
- **Player-owned sound playback (d111-1):** BR: “their position in the world is
  the player, and the player is a mobile thing, so”. Character- and held-item
  sounds have the player as their source; listener-relative playback makes them
  move with the player, who is the listener. Simulation sound/noise events keep
  their source positions for zombie hearing, while independent world sources
  remain positional. See `src/game/session.ts`, `playPlayerSound` and
  `playWorldSound`, and `src/game/audio.ts`, `GameAudio.startSource`.

## Damage, destruction and dismemberment

Direction set by BR on 2026-09-28. The aim is an **interesting** damage
system, not just bigger numbers. BR's future direction is: “then at some point
we'll model armor, and different armors have different resistances, like
chainmail vs platemail vs ballistic vest (example only)”. Armour is outside
3.3; its later resistances should enter through per-region, per-type damage
application rather than weapon-class special cases. The neutral per-region,
per-type data slot in `src/core/schema.ts`, `ZombieSchema`, and
`src/core/zombies.ts`, `ZombieSystem.applyMeleeHit`, keeps that handoff open
without modeling armour now.

- **Damage comes in types.** Every hit deals a mix of types, and every target
  resists each type differently. The melee types above (blunt, cut, pierce) are
  joined by, for example, fragment, blast and breach. The kind of damage decides
  the outcome, not just the amount:
  - a hand grenade (fragment plus a modest blast) barely marks a brick wall but
    tears limbs off a shambler;
  - a breaching charge (directional, at contact) destroys a steel door and
    little around it.
- **Blocks and block entities get materials.** Soil, wood, brick, concrete and
  steel, each with durability and a resistance per damage type, as content-pack
  data; a block has no material or durability fields (`src/core/schema.ts`,
  `BlockSchema`). A destroyed block is removed
  with `World.setBlock`. Saves already store changed cells as an overlay on the
  regenerated base chunks (`src/core/saveState.ts`, `SaveSnapshot`), so destruction
  persists without new save machinery; saves grow with the damage done.
- **No structural collapse in the first version.** Blocks left unsupported
  stay where they are. Collapse is a later, separate system.
- **Shamblers have body regions and die only when the head is destroyed.**
  Melee hits apply damage to the posed region they land on; a destroyed limb is
  severed and leaves a prop, while a destroyed head kills. Losing both arms
  prevents new attacks; `canStillAttack` in `src/core/zombies.ts` owns that rule.
  How a legless shambler moves remains open; no crawling behavior is modeled.
  `ZombieSystem.applyMeleeHit` and `ZombieSystem.applyMeleeEffects` own hit,
  death and severing; `src/core/zombieRegions.ts`, `posedShamblerRegionBoxes`, owns
  the posed hitboxes. Region health and severed state are simulation state and
  persist in saves.
- **Determinism.** Hit regions, blast falloff and any spread are seeded, so
  saves and replays stay exact. Region and material state is simulation state:
  it goes into the save snapshot and the source fingerprint.
Still open: the full list of damage types and each material's resistances,
whether wounds bleed or slow a shambler, partial block damage (cracked looks),
blast damage by distance across body regions, explosives and breach charges, and
the sounds for severing and destruction (the audio manifest).

## Light

Nights should be dark, and voxel-lit interiors pitch black, so you have to
bring light. Light is the visual side of noise: it lets you see, and it lets
them see you.

Interiors become darker than the outdoors through voxel light. Diffuse sky light
already goes through the grid; light from sources inside, such as torches and
lamps, doesn't. Until that arrives in Slice 4, don't fake the gap with a
separate interior-darkness rule.
A carried beam remains a three.js light because it moves every frame, unlike
block light. All-around carried and dropped sources use a fixed pool of
shadowless point lights; unused slots stay at zero intensity, and surplus
emissive glowsticks remain visible without lighting the world. An item's lit look
stays on its own model in hand, on the ground and in flight; an emissive marker is
only a fallback when the model cannot be drawn. This keeps glow attached to the
visible item without changing the light pool or zombie sensing reach, or merging
render and sense heights. The marker does not replace pool lighting. Source
colour, intensity, radius and burn rules belong to item content. Tune that content
against the ground and walls under the pool's shared near-field falloff, not
against the glow. The zombie light check keeps sky visibility separate from
carried light, so voxel sky light doesn't change the carried-light rule. The
sun-derived day phase owns simulation sun exposure and blends zombie sight through
twilight, while time-of-day lighting stays in the sky and fog rather than being
baked into chunks; voxel sunlight can then join AO in vertex colour. See
`src/render/flashlight.ts`, `Flashlight.update`,
`src/render/itemEmissive.ts`, `applyItemEmissive`, `src/render/piles.ts`,
`PileMeshes.drawModels`, `drawEmissiveLights`, `src/render/itemThrows.ts`,
`ItemThrows.spawn`, `src/render/lightPool.ts`, `LightPool.update`,
`src/core/lights.ts`, `lightSenseSourceFor`, `SunExposureCache`,
`sunExposedAt`, `src/core/dayPhase.ts`, `dayPhaseAt`, `src/game/session.ts`,
`createSession`,
`isSunExposedAt`, `src/core/zombies.ts`, `seesPlayer`, `src/render/sky.ts`,
`applySky`, and `src/core/mesher.ts`, `buildMesh`.

- **Sources you carry** (the numbers are starting points):

  | Source | Light | Seen from | The catch |
  | --- | --- | --- | --- |
  | Matches, lighter | A small circle | 10 m | Their own fuel is finite; takes a hand |
  | Candle | Small and steady | 15 m | Blows out if you sprint; can be doused and relit |
  | Glowstick | Dim, green | 15 m | Used once; stays lit when stowed or dropped |
  | Headlamp | A weak beam | 30 m | Batteries; leaves both hands free |
  | Flashlight | A beam, instant on and off | 40 m along the beam | Batteries; takes a hand |
  | Lantern | Bright, all around | 50 m | Bulky; can be set down |
  | Torch | Bright, all around | 60 m | Needs a firestarter; can be doused and relit while fuel remains |
  | Road flare | Very bright, red | 80 m | Used once; can be thrown |

- **Being seen.** Zombies see a light in their view cone from much further than
  they see you in the dark (the "seen from" column), and they see you when
  you're lit, by your own light or anyone else's. Pointing a flashlight down or
  covering the lens shortens the distance.
- **Lit buildings are beacons.** Light through doors and windows can be seen
  from outside. A lamp in a house at night draws attention unless the windows
  are covered or boarded.
- **Light as a lure.** A thrown flare, a glowstick or a fire pulls zombies
  towards it, the way noise does, which can clear a path. The lantern zombie
  works the same system against you.
- **Making and keeping light:** torches and candles are crafted (rags, sticks,
  wax, fuel), batteries are scavenged and later charged, and fixed lamps need
  power (see [Base building](#base-building-and-electricity)).
- **Hands:** most lights take a hand, which matters with a two-handed weapon.
  The headlamp frees them, at the cost of a weaker beam.

## Held-item throws

A throw preserves the held item's identity and state through flight and landing, so fitted parts, loaded ammunition and a lit glowstick remain the same item rather than a throw-specific copy. Item mass limits its range through arm speed and energy. The flight presentation uses the ground item's look, keeping firearm attachments and light markers visible; the handling HUD makes force and the release minimum legible. See `src/core/itemThrow.ts`, `throwDistanceForItem` and `traceItemLanding`, `src/render/itemThrows.ts`, `ItemThrows.spawn`, `src/ui/hud.ts`, `handlingViewModel`, and `src/game/play.ts`, `throwHeldItem`.

Mass limits range so a light item does not fly as far as a heavy one; when #368 adds atmospheric drag, it can further limit light items without replacing that mass-based limit. Throwing adds no hit damage or landing lure.

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

### Spawning

BR ruled (2026-10-06 15:42, d102):

> let's do it as - (a) Time-windowed spawn markers, as a general rule. A marker in the map or a template can carry a time window, such as "from dusk". It spawns once its chunk is loaded ...
>
> but we will want scriptability in future, but not for jump-scares necessarily, but e.g. a computer panel opening up some door or other dynamic events

A marker's optional clock window delays its one-time spawn; `src/core/zombieSpawns.ts`, `ZombieSpawner.onColumn`, queues each windowed marker, and `ZombieSpawner.advance` checks its window on zombie ticks while the column stays loaded. Since a load never spawns a windowed marker, live play and replay agree at a window edge. Windowless markers keep chunk-load behavior. Bounded windows recur daily, so a marker that missed one remains eligible at the next opening instead of expiring: a playtest threat should not be lost because the player was elsewhere when its window passed, and may arrive the next evening. An open-ended `from` is eligible from day 1's occurrence of its boundary onward, so a run started after that occurrence is already eligible. Once spawned, its saved ledger entry prevents it returning when the window closes or after it is killed. This timing serves authored beats without scripting a player action. Scriptable dynamic events, such as a computer opening a door, remain future work in #313.

### Amalgam body and damage (#308)

The amalgam is a debug-only type until the authored camp spawn in #308 is designed. Its `amalgam_*` sound events have separate identities but reuse shambler recordings; an authored type pitch multiplier overrides the ordinary body-height rule so the fused creature can keep a distinct low voice. See `src/content/base/zombies.json`, `soundPitchMultiplier`, `src/core/schema.ts`, `ZombieSchema`, and `src/game/session.ts`, `admitSound`. Deadvox realizes its mobgen body from the saved figure seed and uses the part manifest as the authority for collision bounds, member-owned hit regions and severable roots; it does not maintain a second hand-written anatomy list. The axis-aligned collision envelope follows the realized voxel bounds, with independent X/Z extents, so walls, fences, closed doors and solid containers block the whole visible creature without relying on an arbitrary humanoid radius. Its empty corners are the deliberate broad-phase simplification; member hit boxes remain voxel-derived and independently targeted. The amalgam's no-jump rule is authored in its type data, so fence and container blocking does not depend on the jump probe's position relative to its broad collision envelope. See `src/content/base/zombies.json`, the amalgam type; `src/core/schema.ts`, `ZombieSchema`; `src/core/zombies.ts`, `ZombieSystem.stepZombieBody`; `src/core/amalgamFigure.ts`, `amalgamFigure` and `amalgamCollisionEnvelope`; `src/core/zombieRegions.ts`, `posedAmalgamRegionBoxes`; and `src/core/physics.ts`, `Body` and `overlapsBlock`.

The amalgam's `bodyScale` is authored in `src/content/base/zombies.json` because the creature read far too small in play. The zombie section contract in `src/core/schema.ts`, `SECTION_DESCRIPTOR`, requires that authored scale for the model, following `docs/decisions/0004-content-language.md`. The same scale feeds the rendered body, collision envelope, posed hit regions and melee reach through `src/core/amalgamFigure.ts`, `amalgamFigure`; `src/core/zombieRegions.ts`, `posedAmalgamRegionBoxes`; and `src/core/zombies.ts`, `zombieAttackReachMetres`.

Severing a shambler member removes that member's hit regions and its contribution to attacks and reach; the core and every other member continue unchanged. `activeAmalgamMembers` determines which members remain capable of attacking; `zombieAttackReachMetres` disables reach when none remain and keeps shared reach while any member survives. The save records each manifest region's health and severed member IDs, then reconstructs geometry from the saved figure seed. `src/core/zombies.ts`, `ZombieSystem.applyMeleeHit`, `activeAmalgamMembers` and `zombieAttackReachMetres`, and `src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`, own that handoff. Initial member-health values inherit the shambler region values in `src/content/base/zombies.json`, keeping authored anatomy consistent; reviewing the realized body can identify any needed tuning.

The core's authored health keeps a center-mass pump blast from ending the fight immediately, while each fused member keeps its own damage regions and can be severed by focused fire. The resulting shell count is balance tuning, not a fixed gameplay contract; `test/amalgam.test.ts` protects survival of a blast and member loss before core death without pinning that count. See `src/content/base/zombies.json`, `amalgam.regions`, and `src/core/zombies.ts`, `ZombieSystem.firePellets`.

The amalgam reuses `ZombieSystem`'s perception, attention, movement and attack lifecycle: it wanders slowly until it notices the player, then takes a direct, heavy approach, telegraphing its more severe attack before damage resolves. Its pace and attack severity live in the zombie type data rather than a scripted phase or code default. A hit snaps the shared `core` pose so the fused body reacts as one while renderer and hit-region FK stay aligned. See `src/content/base/zombies.json`, the amalgam type; `src/core/zombies.ts`, `ZombieSystem`; and `src/core/zombiePose.ts`, `posedShambler`.

For #424, debug-spawned amalgams start beyond their type-scaled attack reach so the preview shows the approach rather than beginning in melee range. The debug placement also uses the realized collision envelope, avoiding spawns embedded in nearby solid geometry. This changes the preview's starting distance, not the amalgam's attack reach or chase pace. See `src/debug/shamblerSpawning.ts`, `spawnZombieType`; `src/bench/shamblerPlacement.ts`, `placeShamblerRing`; and `src/core/zombies.ts`, `zombieAttackReachForType` and `zombieBodyDimensions`.

A surviving amalgam attacks with a tentacle that strikes in a straight line from its core to the player's chest, at any height, within its usual reach; anything solid across the line blocks it. A creature with a long tentacle should be able to reach a player standing above it, on a roof for example, and not only one level with it. The reach stays the same, so height costs distance rather than adding range. Humanoid zombies keep their grab: horizontal reach within a band matching a standing player.

The line starts at a fixed interior point of the core at rest pose, so the simulation's check and the rendered tentacle start in the same place; the render follows the posed core, so the two part only during a hit flinch. A fixed point also keeps a change in the player's bearing from moving the root between the core's lobes. The tentacle extends along the line through wind-up and strike, then retracts, capped by the same reach; it adds no collision, hit region or saved state. See `src/core/zombies.ts`, `withinAttackReach`; `src/core/amalgamFigure.ts`, `amalgamStrikeOrigin`; `src/render/amalgamTentaclePose.ts`, `amalgamTentaclePose`; and `src/render/mobActors.ts`, `MobActorMeshes.updateTentacle`.

A damaging hit on the amalgam knocks a chunk of flesh out of it and leaves a hole. The hole starts at the first visible flesh voxel the shot reaches: the impact point from the region-box hit test maps into the figure's rest voxel grid, so there is no second hit test. A severed member's voxels went with the member, so a shot passes through where they were, as the hit test and the renderer do. Every damaging hit takes at least the struck voxel, and the type's carving rule adds every visible flesh voxel within a radius that grows with the hit's damage, up to a cap. The rule is tuned so a full close shotgun blast to the centre knocks out a chunk several voxels across, which reads on a body the amalgam's size; a lighter hit takes less, down to the struck voxel. One shot's pellets make one hole per amalgam, sized by their summed damage and centred on the struck voxel nearest their middle: one shot reads as one chunk, and pellets along one line can't tunnel through the body. The core voxel the tentacle roots in is never removed, so the core always keeps flesh. See `src/content/base/zombies.json`, the amalgam's `carving`; `src/core/schema.ts`, `ZombieSchema`; `src/core/amalgamCarving.ts`, `carveAround` and `protectedCoreCell`; and `src/core/zombies.ts`, `ZombieSystem.carve`.

Holes are cosmetic: they show the damage without changing combat. Damage, region health, severing and later hit tests use the region boxes of the whole body, as they would without holes; `test/amalgam.test.ts` compares a hit sequence with and without carving. A hole is still simulation state, the amalgam's removed voxels as `Zombie.carved`, so it is deterministic, survives a save and replays, and a later rule could read which flesh is gone. A restore refuses holes no play could make: a cell outside the grid or without flesh, the protected core voxel, or any hole on a type that doesn't carve. See `src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`, and `src/core/zombies.ts`, `ZombieSystem.restoreState`.

The renderer rebuilds a holed amalgam's mesh without its removed voxels, and the faces the hole exposes take the type's interior colour. They are marked as wound faces (`CARVED_NEIGHBOUR`) so gore can find them later; gore covers the amalgam as it does shamblers, since the amalgam is fused from them. The removed voxels fly off along the shot as a render-only rigid chunk that lands, lies, sinks and is removed, with a cap on live chunks. Neither the chunk nor the rebuilt mesh enters the simulation, and the corpse keeps the holes. See `src/render/amalgamFlesh.ts`, `buildCarvedGeometry` and `FleshChunks`, and `src/render/mobActors.ts`, `MobActorMeshes.zombieCarved`.

Slice 3.8 adds the runner and crawler before horde-specific types: the runner makes
sight-driven pursuit an immediate sprint threat, while the crawler uses the body's
leg region as its attack target. Keep their selection, attack target and sound
mapping authored with the type; see `src/content/base/zombies.json` and the spawn
markers in `src/content/base/templates.json`. Type weights scale authored marker
chances and choose hamlet wanderers, keeping rarity a content property rather than
an inference from generated counts.

BR's crawler ruling (2026-10-06–07): the question was whether the crawler should be
(a) a prone ground-crawler dragging itself on its arms with trailing legs, (b) a
low, hunched humanoid on all fours, or (c) a short, hunched humanoid variant.

BR (2026-10-06 21:46):

> “okay, yeah runners, I see when I spawn them now; but crawlers I'm not sure - aren't they supposed to be crawling?”

BR (2026-10-06 21:49):

> “crawler: (A)” / “the other variants you mention are other mobs, not yet defined, but each having their place in the roster at some point”

The other two forms are future mobs, not crawler variants. BR's follow-up asked
whether the crawler should retain full legs or have stumps, and noted the hovering.
BR (2026-10-07 00:18):

> “1. i'm thinking it shouldn't have full legs / and it looks to be hovering a bit over the ground, so that might be an issue”

After the stumps were shown, BR's question was whether their shape read correctly,
while the pose still hovered. BR (2026-10-07 00:37):

> “thigh stumps look good / but still hovering: Screenshot_2026-10-07_00-37-27.png”

BR (2026-10-07 10:03) approved the grounded static pose. The body uses
`mobgen/src/mob/humanoid.ts`, `amputateCrawlerLegs`, and the static pose uses
`mobgen/src/mob/crawler.ts`, `crawlerPose`. The same ruling requested:

> "#325: good! It's now not hovering - but another issue was prominent now: it needs to look at the player's \"eyes\" (camera). And all mobs should do that by default. I.e. turn their heads such that they are \"looking\" at the player"

BR clarified on 2026-10-07 12:33: “as for #325: looking good, but it's important they do so only when they perceive the player”. BR answered on 2026-10-07 13:08: “I'd say yes - best case would be to add some jitter, because it's reasonable that a person/creature turns their head towards what they're hearing, but sometimes they might turn the head so that the ears are in the 'hearing direction' - but to keep things simple for now, maybe we can add a bit of jitter so that it's not exact when the perception is hearing only”. The ears-toward-sound behavior is a possible later refinement; hearing gaze uses deterministic jitter around the heard point. BR answered the br-17 lure-light question for d130 on 2026-10-07 16:29, verbatim: “d130: as recommended -> yes”. The chosen option was “they look toward any light they notice (a lure works like a sound); the label reads 'notices something'”. A visible lit light, carried or lying in a pile, shares the near state and draws the gaze. `perceptionLabelFor` distinguishes the player's position from another near source by comparing `lastPerceived` with the current player's horizontal position, without adding source state. BR reported at 13:33, verbatim: “it's kinda hard testing (#325)” / “because if i see them (good enough to make out details) they generally see me too, which defeats the test”. The spectator camera, perception labels, hidden-shambler fixture and test-noise action make that boundary observable without moving the simulated player to the camera.

BR's perception-directed gaze ruling makes sight, hearing and noticed lights legible without giving presentation ownership of the simulation. Gaze, labels and spectator-camera movement stay out of hit geometry, saves, replay and simulation fingerprints; the debug test-noise action is different because it deliberately enters the simulation's sound path. The mobgen viewer has no perception state, so its gaze follows its camera. A crawler's posture changes where hits land: its drag gait and runner/crawler flinches follow the posed hit regions, changing hit geometry and replay compatibility without adding saved state. Gameplay stagger, slowdown and knockdown remain open for BR. Generated support validation protects the grounded silhouette. See `src/core/zombies.ts`, `ZombieSystem.updateAttention`; `src/render/mobActors.ts`, `MobActorMeshes.posedFrame`; `src/core/zombiePose.ts`, `posedShambler`; `mobgen/src/mob/crawler.ts`, `crawlerGaitPose`; `mobgen/src/mob/lookAt.ts`, `lookAtPose`; `mobgen/src/viewer/main.ts`, `applyLookAt`; and `mobgen/src/core/generate.ts`, `resolveSupportBones`.


Later (after playtest 1): #370 covers hesitation and pursuit decisions on non-violent sounds; #371 covers nearby shamblers taking interest in a pursuing shambler's hunting sound.

### Evolution

A zombie can change into a tougher type after enough game days. Where it lives
decides the options: near labs they turn weird, around military sites they
toughen up. This is the game's long-term clock: the longer you survive, the
worse the world gets.

### Senses and AI

- **Senses:** sight (a view cone and range, blended smoothly from day range to
  night range through twilight and reduced when you crouch), hearing (noise events)
  and smell (a trail the player leaves, which rain washes out). The base pack's
  latitude, fixed date and nautical-twilight choice own the sun-derived day phases;
  the date and any seasonal change remain BR's decision. Hordes roam from sunset
  through dusk, night and dawn until sunrise, and spawn words resolve from those
  same boundaries. Terrain height alone should not end a clear pursuit; sight
  over a rise is bounded by occlusion, not by spending range on vertical distance.
  See `src/core/dayPhase.ts`, `dayPhaseAt`; `src/core/zombies.ts`, `seesPlayer`
  and `ZombieSystem.updateHordes`; and `src/core/clock.ts`, `parseSpawnTime`.
- **Movement (BR, 2026-10-05 20:27–20:33):** “also, it's still the case that the shamblers are stalling when the player moves”; “i think we should greatly simplify how the shamblers brains work”; “they aren't smart creatures”; “they beeline towards whatever grabs their attention”; and at 20:33, “yes, I think we should make them primarily beeline and slide off of obstacles like walls / if low enough, they prefer jumping over / but they should have some randomness in that even if they normally beeline, when they hit an obstacle they might just randomly wander a bit - e.g. pick an open direction and try to walk 10 meters (for example) / but if something bashable is in the way, they would tend to bash it (e.g. doors) / (what is bashable is depending on the strength of the mob - but we haven't modelled this, right? I mean a 2nd evolution brute might breach a brick wall, for example)”. A shambler moves directly toward its current attention target in the horizontal plane. Collision resolution preserves available tangential motion; when a head-on intent has none, `ZombieSystem.tick` uses the seeded `obstacleSlideSide` to supply it. `canJumpObstacle` gives low obstacles a jump attempt. On some obstacle contacts, `ZombieSystem.tick` selects a tested open heading from the shambler's seeded behavior stream, walks the distance configured in `src/content/base/zombies.json`, then resumes toward its current target. There is no route planning, stair traversal or waiting for a route. Height changes are handled only by ordinary collision and jumping. See `deadvox/src/core/zombies.ts`, `ZombieSystem.tick` and `openWanderHeadings`.
- **Height (BR, 2026-10-05 20:29):** “but yeah, heightwise (Y axis) it may be a bit difficult. Maybe we should just let them wander at some point, rather than intelligently traverse Y-levels”. Shamblers do not gain stair knowledge from an attention target on another floor.
- **Seen prey (BR, 2026-10-05 21:52–21:53; #281):** “well, when i stood there high on the slope, the shamblers tracked and pursued, but since it's steep, they'd stop and wander off for a bit, even though they'd reasonably would "see" me (given that there were no obstacles, other than the steep climb)”; “i'd lean (A) because it feels most reasonable for the shambler mentality that if they _see_ their prey, they just go after it straight”; “but still sliding”. For #281, visible prey suppresses obstacle wandering; an active wander ends when the prey becomes visible, and the shambler resumes beelining while retaining its slide. Unseen targets and idle strolling can still wander. See `deadvox/src/core/zombies.ts`, `seesPlayer` and `ZombieSystem.tick`.
- **Simulation structure (BR, 2026-10-06 06:14; d93-1):** “Start with a refactoring trial on the worst offender”. The named phases in `src/core/zombies.ts`, `ZombieSystem.tick`, make the established order reviewable because later steps consume state produced by earlier simulation steps; keep that order when changing the per-tick behavior. See `ZombieSystem.updateAttention`, `ZombieSystem.stepZombieBody`, `ZombieSystem.updateObstacleContact`, `ZombieSystem.resolveZombieAttack` and `ZombieSystem.emitFootsteps`.
- **Attention and attacks:** Sight, hearing, `lastPerceived`, chase/investigate transitions and `withinAttackReach` remain the authorities for choosing and acting on targets. Far-hearing direction stays uncertain: a grounded listener projects it onto known terrain rather than learning the source's height. See `deadvox/src/core/zombies.ts`, `seesPlayer`, `farBearingTarget` and `withinAttackReach`.
- **Background movement (BR, 2026-10-05 21:32):** “yes”: background zombies beeline in big, cheap steps.
- **Distant attention and noise persistence:** A horde retains a heard noise target until it arrives or forgets it; its sun-derived preference for home or roaming does not replace an active noise target. Once the target ends, the horde roams only from sunset to sunrise. A background zombie with no horde or stimulus uses idle behavior instead of treating the player as an implicit target, because distance alone must not make an unseen zombie pursue. See `src/core/zombies.ts`, `ZombieSystem.updateHordes` and `ZombieSystem.tickBackground`.
- **Stimulus memory:** Individual zombies and hordes forget unreachable stimuli after the shared content duration, counted in simulation seconds, so compression affects elapsed wall time. The stimulus timestamp is saved so loading does not restart the wait. A horde resumes the sun-derived roam or home behavior after forgetting. Whether this duration should be real time or game time remains BR's open question. See `src/core/schema.ts`, `ZombieSchema`; and `src/core/zombies.ts`, `ZombieSystem.updateHordes` and `ZombieSystem.forgetIndividualStimulus`.
- **Background cadence persistence (d104-4):** Save/load resumes the background scheduler's actor phase so a mid-cycle save does not reorder attention and movement updates. See `src/game/session.ts`, `zombie-background`.

- **Level of detail:**

  | Tier | Where | Simulation |
  | --- | --- | --- |
  | Active | Nearby actors | Detailed AI, body physics and beeline movement (implemented) |
  | Background | Distant actors in loaded chunks | Reduced-rate, collision-resolved beeline toward attention (implemented) |
  | Abstract | Actors in unloaded chunks | Hordes moving as groups on the region map (Slice 4) |

  For Slice 3 milestone 3.9, keep loaded distant actors in the same store and
  switch their update schedule by derived proximity and terrain availability.
  The hamlet's first group shares noise-driven targets and drifts at night, but
  remains individual actors rather than a region-map abstraction. Save the
  group's target and random stream with member offsets so noise response and
  roaming continue after load; derive the tier again instead of saving it. This
  keeps the terrain collision authority live and avoids persisting a navigation
  field. See `src/core/zombies.ts`, `ZombieSystem.tickActive`,
  `ZombieSystem.tickBackground` and `ZombieSystem.addHorde`; and
  `src/game/session.ts`, the `zombies` and `zombie-background` scheduler systems.
  Abstract hordes remain Slice 4 work. Shared flow fields and crowd navigation
  are dropped from the Slice 3 plan. d84's beeline brain replaces the route
  follow-up in [#244](https://github.com/roobie/skelly/issues/244).

BR said “defer the bashing” (2026-10-05 20:36). For #273, bashing waits until mob and obstacle strength exist; closed doors remain obstacles like walls. If #273 supplies those strengths, the bash decision belongs at `obstacleContact` in `ZombieSystem.tick`. See `deadvox/src/core/zombies.ts`, `ZombieSystem.tick`.

**Decided (BR, 2026-10-04; background to #273):**

- “At some point we will make everything destructible. Door, walls, appliances,
  furniture et[c] and yes, normal doors should be possible to breach by an
  ordinary shambler, given enough time. But the overarching idea is to keep it
  pretty aligned with how CDDA works”
- “to answer the question here and now: no, let's not make shamblers breach
  doors”

Destructive-door behavior awaits a gameplay contract and modeled mob/obstacle strength; it is not implied by movement. See `deadvox/src/core/zombies.ts`, `ZombieSystem.tick`.

### Models

Blocky figures with rigid limbs and keyframed animation. This is where skelly's
skeleton roots come in: a zombie's body is a small assembly of connected parts.

## Base building and electricity

- **Construction is crafting that places blocks and block entities:** walls,
  doors, barricades, furniture, workbenches, machines. Deconstruction is
  disassembly.
- **Doors and locks.** A matching key opens a locked door quietly; a crowbar is the noisy fallback. Prying takes 15 seconds of simulation time at mechanics 0 and 7.5 seconds at mechanics 10, with 30 strikes. It uses the existing mechanics skill, runs outside time compression, and destroys the padlock when complete. The handling-progress option shows its progress. A normal-speed interruption stops the pry with progress kept and input free. Bashing is deferred because mob and obstacle strength are not modeled; closed doors block shamblers like other solids. See `src/core/prying.ts`, `pryPlan`, `src/core/longAction.ts`, `LongActions.beginPrying`, `LongActions.interruptPrying`, `src/core/sim.ts`, `Simulation.checkInterruptions`, `src/game/play.ts`, `renderPlayHandling`, and `src/ui/hudOptions.ts`, `handling`.
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

**The goal, decided (BR, 2026-10-06).** BR set the goal at 17:01, while agreeing to a
design review of the vehicle spike: “But let's first agree on what the goal is: darker_yet's vision is more or less
what we're after. We want as much modularity as possible in the end, and the vehicle aspect
of the game shall be very deep - maybe not 'my summer car'-deep, but very flexible and
customisable”. On the lead's draft of the points below (17:13): “yes, your take on the
vehicle goal is good; draft approved”. The draft draws on the darker_yet fitting seed, the
darker_yet crafting seed and darker_yet spike 005.

Vehicles are built, not picked. A vehicle is a set of typed parts fitted on a
vehicle-local grid. How it looks, holds together, runs, handles, sounds, breaks and gets
repaired all comes from which parts are fitted, where, and in what state. The vehicle
spike tests the part model against this goal, and its reasons are in
[docs/vehicle-spike.md](docs/vehicle-spike.md).

1. **A car builder, not a car customizer.** Parts attach by capability, not by sockets a
   designer laid out in advance: a wing mirror needs a mountable vertical face, and a
   door, a halfboard or a plate the player welded on can all provide one. Players can
   then build things the designers didn't foresee. For that, the spike's vehicles own
   their fittings rather than switching a designer's list on and off (BR, 2026-10-06
   18:07; see [docs/vehicle-spike.md](docs/vehicle-spike.md), "Catalogue, blueprints and
   vehicles"): `src/vehicles/model.ts`, `VehicleInstance`.
2. **Fitting answers four separate questions:** what may go here (slot and layer); what
   holds it up (a set of supports, which also decides what can be removed); by what
   (skill, tools, materials and time to install, remove and repair, because building and
   repair are crafting); and what it's for (the capabilities it provides). The spike's
   supports are `src/vehicles/model.ts`, `Fitting.supportedBy`.
3. **Two layers.** A part type is immutable content that mods can extend. A fitting is
   that part on this vehicle, with its own state: condition (intact, damaged, badly
   damaged, broken) and attachment (attached or ripped off). Collisions damage the parts
   that hit something. The spike's layers: `model.ts`, `PartType`, and `VehicleInstance`,
   whose own fittings are where that state goes.
4. **Networks at the fidelity play needs.** Steering is a per-part property. Drive is a
   per-axle driven flag, so front, rear or all-wheel drive is a build choice. Power and
   fuel are vehicle-wide pools: is there a charged battery, is there a tank with gas. The
   fuel tank is a liquid container, and the battery is part of the electricity system,
   which is a graph with batteries as nodes at base scale (see
   [Base building and electricity](#base-building-and-electricity)) and one pool inside a
   vehicle. A real connection graph is used only where the routing itself is gameplay.
5. **Behaviour comes from the build:** mass, centre of mass, noise and handling, then
   fuel use, protection and storage. Vehicles make noise, and driving is fast and loud.
   BR (2026-10-06 16:28): noise is “mainly a property of the engine, but the chassis/hull
   can factor in too”; the spike reads that as the engine being the source and the hull
   damping it ([docs/vehicle-spike.md](docs/vehicle-spike.md), "Noise comes from the
   build"). See `model.ts`, `measure` and `noiseRadius`.
6. **Parts are items.** A removed part becomes an item carrying its type and condition
   (the `vehiclePart` component, see [The item model](#the-item-model)): salvage it,
   carry it, refit it. A vehicle can be pieced together from wrecks. So a part type's id
   names one type across all vehicles: `src/vehicles/catalogue.ts`, `CATALOGUE`.
7. **Data-driven and moddable.** Part types and vehicles live in schema-validated content
   (see [Content and modding](#content-and-modding)), and a mod adds parts without code.
   The spike keeps its part types content-shaped for that: `src/vehicles/voxels.ts`,
   `ShapeOp`.
8. **The grain is "a part a player would name and swap":** wheel, door, engine, battery,
   seat, bull bar. No bolts, wire runs or plumbing as separate things.
9. **Cheap at scale.** A street of parked cars costs little to draw, and editing works
   part by part.

**Open, deliberately (not part of the goal yet):**

- **Driving-physics fidelity.** The plan so far: a rigid body with a box collider for
  each part, ray-cast wheels with suspension, and arcade handling first. Rapier (a
  WebAssembly physics engine) is the candidate; see
  [CHALLENGES.md](CHALLENGES.md#8-vehicles-on-voxels) for driving over terrain that rises
  in 0.5 m steps.
- **Whether vehicles are voxel-destructible.**
- **Vehicles as an enclosure** (gas-tight, a shelter).

## Content and modding

- **Content types are defined with Valibot schemas,** chosen for its bundle
  size. The schema gives both the TypeScript types and the runtime validation.
- **Packs.** A pack is a folder of JSON files. The base pack loads first; mods
  load after it and can add new ids or override existing ones. Ids are strings,
  namespaced by pack when they would clash (for example `base:shambler`).
- **Every kind of content goes through the same validator:** blocks, shapes,
  items, recipes, loot tables, templates, zombie types, vehicle parts, sounds.
  It reports references to missing ids.
- **Versioned saves.** A save records which packs, and which pack versions, it
  was made with. Ids that no longer exist are kept as "unknown" rather than
  dropped (see [CHALLENGES.md](CHALLENGES.md#7-saves-and-migration)).

## A world that feels real

BR, 2026-10-03: the world should feel like a real place that was left behind, not
a set. A place feels real when things happen in it that the player didn't cause,
and when it answers what the player does. Each layer below should also do
something in play, not only decorate it.

- **Vegetation:** trees, shrubs, hedges, tall grass, and overgrowth a few weeks
  old: gardens gone wild, weeds through cracked asphalt, leaves blown into open
  doorways. What it does in play:
  - **Cover (BR, 2026-10-03):** leaves and hedges are passable but opaque to
    zombie sight, player aim and LOS. Trunks/branches are solid and opaque.
    Movement rules apply to player, zombies and physical bodies alike. A hedge
    hides you without trapping you. Passive cover remains world geometry while
    crouch is player state, so the stance does not change foliage opacity; this
    keeps visibility rules attached to the obstacle rather than making scenery
    appear or disappear with player input. `src/core/zombies.ts`, `seesPlayer`
    and `hearingTier`, own the stance's visibility and hearing effects.
  - **Noise:** pushing through a bush admits positioned rustle and hearing
    together through F4, on entry and a moving cooldown, faster/louder when
    moving faster. Leaf litter changes footsteps (`footstep_leaves`). Leaves do
    not muffle either simulation hearing or WebAudio, and do not obstruct
    melee/bites; they still obstruct ray picks. These are the lead's defaults,
    which BR may override.
  - **Materials:** branches and felled trees give sticks and wood, the same
    materials loot gives in Slice 2.
  - **Movement and landmarks:** solid trunks channel movement for you and the
    dead; passable hedges conceal it. A lone big tree is a landmark.
- **Motion:** cosmetic wind moves foliage and loose debris, and rain falls
  (Slice 4). It makes exposure and the weather readable, rather than leaving a
  world that reads as paused. Wind here is render and audio ambience, not
  another simulated weather system beyond version 1's rain and temperature.
- **Sound of the place:** wind in the trees by biome, birds by day, insects at
  night, a building settling, and the distant sounds from the simulation (see
  [Audio](#audio)). **An idea for BR, not accepted:** birds going quiet, or
  taking off, when something comes near. If adopted, it responds to an actual
  nearby cause, never to a timer or a guaranteed enemy alarm, so it stays a
  warning the world gives rather than one the UI gives.
- **Dilapidation:** built things show abandonment through collapsed sections,
  breaches, slumped or missing segments and rubble. A passable breach is a real
  route, so each authored site names the gaps a player can cross. New structures
  and reworks follow this direction, starting with the camp walls in #385;
  retrofitting existing structures is tracked in #396. See
  `src/content/base/camp.json`, `camp_wall_run`, `camp_gate`, and
  `camp_gate_return`.
- **Wildlife as scenery:** birds, crows on the dead and flies help the player
  read the place, the bodies and the decay. They're environmental cues, not an
  animal ecology, hunting or farming in version 1 (EPIC.md, "Not in version
  1").
- **Time passing:** authored overgrowth, and dust and leaves indoors, show the
  weeks since people left. Food rotting changes what's still worth scavenging.
  There is no plant-growth or dust-accumulation simulation.

Building weathering gives each site a render-only mood without changing simulation or shared geometry: fairly kept points of interest benefit from restrained change, while long-abandoned places need a general overgrown and dilapidated look. Named profiles let sites choose between those treatments, and blending grime, streak and moss over the surface preserves its material hue and texture. A bound below full replacement prevents weathering from erasing the base material. `src/core/schema.ts`, `WeatheringSchema`, validates profiles; weathering remains render-only, while #396 covers building-geometry changes.

**Rendering and performance.** There will be a lot of trees (BR), so foliage gets
a performance plan from the start rather than as a fix later:

- **Near the player,** trees use trunk, branch and leaf blocks in the voxel
  grid. Their movement and sight behaviour is explicit; richer foliage rules
  and cutting come in their scheduled slices. Solid and cut-out leaves are
  measured on the same forest workload, including meshing, overdraw, shadows
  and memory. Neither is assumed faster in advance.
- **Far away (Slice 4),** simplified tree shapes are planned in the far-terrain
  meshes (see [Rendering](#rendering)), aiming for a forest that still reads as
  one at 512 m. That distance and its cost are unmeasured. Neither far-tree
  detail levels nor grass instancing is part of Slice 2's sneak peek.
- **Grass tufts and small plants** that have no effect on play are instanced
  decoration, not blocks.
- **A forest workload in the benchmark,** like the stress-test city, keeps every
  step measured on the reference laptop.

## Rendering

The current state of the look, and its open items, are in [GRAPHICS.md](GRAPHICS.md).

- **The look:** per-block colour and procedural surface patterns, with weathering layered through `src/render/chunks.ts`, `chunkMaterial`, plus ambient occlusion and fog. The palette is muted and grey; the saturated colours are the ones that mean something: warning signs, blood, fire and the glow of hot zombies.
- **Day and night** follow one sun model derived from the base pack's latitude,
  fixed date and nautical twilight. The sky and fog follow the resulting phases;
  light and night looks blend through dusk and dawn, and a flashlight matters
  most in full night.
- **The night sky:** the moon and stars show on clear nights. The moon goes
  through its phases over about a month of game days. On a clear night near
  full moon you can see shapes and find your way outdoors without a light; on
  a new moon, or when it's overcast, you can't. Clouds hide the moon and stars.
- **Voxel light**: light spread through the block grid, so that inside buildings
  it's pitch black at night and dim by day, lit only by what comes in through
  doors and windows. Only diffuse sky light goes through the grid
  (`src/core/skylight.ts`, `buildSkylight`). The sun and the carried beam are lit
  on their own, and carried or dropped sources are the pool's shadowless point
  lights (`src/render/lightPool.ts`, `LightPool`; see "Light"). Light from
  torches, lamps and hot zombies through the grid is planned for Slice 4, with
  the interior light "Light" describes.
- **Far terrain:** chunks beyond the near radius switch to low-detail meshes.
  The targets are 96–128 m near detail and 512 m or more of far terrain; to be
  measured.
- **Zombie bodies:** each mobgen model/seed variant owns a block of pose rows,
  one per drawn actor. Missing per-actor rows leave the shared bone texture
  unable to place that actor's mesh in the world. Each live actor with an
  allocated row keeps its root placement current on every sync, including while
  off-screen; its cached pose moves the bones with that root until full pose
  packing resumes. Skipping both left stale bones in rows still drawn by the
  instanced mesh, so re-entry could snap by the movement accumulated while
  culled. A despawn or streamed unload can reuse a variant row, so the new actor
  must build its own pose before drawing. See `src/render/mobActors.ts`,
  `MobActorMeshes.syncZombie`, `test/runnerRenderContinuity.test.ts`,
  `runEngagement`, and `test/mobActors.test.ts`, `MobActorMeshes`.
- **Sun-shadow quality (BR approval, 2026-10-05):** “Markedly better, but there
  is still a little jaggedness. But we won't pursue this more right now, so I'll
  approve it.” The remaining jaggedness is a known limit BR chose not to pursue.
  Favor a stable edge near the player over sharp shadows far beyond them; see
  `src/render/shadows.ts`, `sunShadowTexelSize` and `Shadows.update`.

## Audio

Sound is the main way threat arrives, so it's part of the simulation, not
decoration.

- **The player should be able to judge a threat by sound:** where it is, how
  many there are, and what they're doing. Sounds come from their source; walls
  muffle sound travelling through the world, so the player can hear danger
  before seeing it. A player's own source moves with them. Noise events (see
  [Combat and noise](#combat-and-noise)) keep that source position for zombie
  hearing and the shared occlusion model.
- **A shambler's presence should be audible even when it stands still.** It
  should sometimes moan or groan so the player can hear that one is there.
  `shambler_idle` provides an occasional groan while idling or strolling. Each
  shambler's vocals and body-made sounds shift lower with its realized body
  height, so larger figures sound heavier and the runner/brute templates inherit
  the same law. `src/game/shamblerAudio.ts`, `shamblerBodyPitch`, interpolates one
  power curve between the pool's smallest and tallest realized bodies. The
  smallest anchor is 1.2 times the prior square-root law at that body's height;
  the tallest remains at the prior law. BR approved d52-4's `voicePitchLarge` on
  2026-10-05 with “lgtm”. The clamp spans 0.5 to 1.3 times the prior law at the
  smallest height. BR's tuning note was, “voicePitch 0.5 to 1.3 sounds good ,but
  for different purposes / for the tiny shambler, 1.2 is good”. Debug URL
  multipliers tune the two endpoints for the `voice_size` comparison site. This
  changes playback only, never hearing or simulation.
- **Shambler movement is audible:** surface-specific, heavy, dragging footsteps
  follow actual ground travel; a chase is faster than a stroll. Only the nearest
  three moving shamblers emit footsteps at once. The MVP reuses pitched-down
  player footstep recordings as an explicit stand-in; body size also shifts
  their playback pitch.
- **Your own sounds:** footsteps by surface and speed, doors, the inventory
  (zips, cans), and heavy breathing when stamina is low. You hear how much
  noise you're making.
- **Heartbeat (#193; d37-4; BR, 2026-10-05):** BR: "not hearing any hearbeats. / but the way it should work is a linear increase starting at around 85% stamina: / @85% -> start at 1Hz and 'normal intensity' (loudness) / @0%  -> 3Hz and very high intensity". It is silent above 85%, then rate and loudness rise linearly to zero stamina. The normal and very-high loudness anchors in `HEARTBEAT_TUNING` are provisional; BR tunes them by ear relative to other body sounds. This remains a presentation cue, not a noise event, so shamblers do not hear it and it does not alter simulation/save identity. Fear/danger and low-health responses remain open for BR's ruling on #193. See `src/game/audioPresentation.ts`, `HEARTBEAT_TUNING` and `heartbeatForStamina`, and `src/game/audio.ts`, `GameAudio.updateHeartbeat`.
- **Ambience by time and place:** wind, rain, a building settling. The
  distant sounds (a gunshot, a scream, a helicopter over the cordon, a
  generator) come from things happening in the simulation, not from a random
  loop, so they're worth listening to.
- **Silence is a tool.** No music during play; if a score is added later, it
  never signals danger, because then the music would tell you what the world
  should make you guess.
- Web Audio, started by the first click (browsers block sound until then).
  Sounds are content: ids in the pack, checked by the validator. Files are
  small, and follow [Assets and credits](#assets-and-credits).

## UI principles

- **HTML and CSS** over the canvas. Dense, legible, and keyboard-first, with
  the mouse also fully supported.
- The world never pauses for UI (except the F9 menu). UI should make actions
  fast: search, filters, "take all food", and repeating the last move.
- Every number the simulation uses (weight, time, condition, noise) can be seen
  somewhere in the UI, **on request**: on surfaces the player opens (inspecting an
  item, the inventory), never pushed at them during play. Depth is only fun when
  you can read it; play stays as diegetic as possible (see INTERFACE.md).
- **The UI only shows what your character knows.** No enemy markers, no
  minimap of zombies, no threat meter. A rest interruption says what you
  heard, not what it was. The in-game map is a paper map (#470); top-down
  renders are review tools, not UI.
- **Aim for full diegesis (BR, 2026-10-03):** "we should _aim_ for full
  diegesis - that's why the HUD is default off, but we can't always with voxel
  graphics". Utilities such as the compass and the wristwatch are items the
  player finds and holds (#183).

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
  sanity mechanics, scripted jump scares.
- **Every weird thing has a cause** you can find out from notes, terminals and
  lab records. The closer you get to the labs, the stranger it gets.

### Dread

The fear is slow and grounded. It comes from the systems:

- **Darkness.** Nights are dark, and interiors are dark by day. The flashlight
  lets you see and lets them see you.
- **Sound before sight** (see [Audio](#audio)): you usually hear the danger
  first and have to decide what it is.
- **Vulnerability.** Handling takes real seconds and the world doesn't pause
  for the inventory. Early on you're hungry, tired and badly armed.
- **Not knowing.** A closed door, a dark room, a body on the floor that may or
  may not get up. The UI never gives it away.
- **Permanent death**, so every risk is real.
- **A world that gets worse.** Zombies evolve and hordes drift. Staying alive
  longer doesn't make you safe.

### Dystopia

The region was sealed, not saved. The world tells that story through what's
left, not through cutscenes, and all of it is data (templates, items, notes):

- **The cordon:** fences, watchtowers, roadblocks and checkpoints, with
  warning signs that shoot-on-sight is in force.
- **Notices:** evacuation orders, curfew and ration posters, quarantine tape,
  and spray-painted marks on doors (searched, infected, how many dead inside).
- **The broadcast:** a radio loops an emergency message that promises help and
  tells you to stay indoors. It doesn't match what you see, and one day it
  stops.
- **What the containment did:** body bags, burn pits, a school turned into a
  triage centre, abandoned roadblocks, and houses boarded up from the outside.
