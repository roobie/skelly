---
read_if:
  - you decide how sunlight and shadows should read in play
  - you trade near-player shadow detail against distance
  - you're choosing world scale, view distance or performance targets
  - you're changing the rules for time, survival, light or zombies
  - you change shambler navigation, sight range over terrain or floor-transition
    behavior
  - you change the game's design, especially held-item feedback or hand ownership
  - you reconcile BR's rulings with player interaction and presentation
  - you're changing game audio or its relationship to simulation events
  - you're changing the debug test-house scene or firearm-handling range
  - you're changing firearm recoil, dispersion or aim control
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
  | Active AI | 20 Hz |
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
  own instance.
- An **item type** is data with **components**. Examples:
  - `container` (pockets, each a grid; below)
  - `wearable` (slot, warmth, protection, encumbrance)
  - `food` (calories, water, rots after)
  - `tool` (qualities such as `cutting: 2`, `prying: 1`)
  - `weapon` (melee or ranged stats)
  - `fuel`, `battery`, `light`, `book`
  - `vehiclePart` (after Slice 1)

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
  action. See `src/game/input.ts`, `KEY_BINDINGS`, for inputs;
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
  Items move by drag and drop, with the cells where the item fits highlighted,
  or with keys. R rotates.
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
with a model lies at its place in the pile's grid; items without one make a
generic bundle. For d59-2, spent cases read as loose debris rather than stacked
material, so their content-owned pile-display component selects scattering; see
`src/core/schema.ts`, `PILE_DISPLAY_KIND`, and `src/render/piles.ts`,
`PileMeshes.planSpentCases`.

### Item models

Items have simple, low-poly models: glTF files in the content pack, named by id
and checked by the validator, like sounds. A model says where the hand holds
the item and names points such as a flashlight's lens. It's what you see in a
pile and in your hands; an item without one is a bundle on the ground and a
plain box in your hands. Files are small, and follow
[Assets and credits](#assets-and-credits).

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
- **Disassembly** is a recipe run in reverse. It returns part of the
  components, depending on skill and the tools used. In Slice 2, that reverse is
  an authored yield or salvage list (see [SLICE-2.md](SLICE-2.md), "2.7").
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

- **Melee.** Weapons have damage, reach beyond the player's hand, and speed,
  plus stamina cost and damage type (blunt, cut, pierce). The swing reaches the
  player's 1.2 m effective eye-to-hand reach (including the lean into a swing)
  plus the weapon's reach; hit detection tests posed shambler body-region boxes
  along the aim ray. A click locks aim and starts a wind-up; the hit resolves at
  contact after `min(0.4 × cooldown, 0.25 s)`, with recovery filling the rest of
  cooldown. Misses and wall-blocked swings still spend stamina and cooldown.
  Active swings are saved and fingerprinted so Continue preserves one pending
  hit; changing held items cancels that hit without refunding cooldown. Holding
  right mouse raises a cosmetic ready stance. First-person motions use shared
  blunt-arc, cut-slash, pierce-thrust and alternating-fist profiles; two-handed
  items animate both arms. Confirmed hits add only clamped first-person recoil.
- **Firearms** come from gungen assemblies: part choices decide calibre,
  capacity, handling and noise. Ammo and magazines are items with pockets. The
  simulation's `AimController` publishes the same offset to shot resolution and
  held-firearm presentation, so the weapon does not visibly aim somewhere other
  than its shot ray. Aim state is saved because it can change hit outcomes. BR's
  2026-10-05 look at the range found that "the gun on screen is climbing (and
  plateauing)" and ruled, "at the ~7° screen limit -> start scrolling the screen
  with it / no plateauing." While an automatic trigger is held, recoil does not
  recover; over-limit pitch shifts the saved view pitch. The shifted view stays
  after release while the on-screen weapon offset recovers, so mouse look can
  counter the climb. BR also clarified that "dispersion is not a skill issue,
  but control is": firearm-owned `dispersionRadians` is sampled per round, while
  `firearmsSkillEffects` controls sway, kick per shot and recoil recovery,
  with legendary progression granting no control beyond ordinary expert per
  BR's ruling. The pump keeps its pellet spread and adds no firearm cone. This
  reuses the already saved player pitch, so no aim-state field or save-schema
  change is needed. See
  `src/game/firearmHandling.ts`, `FirearmMechanics.fire` and
  `firearmHandlingFor`, `src/core/pellets.ts`, `coneDirection`,
  `src/core/aim.ts`, `AimController.recordShot`, `AimController.advance` and
  `AimController.applyViewPitchShift`, `src/game/session.ts`, `createSession`,
  `src/game/input.ts`, `adjustLookPitch`, and `src/core/saveFormat.ts`,
  `SAVE_SCHEMA_VERSION`. BR's earlier 2026-10-05 report that skill 12 still had
  "too much dispersion/sway at full auto" led to d62-4 (#262); the later ruling
  separates firearm quality's dispersion from skill-controlled handling.
  Until #267 lands, aim-sway look comparisons use the current movement rules;
  afterward a firearm only fires while ready and not sprinting, so moving-fire
  comparisons use the skill-dependent duck-walk speed. The skill that controls
  duck-walk speed and block success remains open in #267; BR leans toward a
  generic "warfare" skill. d62 leaves practice unawarded until its source is
  ruled. The d62 reading of BR's "swing" is look-turn rate; BR's answer to the
  d62 questions triggers reinterpretation. The d62 reading of BR's "reload
  time" is per-shell insertion, not magazine reload; BR's answer to the d62
  questions triggers expansion.
- **Shot impacts (BR, 2026-10-05):** "yes, let's do #1 which is the real gameplay diegesis thing". Each round that meets world geometry leaves a surface mark; marks and dust are presentation, not simulation damage or save state. `src/game/firearmHandling.ts`, `FirearmMechanics.fire`, publishes committed round directions, while `src/render/shotTrace.ts`, `traceShot`, gives marks and debug lines one shared world trace; `src/render/impactEffects.ts`, `ImpactEffects.fire`, owns the bounded display. When a wall lies between the eye and muzzle, starting from the eye leaves the near wall visibly marked even if the muzzle has passed it. The test-house practice prop declares `FurnitureSchema.shotTarget` in `src/core/schema.ts` and is placed by `src/game/worldSetup.ts`, `DebugTestHouseSite.furnitureIn`. Whether rifle rounds damage shamblers or consume ammunition, and whether shamblers receive visible marks, remain open.
- **Noise** is an event with a loudness and position. Footsteps (worse when
  sprinting), melee, gunshots, doors, breaking glass and engines all make noise.
  Walls reduce how far noise travels. Zombies hear, investigate, and pass it on
  (see the screamer below). Stealth is a matter of managing noise and staying
  out of sight.

## Damage, destruction and dismemberment

Direction set by BR on 2026-09-28. The aim is an **interesting** damage
system, not just bigger numbers.

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
  data (today a block has only an id and `solid`). A destroyed block is removed
  with `World.setBlock`. Saves already store changed cells as an overlay on the
  regenerated base chunks (`src/core/saveState.ts:153`), so destruction
  persists without new save machinery; saves grow with the damage done.
- **No structural collapse in the first version.** Blocks left unsupported
  stay where they are. Collapse is a later, separate system.
- **Shamblers are body regions, and die only when the head is destroyed.** The
  single health pool (`src/core/zombies.ts:57`) becomes regions: head, torso,
  arms and legs. A hit damages the region it lands on. A blast damages each
  region by distance. A limb at zero comes off: its rigid part is hidden and a
  limb prop drops. Otherwise it's kept as simple as possible to start with.
  Losing limbs doesn't yet change behaviour, beyond what having no legs forces
  (how a legless shambler moves is decided in the first slice). Head at zero
  kills it.
- **Determinism.** Hit regions, blast falloff and any spread are seeded, so
  saves and replays stay exact. Region and material state is simulation state:
  it goes into the save snapshot and the source fingerprint.
- **Order.** First slice: shambler regions and melee-driven limb loss, with
  head-only death. Then materials and block destruction. Explosives and breach
  charges come once throwing and firing exist.

Still open: the full list of damage types and each material's resistances,
whether wounds bleed or slow a shambler, partial block damage (cracked looks),
and the sounds for severing and destruction (the audio manifest).

## Light

Nights should be dark, and voxel-lit interiors pitch black, so you have to
bring light. Light is the visual side of noise: it lets you see, and it lets
them see you.

Interiors need voxel light to become darker than the outdoors. Until that
arrives in Slice 4, don't fake the gap with a separate interior-darkness rule.
A carried beam remains a three.js light because it moves every frame, unlike
block light. All-around carried and dropped sources use a fixed pool of
shadowless point lights; unused slots stay at zero intensity, and surplus
emissive glowsticks remain visible without lighting the world. An emissive marker
is not a substitute for the pool: tune item light content against the ground and
walls under the shared near-field falloff. Source colour, intensity, radius and
burn rules belong to item content. The zombie light check keeps sky visibility
separate from carried light, so adding voxel sky light
won't change the carried-light rule. Keep time of day in the sky/fog renderer,
not baked into chunks; voxel sunlight can then join AO in vertex colour. See
`src/render/flashlight.ts`, `Flashlight.update`, `src/render/lightPool.ts`,
`LightPool.update`, `src/core/zombies.ts`, `isLit`, `src/render/sky.ts`,
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
  rain washes out). Terrain height alone should not end a clear pursuit; sight
  over a rise is bounded by occlusion, not by spending range on vertical distance.
  See `src/core/zombies.ts`, `seesPlayer`.
- **Navigation rationale:** Collision-aware routing prevents false progress
  through blockers, while bounded work protects the shared simulation tick.
  Keeping route planning separate from physics preserves collision ownership.
  A changed target leaves the current verified waypoints in use while the bounded
  search plans toward the latest block-cell goal. Before any waypoint exists, the
  shambler waits: a straight segment check cannot establish authored floor
  connectivity, and waiting preserves bounded route work. See
  `deadvox/src/core/zombies.ts`, `ZombieSystem.routeWaypoint` and
  `ZombieSystem.serviceRouteSearches`, and `deadvox/src/core/shamblerRoutes.ts`,
  `planShamblerRoute`.
  Explore landing connections only from the reached frontier, trying the goal
  before optional detours. Exhausting effort on an unrelated closed approach must
  not discard a complete route already found. See
  `deadvox/src/core/shamblerRoutes.ts`, `searchRouteLegs`.
  A grid-expansion limit alone hides flight validation, graph preparation and
  compression work. Account for world probes and metadata/graph work against the
  request allowance; the expansion cap also bounds local path structures.
  Finish at most one request beyond the dispatch slice and rotate the remaining
  queue deterministically. The allowance is logical work, not a wall-clock deadline; see
  `deadvox/src/core/shamblerRoutes.ts`, `planShamblerRoute`, and
  `deadvox/src/core/zombies.ts`, `serviceRouteSearches`.
  This is a bounded pilot, not a completeness guarantee: when no route is found,
  the shambler waits for a retry instead of steering directly through blockers.
  Crowd navigation and cheaper tiers belong to Slice 3
  ([#244](https://github.com/roobie/skelly/issues/244)), not larger pilot caps.
  Persist route progress, retry time and dispatch order so loading does not
  silently restart pursuit or change which actor receives the next search.
  See `deadvox/src/core/zombies.ts`, `snapshotState` and `restoreState`, and
  `deadvox/src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`.
  Request-local native maps avoid repeated world lookups without retaining stale
  collision across requests. Continuous swept clearance prevents a short corner
  overlap from creating an unsafe route and endless replanning; see
  `deadvox/src/core/shamblerRoutes.ts`, `horizontalSweepClear`.
  Live movement checks stay local even while gravity settles a descent; checking
  the whole future leg during that transient hides unbounded per-actor work.
  Descending endpoints are still checked for newly blocked landings. See
  `deadvox/src/core/zombies.ts`, `liveRouteClearance` and `routeWaypoint`.
  Preserve height changes when compressing a terrain detour: a raised sweep is
  not proof that the body can hover over intervening obstacles. See
  `deadvox/src/core/shamblerRoutes.ts`, `compressFlatPath`.
  Distant goals use successive local horizons. A verified stair exit may be the
  useful prefix when backtracking to its landing puts that horizon outside the
  next leg's window; this is not straight steering through a failed route. See
  `deadvox/src/core/shamblerRoutes.ts`, `searchRouteLegs` and `planRoute`.
- **Storeys:** Matching horizontal projections could connect disconnected
  floors and falsely complete an unreachable goal. Absolute feet height also
  cannot identify a storey on graded terrain: world ground height distinguishes
  that surface from an authored floor above it. Terrain legs follow that supplied
  surface; constructed storey transitions still require authored flights. See
  `deadvox/src/core/shamblerRoutes.ts`, `terrainForLeg` and `onTerrainFloor`.
  Far-hearing direction must not manufacture source-storey knowledge. A grounded
  listener projects the uncertain bearing onto known terrain, not the source's
  height; a listener above ground retains its own level. See `deadvox/src/core/zombies.ts`,
  `sameRouteFloor` and `farBearingTarget`, and
  `deadvox/src/core/shamblerRoutes.ts`, `planShamblerRoute`.
- **Level of detail:** Only the active tier is implemented, using bounded routes;
  see `deadvox/src/core/zombies.ts`, `ZombieSystem`. The tiers remain planned design:

  | Tier | Where | Simulation |
  | --- | --- | --- |
  | Active | Nearby actors | Detailed AI, body physics and bounded routes (implemented) |
  | Background | Distant actors in loaded chunks | Reduced-rate steering along a shared flow field (planned) |
  | Abstract | Actors in unloaded chunks | Hordes moving as groups on the region map (planned) |

  Background and abstract tiers, the flow field and crowd navigation are
  Slice 3 work ([#244](https://github.com/roobie/skelly/issues/244)), not built behavior.

**Decided (BR, 2026-10-04):**

- "At some point we will make everything destructible. Door, walls, appliances,
  furniture et[c] and yes, normal doors should be possible to breach by an
  ordinary shambler, given enough time. But the overarching idea is to keep it
  pretty aligned with how CDDA works"
- "to answer the question here and now: no, let's not make shamblers breach
  doors"

A destructive-door mechanic needs its own gameplay contract, so navigation
must not add one implicitly. See `deadvox/src/core/zombies.ts`, `ZombieSystem`.

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
    hides you without trapping you; richer crouching/light rules remain Slice 3.
  - **Noise:** pushing through a bush admits positioned rustle and hearing
    together through F4, on entry and a moving cooldown, faster/louder when
    moving faster. Leaf litter changes footsteps (`footstep_leaves`). Lead
    defaults pending BR override: leaves do not muffle either simulation hearing
    or WebAudio, and do not obstruct melee/bites; they still obstruct ray picks.
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
- **Wildlife as scenery:** birds, crows on the dead and flies help the player
  read the place, the bodies and the decay. They're environmental cues, not an
  animal ecology, hunting or farming in version 1 (EPIC.md, "Not in version
  1").
- **Time passing:** authored overgrowth, and dust and leaves indoors, show the
  weeks since people left. Food rotting changes what's still worth scavenging.
  There is no plant-growth or dust-accumulation simulation.

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

- **The look:** flat colour per block, with small per-block variation, ambient
  occlusion and fog. Textures only if colour alone can't carry the look. The
  palette is muted and grey; the saturated colours are the ones that mean
  something: warning signs, blood, fire and the glow of hot zombies.
- **Day and night** from sun and sky colour and fog. Nights are dark enough
  that a flashlight matters, and darkest in the dead of night (about 23:00 to
  03:30).
- **The night sky:** the moon and stars show on clear nights. The moon goes
  through its phases over about a month of game days. On a clear night near
  full moon you can see shapes and find your way outdoors without a light; on
  a new moon, or when it's overcast, you can't. Clouds hide the moon and stars.
- **Voxel light**: sunlight, plus light from torches, lamps and hot zombies,
  spread through the block grid. Inside buildings it's pitch black at night and
  dim by day, lit only by what comes in through doors and windows. It comes
  after Slice 1.
- **Far terrain:** chunks beyond the near radius switch to low-detail meshes.
  The targets are 96–128 m near detail and 512 m or more of far terrain; to be
  measured.
- **Entities** are drawn with instanced meshes; zombie limbs are instanced
  boxes.
- **Sun-shadow quality (BR approval, 2026-10-05):** “Markedly better, but there
  is still a little jaggedness. But we won't pursue this more right now, so I'll
  approve it.” The remaining jaggedness is a known limit BR chose not to pursue.
  Favor a stable edge near the player over sharp shadows far beyond them; see
  `src/render/shadows.ts`, `sunShadowTexelSize` and `Shadows.update`.

## Audio

Sound is the main way threat arrives, so it's part of the simulation, not
decoration.

- **The player should be able to judge a threat by sound:** where it is, how
  many there are, and what they're doing. Sounds are positional and walls muffle
  them, so the player can hear danger before seeing it. Noise events (see
  [Combat and noise](#combat-and-noise)) also play as positional sounds, with
  occlusion shared by the player's hearing and zombie hearing.
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
  heard, not what it was.
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
