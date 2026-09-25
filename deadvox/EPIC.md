# deadvox — the road to version 1

**Goal:** a playable hybrid of CDDA and DayZ in a voxel package.

This document defines what version 1 is, then breaks the way there into
slices. Each slice is playable, deployed to GitHub Pages and playtested before
the next one starts. The systems are described in [DESIGN.md](DESIGN.md), the
risks in [CHALLENGES.md](CHALLENGES.md), and the first slice in detail in
[SLICE-1.md](SLICE-1.md).

## What version 1 is

> You wake up at the edge of a quarantined region. You scavenge the farms and a
> town, choosing what to carry and in which pocket. You patch your wounds, craft
> better gear, and fortify a house with a generator and lights. You piece a car
> together from wrecks and drive to the military cordon. Eventually you go down
> into a lab to find out why some of the dead glow. Death is permanent, and a
> good run lasts many hours. The nights are the worst of it.

### Exit criteria

**Systems** (all playable together in one world):

- Real-time movement and combat. Long actions run in compressed time with
  interruptions.
- Items with pockets, worn containers, handling time, piles, and the two-pane
  inventory.
- Crafting with tool qualities and alternative components, disassembly,
  repair, skills and books.
- The body model: wounds, bleeding, infection and fractures. Needs: hunger,
  thirst, fatigue, stamina, temperature.
- Melee and firearms (from gungen), noise, and zombie senses (sight, hearing,
  smell).
- Positional sound for every noise event, muffled by walls, plus zombie sounds
  and ambience driven by the simulation. See [Audio](DESIGN.md#audio).
- Zombie level-of-detail tiers with hordes, and evolution over time.
- A region map: roads, towns, and points of interest in tiers 0–3, including
  underground labs.
- Base building: construction, doors and locks, barricades, electricity,
  lights and fire.
- Vehicles built from parts: driving, fuel, damage and repair.
- Saves: autosave, continue, export and import. Old saves migrate.
- A mod pack can be loaded from files and is validated the same way as the
  base content.

**Content** (minimums, not goals to overshoot):

| Kind | v1 |
| --- | --- |
| Item types | 150 |
| Recipes (including disassembly) | 80 |
| Zombie types | 10, in all 4 tiers |
| Building templates | 20, plus procedural houses |
| Point-of-interest kinds | 12, including 2 lab layouts |
| Vehicles | 3 buildable (hatchback, pickup, motorbike) |
| Books | 10 |

**Quality:**

- 60 fps at the chosen near view distance with v1 zombie counts on the
  [reference laptop](DESIGN.md#reference-hardware) (Core i7-1185G7, 32 GB,
  Iris Xe, Firefox).
- A new world loads in under 10 s. A 10-hour save is under 50 MB.
- Plays in current Chrome, Firefox and Safari.
- A new player learns the controls and the inventory without reading this
  repo: an onboarding card, plus contextual hints.
- It's frightening: in the Slice 8 playtest, most players say they were afraid,
  and what scared them came from the systems (the dark, sounds, being hunted),
  not from a scripted moment. See [Dread](DESIGN.md#dread).
- CI is green, including the golden saves and scenario tests. Every Biome and
  TypeScript check stays on (see the root README).

### Not in version 1

- Multiplayer.
- Mobile and touch controls.
- NPC survivors, factions, traders and quests.
- Farming, animals and hunting (wildlife may appear as scenery).
- Weather beyond rain and temperature.
- A WebGPU renderer.
- A mod manager UI (mods load from files).

## Slices

| # | Name | Playtest question |
| --- | --- | --- |
| 1 | **The loot run** | Is looting a house in real time, with handling time, tense and fun? Is 0.5 m the right scale? Is the first night frightening? |
| 2 | **Craft and mend** | Does crafting from scavenged materials give looting a purpose? |
| 3 | **Flesh and noise** | Is combat readable, and do noise and wounds change how you play? Do players listen before they move? |
| 4 | **The region** | Does the open world pull you from town to town? Does it feel like a place that was abandoned? |
| 5 | **Holding ground** | Is a base worth building and defending? |
| 6 | **Wheels** | Are vehicles worth the effort to build and keep running? |
| 7 | **The cordon and the labs** | Does the weird endgame feel earned and grounded? |
| 8 | **Version 1** | Would a stranger play a second run? |

The order follows dependencies:

- Each slice needs the one before it, and 2–5 are the core.
- The vehicle and lab slices both need the region map from Slice 4.
- Slice 7 needs the electricity and fire systems from Slice 5, because labs
  have powered doors and hot zombies start fires.

### 1. The loot run

See [SLICE-1.md](SLICE-1.md). It covers:

- the scale measurement and the switch to 0.5 m blocks
- the simulation core: clock, day and night, scheduler, compression
- schema-based content
- items with pockets, handling time and the inventory screen
- a hamlet of templated houses with loot
- needs, and health as a single pool
- shamblers
- sleep in compressed time
- basic sound: footsteps, doors, shamblers and night ambience
- saves
- a playtest build that logs local metrics

### 2. Craft and mend

- Recipes with tool qualities and groups of alternative components, and crafting
  in compressed time that can be interrupted and resumed.
- Disassembly and salvage, and repairing items' condition.
- Workbenches, and materials used from nearby piles and containers.
- Skills that go up with use, books and reading, and recipe discovery.
- About 80 item types. The validator checks that every component can be found
  or crafted.
- More templates: a hardware store and a garage.

### 3. Flesh and noise

- The body model: parts, wounds, bleeding, infection, fractures, and first aid.
- Melee depth (weapon types, stamina, knockback) and blocking.
- Firearms from gungen assemblies: ammo, magazines, reloading as handling,
  noise and recoil.
- The noise system (sources, reduction by walls), sight at night and when
  crouching, and a smell trail.
- Positional sound for every noise event, muffled by walls like the noise
  itself, and distinct sounds for each zombie type.
- Zombies: crawler, runner, screamer, bloater. Flow fields and the background
  tier; the first hordes.
- Input recording and replay for bug reports.

### 4. The region

- The region map: biomes, the road graph, settlements and point-of-interest
  sites with tiers.
- Towns from templates plus procedural houses. Room types choose furniture and
  loot.
- Far-terrain level of detail, and worldgen in workers.
- Voxel light (dark interiors), and body temperature, clothing warmth and rain.
- Driveable surfaces in worldgen, ready for vehicles.
- The dystopian dressing: notices, marked doors, roadblocks and triage sites
  in the templates, a radio with the emergency broadcast, and distant sounds
  from the simulation (see [Dystopia](DESIGN.md#dystopia)).

### 5. Holding ground

- Construction: walls, floors, doors, barricades and furniture, by crafting.
- Doors and locks, and zombies bashing doors (brutes arrive here).
- Electricity: generators, batteries, solar panels, wires, lights and
  appliances, with catch-up while away.
- Fire: burning, spreading, smoke and light. Molotovs.

### 6. Wheels

- Vehicles as grids of parts: building from wrecks, installing and removing
  parts, and repair.
- Driving with arcade physics: fuel, the vehicle's battery, noise, and damage
  to parts.
- Wrecks and convoys in worldgen as sources of parts.

### 7. The cordon and the labs

- Tier 2 and 3 points of interest: checkpoints, military camps, a military
  base, and above- and below-ground labs with powered doors.
- Zombies: soldier, hazmat, smoulderer, incandescent hulk, lantern. Evolution.
- Hazard zones around labs, prototype gear, and lore (notes, terminals, lab
  records) that explains the weirdness.

### 8. Version 1

- Balance passes, an onboarding card and contextual hints, and a death screen
  that starts a new run.
- Settings: keybindings, graphics quality, and the relaxed mode that pauses in
  menus.
- Performance and memory passes against the exit criteria, and hardening of
  save migration.
- Content filled up to the minimums.

## Cut list

If version 1 is running late, drop these in this order:

1. Smell trails (sight and hearing are enough).
2. Solar panels (generators and batteries stay).
3. The motorbike (two vehicles are enough).
4. The second lab layout.
5. Zombie evolution: types would be fixed per tier instead.
6. Procedural houses (templates only, with more variety).

Never cut these: handling time, pockets, compressed long actions, crafting with
qualities, the body model, saves, dark nights and sound. They are the game.

## How each slice runs

1. **Plan:** a `SLICE-N.md` with its goal, playtest questions, scope, ordered
   milestones and a definition of done.
2. **Build:** in PR-sized milestones. Each one is merged and deployed to Pages,
   with CI green (Biome, types, tests, content validation, golden saves).
3. **Playtest:** at least 3 people follow a short script, and the build logs
   local metrics.
4. **Record findings:** update DESIGN.md, CHALLENGES.md and this document. Then
   plan the next slice.
