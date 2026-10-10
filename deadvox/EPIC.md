---
read_if:
  - you're planning a version 1 slice, milestone or playtest
  - you're deciding which features belong in deadvox version 1
  - you're changing firearm handling or combat design for version 1
---

# deadvox — the road to version 1

**Goal:** a playable hybrid of CDDA and DayZ in a voxel package.

This document defines what version 1 is, then breaks the way there into
slices. Each slice is playable and deployed to GitHub Pages. The first real
playtest is at the end of Slice 3, before Slice 4 starts, so the base game is in
place; later slices are playtested before the next one starts. The systems are
described in [DESIGN.md](DESIGN.md), and the risks in [CHALLENGES.md](CHALLENGES.md).

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

### 2. Craft and mend

[ADR 0001](docs/decisions/0001-ui-rendering-with-lit-html.md) keeps screen
rendering separate from simulation state. Craft and mend covers:

- Recipes with tool qualities and groups of alternative components, and crafting
  in compressed time that can be interrupted and resumed.
- Disassembly and salvage, and repairing items' condition. Weapon mods can be
  crafted and salvaged like other items (see Modular weapons in slice 3).
- Workbenches, and materials used from nearby piles and containers.
- Skills that go up with use, books and reading, and recipe discovery.
- Light you make: torches, candles and glowsticks (see
  [Light](DESIGN.md#light)).
- About 80 item types. The validator checks that every component can be found
  or crafted.
- More templates: a hardware store and a garage.
- A sneak peek at trees and hedges in the hamlet, pulled forward from Slice 4
  (2.13).

### 3. Flesh and noise

The first real playtest is at this slice's end, before Slice 4 starts, so the
base game is in place. It combines the questions below with those about crafting,
wear and light. Slice 3's milestone scope and gates are in
[SLICE-3.md](SLICE-3.md); work proceeds one milestone at a time.

#### Playtest plan

Share the Round 1 landing page at `site/deadvox/playtest/round1/` with at least
three people, including someone new to both CDDA and DayZ. Its play link opens
the authored map specified in [#181](https://github.com/roobie/skelly/issues/181)
and detailed in [SLICE-3.md](SLICE-3.md). The task prompt is “Your task: survive
and find the military camp.” (`site/playtest.jsonnet`, `en.task`).
Each tester plays on their own for as long and in as many sittings as they like;
Continue resumes their run ([docs/playtest-run.md](docs/playtest-run.md),
"Session format"). There is no scripted session or fixed play time. Do not teach
the systems first. Testers can send feedback through the public form and may
choose to attach their local metrics and a recent replay. Testers without GitHub
can email their metrics and feedback to the organiser; the organiser provides
the address separately with the link.

The authored route runs from the lone house through the hamlet, hunting cabins,
medical site and military camp, with the first and second nights along the way.
The game does not script zombie behavior. Testers explore the map and make their
own choices; the run is not facilitated or shadowed.

Use the metrics and feedback testers choose to share to assess:

1. Is looting tense and fun when each item move takes real seconds while the
   world keeps moving?
2. Does choosing a pocket matter? Do players notice handling time? Is fitting
   items into grids a puzzle or a chore?
3. Does 0.5 m feel right for doors, stairs, interiors and furniture?
4. Is compressed sleep readable? Is the interruption clear and fair?
5. Are a few shamblers enough threat to make looting and sleep meaningful?
6. Is the first night frightening? What scared the player, and did it come from
   darkness and sounds rather than a scripted moment? Until voxel light arrives
   in Slice 4, interiors are no darker than outdoors; interpret feedback with
   that in mind ([DESIGN.md](DESIGN.md#light)).
7. Does the 1:8 clock ratio give players enough time to explore the world?
8. Do non-respawning shamblers make the second night too safe?
9. Is combat readable and visceral? Do noise and wounds change what players do?
   Do they listen before moving?
10. Do players pick up materials for what they could make, and plan loot runs
    around recipes?
11. Can players tell what crafting is missing and where those materials might
    be found?
12. Is compressed crafting time, including interruption and resumption, readable
    and fair?
13. Do players notice wear and find repair worth the materials?
14. Do players make light, and does carrying a burning torch change how they move
    at night?

The metrics show how far testers get, what they find and when they reach map
beats. Their feedback issues or emails can explain what felt tense, confusing,
satisfying or frustrating, and which moments annoyed or delighted them. Use that
evidence to update DESIGN, CHALLENGES and this EPIC before planning Slice 4. If
the second night is too safe, add night wanderers after the first playtest. The
organiser's sheet in [docs/playtest-run.md](docs/playtest-run.md) explains
how testers can export and share their metrics and feedback.

The death/new-run contract is still open for version 1: should a new run in the
same world preserve piles left by the previous character?

Slice 3's scope and milestone-by-milestone plan are in [SLICE-3.md](SLICE-3.md).
The body model, melee and firearm work, ready stance, senses, light, weapon mods,
zombie types, hordes, input replay and authored playtest map are planned there.

### 4. The region

- The region map: biomes, the road graph, settlements and point-of-interest
  sites with tiers.
- Towns from templates plus procedural houses. Room types choose furniture and
  loot.
- Far-terrain level of detail, and worldgen in workers.
- A world that feels real, including vegetation and its role in play (see
  [DESIGN.md](DESIGN.md#a-world-that-feels-real)).
- Voxel light: interiors pitch black at night and dim by day. Light through
  windows and doors can be seen from outside.
- Body temperature, clothing warmth, and rain.
- The night sky: the moon and stars, moon phases, and overcast nights that come
  with the rain.
- Driveable surfaces in worldgen, ready for vehicles.
- The dystopian dressing: notices, marked doors, roadblocks and triage sites
  in the templates, a radio with the emergency broadcast, and distant sounds
  from the simulation (see [Dystopia](DESIGN.md#dystopia)).

### 5. Holding ground

- Construction: walls, floors, doors, barricades and furniture, by crafting.
- Doors and locks, and zombies bashing doors (brutes arrive here).
- Electricity: generators, batteries, solar panels, wires, lights and
  appliances, with catch-up while away.
- Fire: burning, spreading, smoke and light. Molotovs. Lanterns and fixed
  lamps, and covering windows so a lit base doesn't draw a crowd.

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

### Sound polish

The current d13-selected recordings are approved. Explicit placeholders and
rejected or deferred work below remain open, including a better fist hit, a
hard-landing-specific sound, a distinct stuck-door cue and replacement mud/stone
footsteps.

- Surface-hit sounds by weapon type and surface: blade on stone has recordings parked as `melee-swing-01..03.ogg`; blunt on a wall and blunt on wood still need recordings. Implement after d7's deferred surface-hit result.
- Split item-drop sounds by pile surface; the wood clips play on every surface because piles expose no surface classification.
- Short drop onto a hard floor: still needed; candidate `.agent-mail/scratch/sounds-101/deferred/hard_floor_drop--bfh1_wood_hit_02.ogg` is in the mail scratch and intentionally not in the repo.
- Wood tap or knock: still needed; candidate `.agent-mail/scratch/sounds-101/deferred/wood_tap--thwack-02.wav` is in the mail scratch and intentionally not in the repo.
- New sources for `footstep_mud` and `shambler_step_mud`; the existing variants are rejected.
- More `footstep_leaves` variants. Do not use `footstep-leaves-02.ogg`; it sounds like linoleum.
- New sources for `footstep_stone` and `shambler_step_stone`; keep the gravel-sounding clips for a future gravel surface.
- More `door_open` variants; only `door-open-03.ogg` is accepted.
- A distinct stuck-door sound; use `door_blocked_close-01.ogg` for both `door_close` and `door_blocked_close` until a separate cue is added.
- Wire eating, drinking, and flashlight on/off sounds to their use actions; add
  sustained or periodic breathing when stamina is low.
- Add shambler door-contact sounds with the door-banging behavior.
- Mix wind ambience quieter at night. Expand shambler idle presence beyond
  occasional groans with state-shaped moans, breathing and in-place shuffling.
- Add the player's bodily cues—yawning, stomach sounds, coughing and uneven
  footsteps when limping—when those states and events exist.
- Record sand-specific player footsteps and heavier, dragging shambler steps;
  don't pitch down player recordings to stand in for shambler steps.
- Shambler steps measured 14.5 m at effective gain 0.014, but audibility by ear
  beyond 10 m at night is unconfirmed; tune gain and falloff by ear.
- Record a distinct blocked-door close and a hard-landing-specific sound; add
  the missing scenario proof that footsteps, doors and fights emit positional
  sounds.
- A better fist-hit source (the current placeholder is retained).
- A blunt hit on a wall, a hard landing, and more swing variants.

## Unscheduled polish

### Shambler

The target is a sickly, fleshy figure rather than a swamp monster, with
recognizable nose, neck, feet and hands. Sufficiently forceful hits can dismember;
see [Damage, destruction and dismemberment](DESIGN.md#damage-destruction-and-dismemberment)
for body regions, death on head destruction and damage types against materials.
The shambler needs at least three basic attack animations and damage reactions.
Q and E remain reserved for later actions and have no world bindings.

### Crafting and condition

- Items carried in clothing can be damaged when that clothing is hit.
- Condition can affect an item's performance before it is ruined.
- Books teach recipes only, for now; they may also speed up skill practice in a
  later reading design.
- Learning from books will become gradual: reading lets the player use the book
  as a reference while doing the work, until the recipe is learned fully.
- Condition may lower salvage yield.

### Player melee

Fists are acceptable as they are; cross, hook and uppercut variants are possible
polish. Per-weapon motion may override a damage-type profile. A surface-hit result
could provide a wall-hit thud or recoil instead of counting as a miss.
`src/render/playerFigure.ts` could follow first-person swings; third-person views
do not animate.

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
   milestones and a definition of done. Run or explicitly reuse the slice-start
   consolidation surveys for deadvox, gungen and mobgen, following
   [Continuous consolidation](../docs/PROCESS.md#continuous-consolidation).
   Give open findings owners, decisions and calendar revisit dates; name which
   work is standalone and which folds into a milestone.
2. **Build:** in PR-sized milestones. Each one is merged and deployed to Pages,
   with CI green (Biome, types, tests, content validation, golden saves). Briefs
   and reviews check consolidation; deliveries record its scope, proof and
   metrics. Revisit dated backlog decisions throughout the slice, not just at
   its end.
3. **Playtest:** at least 3 people follow a short script, and the build logs
   local metrics. The first real playtest is scheduled for the end of Slice 3,
   covering the first-slice questions recorded above plus
   questions from Slices 2 and 3.
4. **Review the slice:** run the exit consolidation surveys and report the
   process metrics: findings and their dispositions, per-item line/site changes,
   regressions including review-caught defects, standalone/folded capacity,
   milestone timing evidence and recurring findings. State missing measurements;
   decide what to keep or change about the procedure. This review still happens
   when the real playtest is deferred.
5. **Record findings:** update DESIGN.md, CHALLENGES.md and this document, and
   the canonical refactoring backlog. Date the next decision for every remaining
   owned finding. Then plan the next slice.
