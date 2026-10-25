---
read_if:
  - you're changing fixed-reservoir lamp fuel, burn accounting or service admission
  - you decide how realism should trade off against tedium
  - you change food exposure ownership or ambient catch-up
  - you change the test-house normal or debug-only boundary
  - you change regional paper-map coverage, item ownership or persistence
  - you change held sharpening, blade repair entry points or prepared hand pairs
  - you change zombie hesitation, refusal, interest chaining or attention phase ordering
  - you change the player figure's look, its authored parts, its clothes or how it is posed
  - you change worn head gear seen from inside or on the player figure
  - you add a wear slot or change what night-vision goggles do to the view
  - you change browser mod identity, startup admission or default mod selection
  - you change streaming reveal or loading readiness
  - you change build-time bundle validation stamps or trusted admission
  - you decide how sunlight, shadows or interior sky should read during discovery and edit revalidation
  - you trade near-player shadow detail against distance
  - you're choosing world scale, view distance, performance targets or the default render scale
  - you change player movement, load or aim tuning, saved aim admission, or what crouching or lying prone lets the player fit through
  - you're changing world block shapes, wire fences or their supports, sight opacity, reach through obstacles, sound blocking or slab geometry
  - you're changing ladders, roof hatches or where the player can climb above a fight
  - you're changing which furniture the player can lift, carry, push or drag, or how stacks settle
  - you're changing the rules for time, survival, light or zombies
  - you're implementing electricity networks, portable charging, energy balance or appliance power history
  - you're implementing the authored gauntlet arrangement, scenario admission, composed route certificates, shared city planning, portal proofs, underground lab depth, the sewer route or its visual approval gate
  - you author lab equipment bays, curated storeys or supported descent lids
  - you change sleep onset, its tuning or cancellation
  - you're changing the rendering of zombie actor models
  - you're considering a coarser mesh or level of detail for distant zombie bodies
  - you're integrating a mobgen amalgam body, its collision envelope or member hit ownership (#308)
  - you're changing how the amalgam's flesh meets terrain, the player or shots
  - you're measuring or reducing amalgam collision cost against its per-tick budget
  - you're changing the holes hits carve in the amalgam or the flesh chunks that fly off
  - you're changing the crawler's established silhouette
  - you're changing crawler gait, hit response or generation validation
  - you're changing clock boundaries, temporal field names or time conversion arithmetic
  - you're changing the derived day phases that drive the sky, zombie sight, hordes or spawn words
  - you change shambler attention, movement, obstacle response or floor-transition behavior
  - you're changing loaded-distance simulation or the horde representation
  - you're authoring scenario event rules or changing when they fire or what they release
  - you're restructuring the per-tick zombie simulation
  - you're authoring decals or scenario outbreak age
  - you're changing worn layers, armour protection or item wear
  - you're changing bleeding cues
  - you change landing injuries or their content tuning
  - you're changing bleeding tiers, blood loss, wound closure, treatment strength, or when bleeding refuses time compression
  - you're changing zombie attack moves or the damage kinds they deal
  - you change the game's design, especially inventory layout, held-item feedback, body damage or treatment, or hand ownership
  - you change quickbar assignment feedback
  - you add or change a first-person handling animation (what it may read its timing from)
  - you change optic magnification, its input ownership or its persistence policy
  - you tune body infection or unconsciousness through content packs
  - you're changing the HUD defaults or why players can turn HUD elements off
  - you're changing timed-action progress presentation or its relationship to HUD scale
  - you're changing content-defined UI spacing or HUD scale, or choosing rem or px for a UI length
  - you're changing startup content selection or browser mod admission
  - you're changing game audio or its relationship to simulation events
  - you're choosing or changing weapon sounds (shots, handling, dry fire, melee swings and hits)
  - you're changing the debug test-house scene or firearm-handling range
  - you're changing firearm recoil, dispersion or aim control
  - you're designing or building holding breath to steady aim
  - you're changing firearm attachments, nested item slots or their save behavior
  - you change which item or model mass is authoritative
  - you author item models or decide how medicine quantities should look
  - you're changing military progression, loot economy admission or loot unit planning, ground supply or roll-once persistence, including debug overlays
  - you're changing firearm case ejection, landing, or save presentation
  - you're diagnosing or changing inventory stalls from firearm attachment candidate discovery
  - you're changing when a running game warns before page exit relative to its last save
  - you're changing what the death card identifies about the played world
  - you're changing what the death-screen loot tally counts
  - you're changing the shoulder slot, weapon slings or how a slung gun is carried
  - you're changing how a flashlight mounts on a long gun
  - you're changing melee motions, weapon contact behavior, stamina recovery timing, seeded damage variation or melee-combat skill training
  - you're changing the quiet-key and noisy-forcing alternatives for locked doors
  - you author the police armoury's roof key or its view from the start
  - you change what vehicles are for, how their parts fit, come off and behave, or what a parked vehicle blocks
  - you're changing where a dropped, crafted, unpacked or swapped-out item lands, whether a drop checks reach, or what happens with no ground nearby
  - you're changing held-item throwing, its dragged path and duration, range tuning or replay strength
  - you're changing thrown explosives (fuse, blast, fragments, their noise) or where the playtest horde stands
  - you're choosing or changing the building-weathering look and its dilapidation direction
  - you're authoring dilapidated structures or breached perimeters
  - you're changing player-facing item descriptions or their boundary with control guidance
---

# deadvox — design

Design direction and rules for the game. See [EPIC.md](EPIC.md) for the version-one
milestones, [CHALLENGES.md](CHALLENGES.md) for unresolved technical constraints,
[INTERACTIONS.md](INTERACTIONS.md) for interaction contracts, and [PROJECT.md](PROJECT.md)
for project operation.

**Status:** agreed direction. Open choices stay attached to their issue.

## The game in one paragraph

You are alone in a quarantined region after an outbreak; the scenario determines how long afterward. The world is
real-time and open, as in DayZ: you walk, sneak, loot, fight and run, and the
dead never stop wandering. Your survival depends on depth, as in
Cataclysm: DDA: what you carry, and in which pocket; what you can craft from
what you found; which wound will get infected. Towns are for scavenging. The
military cordon and the secret labs are where the good gear is, and the
strangest things. Everything is made of voxels, and everything can be taken
apart. It should feel dystopian and frightening: alone in the dark, in a
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
   laptop. Each player's machine runs the whole world. Multiplayer, after
   version 1, is lockstep, so peers exchange only inputs; see
   [ADR 0008](docs/decisions/0008-deterministic-world.md).

7. **Realism without tedium.** Model the real physical constraints of an action,
   but omit repeated procedure that adds no meaningful choice or consequence.
   Physical consistency lets players reason from the world; needless repetition
   does not add survival depth.

## Performance and scale

Terrain goes on screen a whole column at a time and never beyond a column that isn't drawn yet, so no missing chunk shows what solid blocks hide. This lets play begin once a smaller ready ring is drawn while the remaining view fills in safely, without exposing sealed or buried rooms during loading or movement. Furniture, piles and actors share the terrain's reveal membership so their silhouettes and shadows cannot expose a hidden room before its walls arrive. Edits keep already drawn columns visible so replacement work does not create a gap. See `src/render/furniture.ts`, `FurnitureMeshes`, `src/render/piles.ts`, `PileMeshes`, `src/render/mobActors.ts`, `MobActorMeshes`, `src/render/zombies.ts`, `ZombieMeshes`, `src/render/chunks.ts`, `ChunkMeshes`, `src/render/columnReveal.ts`, `revealedColumns`, `src/game/streamer.ts`, `Streamer`, `src/game/worldLoading.ts`, `WorldLoading`, and `src/content/base/graphics.jsonnet`, `readyRadiusM`.

Performance acceptance targets 60 fps on a portable reference-laptop class:
Intel HD 530-class integrated graphics at a device pixel ratio of 1.5. The
game should ideally run on a low-end ("potato") PC so that as many people as
possible can enjoy it, and the pixel ratio matches common laptop display
scaling, so the target counts the pixels those players actually draw. Integrated graphics share
memory bandwidth with the CPU, so triangle count, overdraw and draw calls
compete with simulation; workers also compete with the main thread, so keep
their number small. Compare the same workloads on that reference class,
measuring rendering, simulation and workers together rather than relying on the
execution host. Compare the forest workload there when evaluating foliage
performance changes. See
[CHALLENGES.md](CHALLENGES.md) for active performance constraints.

Render scale adapts by default, so slower machines trade sharpness for frame
rate and faster ones keep the full image. The trade must not depend on enabling
post effects or reduce the readability of separate UI layers. Content must at least be able to
switch adaptation off and tune it, so a mod can choose a fixed scale or a
different trade (`PILLARS.md`, "Content forward compatibility"). Explicit player
choices retain ownership rather than being overwritten by adaptation. See
`src/content/base/graphics.jsonnet`, `src/render/adaptiveScale.ts`, `AdaptiveScale`,
`src/render/mood.ts`, `Mood.setRenderScale`, and `src/render/screenScale.ts`, `ScreenScale`.
Look changes made for performance
follow `packages/deadvox/GRAPHICS.md`, "Look decisions".

Half-metre blocks keep doorways, furniture and interiors at human scale, and
make stairs walkable rather than jump-sized. The finer quarter-metre scale did
not improve the look enough to justify about eight times as many chunks at the
same view radius and re-authoring building templates. Frame cost is part of the
chosen scale, so tune view distance against measured play rather than duplicating
current settings here. See `BLOCK_SIZE` in `src/core/scale.ts`.

The player's own movement, load and aim tuning belongs in one content home,
not split between sensory tuning and code, so mods can retune the player without
changing mechanisms. See `src/content/base/player.jsonnet`, `player`;
`src/core/schema.ts`, `PlayerSchema`; `src/game/player.ts`, `playerTuning`,
`movementPace` and `steer`; and `src/core/aim.ts`, `AimController`.
Gravity remains physics rather than player tuning. Saved look offsets must obey
the geometric ceiling shared by all valid player tuning, not the core pack's
chosen tuning: impossible offsets can overflow on advancement even when the
saved numbers are finite. See `src/core/aim.ts`, `assertAimState`, and
`src/core/schema.ts`, `PlayerSchema`.

### Crouching and lying prone

Lower stances trade mobility for low routes: collision and eye height must agree,
and lying flat leaves nothing to jump from. Rising must not put the player inside
an overhead solid or skip straight from lying flat to standing. Keep stance
transitions in `src/game/player.ts`, `nextStance`, and clearance in
`src/game/session.ts`, `settleStance`, rather than duplicating either rule in input
or rendering.

Hearing and sight treat a prone player as they treat a crouched one, through
prone's own content fields, because how lying down should affect noticing is
still open (#550). The camera and the spit's chest target follow the eye height,
so each stance moves them without stance-specific code.

The drawn pose must fit its collision height, so a head never pokes through a
ceiling the body fits under. Visual blending hides the change of shape, but must
not delay the eye used by sight and collision. See
`src/content/base/figures-player.jsonnet`, `stancePoses`, and
`src/render/playerFigure.ts`, `PlayerMeshes`.

The FOB's east-wall passage is sized so a crouched player fits but a standing
player does not. It is a separate low route from the guarded north entrance and
southern breach, with its floor level to the approach; it must not expose any
part of the finale from near-ground viewpoints, leaving the southern breach as
the only near-ground exception.
`test/campGate.test.ts`, "hides the finale from approach tracks and near ground except through the southern breach", checks from the amalgam's feet to its top.
Zombies use the passage only if their ordinary collision body fits; they do not
crouch or gain a type-specific exception.

A restored stance must take its height from admitted content rather than saved
body dimensions. See `src/core/saveFormat.ts`, `decodeSave`;
`src/game/session.ts`, `setStanceHeight`; `src/core/schema.ts`, `PlayerSchema`
and `SenseSchema`; `src/core/zombies.ts`, `loweredStanceTuning`;
`src/content/base/camp.libsonnet`, `camp_wall_run_crouch_hole`; and
`src/core/spawnClearance.ts`, `zombieBodyDimensions`.

### Block shapes

A wire fence must keep bodies out without hiding what is on the other side.
Movement solidity and sight opacity are independent content choices; wire coverage
and tint belong to content too, so another fence needs no identity-based engine rule.
Open wire geometry leaves holes in rendered shadows rather than casting a wall's
shadow. Interaction requires both physical and visual access: seeing a container
through wire does not let the player loot it, and passable foliage still hides it.
See `src/core/schema.ts`, `BlockSchema`; `src/core/collision.ts`, `worldOpaque`;
`src/core/wireMesh.ts`, `wirePolygons`; and `src/core/interactionPick.ts`, `pickInteractionTarget`.

Fence supports make ends, isolated cells, corners and junctions read as built structure rather than
floating wire. Derive them from neighbouring opted-in cells instead of making authors
place a second object. Content owns pole size and straight-run spacing; anchor that
spacing to the world, not a discovered run end or chunk origin, so loading and rebuild
order cannot move it. Meshing waits for neighbouring live columns before treating an
edge as an end. Poles stay inside the fence's occupied cells and do not introduce a
separate gameplay obstacle or change the wire's passage rules. See `src/core/fencePosts.ts`,
`deriveFencePosts`; and `src/game/streamer.ts`, `Streamer.neighboursGenerated`.

Shots and thrown items stop at wire to keep physical collision simple. Size-based
passage, where small objects fit through openings and large ones stop, is the
expected direction rather than a promise that visible holes already simulate size.
Firearm aiming must not offer a target behind a physical blocker; opacity still
hides targets in foliage. See `src/core/zombies.ts`, `ZombieSystem.aimAt` and
`ZombieSystem.firePellets`; and `src/core/itemThrow.ts`, `steppedItemFlight`.

Wire passes only thrusting melee: a directed strike can reach through an opening,
while a swing or wrestle needs space the fence denies. This gives fence defence a
fight of its own without mistaking piercing damage for a thrust. Zombie thrusts
also need enough effective reach; both conditions must hold at windup start and
contact. Blocks select permitted motions and the minimum zombie reach in content,
so the rule is symmetric rather than a creature or weapon identity exception.
See `src/core/collision.ts`, `worldMeleeBlocker`; and `src/core/zombies.ts`,
`ZombieSystem.reachableZombieMoves` and `ZombieSystem.resolvePlayerMelee`.

Sound passes open wire because chain-link barely dampens it. Sound blocking has
its own content property: sight is the wrong key because foliage hides without
muffling. Furniture still owns whether its closed state blocks sound.
See `src/core/collision.ts`, `worldSoundBlocking`; `src/core/zombies.ts`,
`ZombieSystem.updatePerception`; and `src/game/audio.ts`, `GameAudio`.

The partial-block set remains under discussion in #221; do not implement it
before playtest 1. Its purposes, in priority order, are roof silhouettes,
movement aids, cover, and finer building detail. Gameplay-relevant shapes must
affect collision, sight, and shot blocking, not only appearance. Keep furniture
and machines as stateful block entities rather than expanding block geometry
for their detail.

## Time

### Clocks and units

Temporal fields state both their clock and unit so simulation time, game time,
and wall-clock time cannot be silently confused. The pure simulation accepts
Sim time only; Game time derives from it through the saved clock ratio, while
Real time stays at the frame, input, and presentation boundary. Duration and
rate conversions use named helpers, and content rates use the Game clock so
clock-ratio tuning does not retune content. See `src/core/time.ts`,
`src/core/temporalFields.ts`, and the `lint:time` contract in
`packages/deadvox/tools/time-lint.mjs`.

Advancing never moves Sim time back; only a seek can. A system tick may end up to the scheduler's epsilon
past an advance's target, and a Game timestamp recorded inside that tick (a
scenario completion) must still be at or before the calendar a save derives
from the final Sim time; validation compares them exactly. See
`src/core/scheduler.ts`, `Scheduler.advance`.

Keep the custom time lint boundary current when simulation dependencies or
field names change. Gungen's internal estimates are outside that lint; exported
action metadata follows Deadvox's clock-and-unit contract. Persisted temporal
field renames require a save-schema change because pre-alpha saves are refused,
not migrated. See the root gungen-to-deadvox export contract.

### Long actions

Crafting, reading, building, disassembly, repair, searching, treatment, and
sleeping take game time under compression. Work and rest have different
content-tuned rates: a player should be able to sleep through most of a night,
while work remains legible. Prying stays at real-time pace.

Search time rises in a straight line with a container's pocket cells, from a minimum
to a maximum, and stops rising at about wardrobe size, so a small box is quick and
tall furniture takes the full time. One content number sets where it stops, which
keeps the rule cheap to tune. Its known limit is that a later container larger than
that point searches no slower than a wardrobe; adding one is the trigger to revisit
the rule. See `src/core/blockEntities.ts`, `searchTime`, and `src/core/schema.ts`,
`InventoryTuningSchema`.

Bound each compressed simulation step so one frame does not become arbitrarily
expensive. If the world is busy, fast-forward may slow rather than exceed the
frame budget. After an action stops, compression ramps down within a bounded
amount of Sim time; a fixed Real-time ramp would let the world run too far after
the player chose to stop. See `longActionLimits` in `src/core/compression.ts`
and `RAMP_DOWN_SIM_SECONDS` in `src/game/frameDriver.ts`.

Only an emitted event stops a long action, except that bleeding also refuses
compression for player actions. Nearby or aware shamblers do not make the game
judge an area safe on the player's behalf: the player may choose to wait where
enemies cannot reach them. Damage, a need threshold, a carried light dying, or
deliberate debug noise can interrupt. A sleeper wakes; other actions return to
real time and offer Continue or Stop without losing completed progress. Debug
compression is not stopped by bleeding. See `Simulation.checkInterruptions` in
`src/core/sim.ts` and `LongActions.syncInterruption` in `src/core/longAction.ts`.

Without an alarm-bearing item, sleep ends when fatigue reaches zero. With an
alarm, sleep continues after fatigue reaches zero and ends when the chosen wake
hour arrives. The alarm overrides fatigue-based completion, and ordinary
interruptions still wake the sleeper. The wake choice is saved. See
`LongActions.advanceJob`, `LongActions.wakeGameHour` and `RestAction.wakeAt`.

Starting sleep has a content-tuned onset that shortens as fatigue rises. The
player remains awake and may cancel it; sleep recovery begins only when onset
completes, and ordinary Stop cannot wake a sleeper. If the selected alarm hour
arrives during onset, the alarm ends the action before sleep begins, preserving
the chosen wake time as the authority over the sleep interval. See
`RestController.start` in `src/game/rest.ts` and `LongActions.advanceJob` in
`src/core/longAction.ts`; onset tuning is authored in
`src/content/base/body.jsonnet`, `sleepOnset`.

Moving items, reloading, and wielding are short handling actions: they take
Real time while the world continues at normal pace. See [Items](#items-and-inventory).

### Pause

The pause card freezes the game; the inventory does not. That preserves the
tension of making inventory decisions while the world continues. Keep the
frozen view visible behind an opaque panel so its centre remains useful for
screenshots.

### Catch-up simulation

Unloaded areas continue progressing and catch up when loaded. Use closed-form
updates where they preserve the same outcome cheaply, and bounded coarse steps
where they do not. The player's region and its eight neighbours are simulated
with the player's presence as an input, because a region next to the player
should behave as though the player is there. Inside that block, catch-up
agrees with ordinary ticking within each system's tolerance, because a player
can compare a short absence with what they saw; once a region leaves the block,
the coarse model is canonical. See
[ADR 0008](docs/decisions/0008-deterministic-world.md). Food owns its exposure history so
storage changes cannot rewrite its past; ambient absence can be projected without
periodic decay work. See `src/core/food.ts`, `projectFoodExposure`, and
[food ownership](docs/food.md). Unloaded zombies are represented by regional hordes, which
become individual actors when the area returns. See [Zombies](#zombies).

## Simulation architecture

Keep simulation rules independent of the DOM and renderer so they can be tested
without a browser and moved to a worker if their cost requires it. Bounded steps
and explicit system order keep simulation work predictable during compression.
Each system owns a seeded random stream so the same seed and inputs reproduce
the same result, bit for bit in every supported browser, so lockstep
multiplayer and cross-browser replay hold; see
[ADR 0008](docs/decisions/0008-deterministic-world.md). Systems communicate through events rather than calling one
another directly, which keeps consequences observable and boundaries testable.


## Saves

Leaving or reloading a live save-backed game asks the browser to confirm when its latest completed storage write or successful saved-world load is older than the content-defined real-time window; nothing can be lost right after a load. For saves, the window counts from the completed storage write, not from the saved snapshot. It uses real time because the page, not the game, is what the player closes, so it keeps counting while paused or while the Sim clock is sped up. Title screens, dead games, halted play and games without save storage do not prompt. Save timing and triggers are owned by `docs/decisions/0002-saves.md`. See `src/game/play.ts`, `startPlay`; `src/ui/saveController.ts`, `SaveController`; and `src/ui/leaveConfirmation.ts`, `shouldConfirmPageLeave`.

## World

### Storage

Uniform chunks keep the memory cost of the voxel world manageable. Saves use
stable block names because runtime ids depend on the loaded content pack, and
store unchanged terrain only as the seed, so it can be recreated; a changed
column is stored whole (`DESIGN.md`, "Edits persist"). See `src/core/world.ts`
and `src/core/saveFormat.ts`.

### Edits persist

A block or piece the player removes never comes back, and one they place stays, when its
column is generated again or the game is reloaded. Base building takes placed and
authored pieces apart for resources and places a great many blocks and pieces, so a
removal that undid itself would duplicate resources and erase the player's work, and
keeping edits must stay cheap at that scale.

A column is furnished once, and its pieces are then saved state, kept in memory for the
session, so a removed piece has nothing to return from. A column whose blocks have
changed is saved whole from then on, and its chunks stay in memory for the session, so
it is never rebuilt from the seed; unchanged columns regenerate. The save is one
compressed record. See `src/game/session.ts`, `rolledColumns`; `src/core/world.ts`,
`World`; and `src/core/saveFormat.ts`, `encodeSave`.

A piece cannot be removed while anything rests or stands on it, while a barricade stands
in its doorway, or while it holds items, so removal never strands, floats or loses
anything. Removing through a piece handle taken before a load throws, so the mistake
shows at once instead of corrupting occupancy. The action that removes a piece first
cancels the jobs that name it, so a save never refers to a missing piece. Pending
deconstruction reserves its piece against use until the job is cancelled or finished, so
paused work keeps its piece; under lockstep the reservation is ordinary simulation state,
resolved in tick order. See `src/core/blockEntities.ts`, `BlockEntities.remove`.

Destruction is not removal: a blow cannot be refused, so the removal refusals don't
apply, and everything the piece held or carried drops or falls instead. Destruction
still cancels the jobs that name the piece. See `src/core/blockEntities.ts`,
`BlockEntities.destroy`.

Because every explored piece stays in memory, a lookup must not cost more as the explored
area grows, so lookups find pieces through an index by column. See
`src/core/blockEntities.ts`, `BlockEntities.near`.

Save size and save time are held to a budget measured against explored area. One record
holding every explored piece makes save work grow with exploration, so crossing the
budget reopens whether explored furniture stays in memory and saved and whether the save
stays one record; the budget is not raised to make room. See
`test/exploredSaveBudget.test.ts` (its budget constants).

### Block entities

Stateful blocks keep their changing state separate from static block identity.
Containers use the same item-container rules as portable storage, so moving
items between furniture and a backpack does not require a second inventory
model. Multi-cell furniture has one owning anchor. See `src/core/blockEntities.ts`.

Every piece of furniture keeps the strength of the blows it has taken and authors a
durability on the same scale; its condition is the share left, and storing summed
strength keeps the blow that breaks a piece exact. Every piece yields to enough
strength, so no code or flag names a kind that cannot be ruined; content keeps a piece
that matters, such as a scenario goal or a needed ladder, by authoring a high minimum
strength and durability. Worldgen may place a piece already worn, within a range its
content authors, so an abandoned place reads as used; it never places a piece ruined,
because a ruined piece is gone. See `src/core/schema.ts`, `FurnitureSchema`, and
`src/core/blockEntities.ts`, `BlockEntities.conditionOf` and `BlockEntities.wear`.

A damaged piece shows its damage in steps its material authors and names its band in the
hint, so the player can judge what will hold before relying on it. Every piece names a
material from one furniture material table, so a mod retunes how a kind of furniture
wears without touching each piece. The hint's word comes from the condition band table
items read, and it shows no number, following `INTERFACE.md`, "Text". A view redraws a
piece only when its damage crosses into a different step, not on every blow. See
`src/core/schema.ts`, `FurnitureMaterialSchema`, `src/core/blockEntities.ts`,
`BlockEntities.wearOf`, `src/render/furniture.ts`, `FurnitureMeshes.damageLook`, and
`src/core/items.ts`, `damageWord`.

Ruin is final: a destroyed piece or a broken door is never repaired, only replaced,
because a ruined thing is mostly fragments; mending partial damage belongs to
construction.

### Ladders and hatches

Roof perches reward exploration and can make the finale easier, but do not
reduce the horde or amalgam threat. The workshop roof and FOB armoury are
intentional opportunities to fight from above.

- **Climbing.** Grabbing a ladder is an explicit interaction; walking into one
  does nothing. Climbing begins when the body reaches it. Moving toward the
  ladder climbs up and away climbs down. Jump releases the ladder anywhere;
  stepping off an edge, being knocked out, or walking away before reaching it
  also releases. Saves preserve an active hold, including an unreached grab, and
  reject a grab that names no ladder. The climber stays centred so the body fits
  through a hatch. Climbing has fixed speed and costs no stamina, unaffected by
  sprinting, load, or injury. See `LadderHold` in `src/core/ladders.ts` and
  `grabbedLadder` in `src/core/saveFormat.ts`.
- **Hands.** The off hand holds the ladder, leaving the dominant hand free for
  one-handed actions. The climber stays still during an action. Anything needing
  the off hand or both hands is refused; items already in the off hand are not
  silently moved to the free hand. A throw charged in the held hand is refused
  if the ladder takes that hand, and a released throw is admitted on the tick
  that carries it out. See `freeHand` and `refusal` in `src/core/ladders.ts`,
  and `refuseForLadder` in `src/game/throwCharge.ts`.
- **Top and fall.** Moving toward a ladder at its top steps off onto the surface
  it serves. A roof-edge ladder reaches roof level; one beneath a hatch ends
  below the hatch and steps through it when open. Climbing down is not a fall;
  any hard landing is measured from where the climber releases. See `braced` in
  `src/core/physics.ts`.
- **Shamblers.** They do not climb and remain on the ground.
- **Hatches and placement.** A hatch is a roof or floor door: shut blocks,
  open permits passage from either side, and its state is saved. It takes no
  lock. A ladder is an open frame, so a climber can reach the hatch above while
  an off-ladder player selects the ladder to grab it. Roof ladders must not be
  blocked by a door and need body clearance in front. See `hatchPanel` in
  `src/core/blockEntities.ts` and `throughLadders` in
  `src/core/furniturePick.ts`.

### Moving furniture

The player can move what blocks a way through, so a room the generator jammed
is fixable in play rather than a dead end. Size stands in for weight and
strength without adding another actor stat. Destructive clearing stays separate
because rearranging a room should not require destroying its contents. See `src/core/furnitureMove.ts`,
`liftFurniture`, `placeFurniture` and `slideFurniture`.

- **Oversized pieces.** A piece too large to lift need not make a room a dead
  end. Dragging reuses picking up and holding, constrained to the floor plane:
  one interaction to learn and one code path to maintain, rather than a separate
  drag mode. Pushing remains a floor step because it moves an obstacle without
  holding it. See `src/core/furnitureMove.ts`, `liftFurniture`, `placement` and
  `slideFurniture`, and `src/game/session.ts`, `liftPiece` and `slidePiece`.
- **Movement choices.** A tap on movable furniture does its ordinary use (open,
  search, rest, read), so the common action stays one tap. A tap-and-hold opens
  the list of other actions, push and drag, with disassembly joining it later, because rarer actions that move or break the piece sit behind a
  deliberate hold. Readability does not fasten a board; its ordinary use stays
  on the tap. The list belongs to movable kinds: building parts keep direct use
  because offering impossible moves would obstruct their ordinary interaction.
  A fitted placement of a movable kind still offers the list and explains why
  it cannot move, so fitting does not silently change that kind's controls.
  An open list is a single confirmation, not a persistent interaction mode:
  returning from a pause or another target must not unexpectedly act instead of
  offering choices. See `src/core/furnitureMove.ts`, `slidableFurniture`,
  `src/game/play.ts`, `furnitureActions`, and `src/game/furnitureActions.ts`,
  `FurnitureActionSelection`.
- **Held pieces turn and tip.** A dragged piece is a held piece with its floor
  height fixed, so it turns and tips like any held piece; only setting down
  needs the level floor. See `src/core/furnitureMove.ts`, `turnCarried`,
  `tipCarried` and `placement`.
- **What lifts.** Pieces that are part of the building stay put. Fitted is a
  mark on a placement, not a definition, because the same cupboard is fixed in
  a kitchen and loose in a shed. A moved piece keeps its origin, so generation
  that runs again over that column never puts a second copy back. See
  `src/core/furnitureMove.ts`, `movableRefusal`, and
  `src/core/blockEntities.ts`, `BlockEntities.addWithUid`.
- **Hands and stamina.** Hands are already the slots that hold things, so
  carrying occupies both of them rather than a new carry slot. Items, ladders
  and furniture answer to one hand authority, so no combination leaves a hand
  doing two jobs at once. See `src/core/inventory.ts`, `HandHold`, and
  `src/core/ladders.ts`, `LadderHold`. Lifting costs stamina and carrying
  drains it, so moving a room's worth of furniture is a choice paid for, not a
  free reshuffle. A worn-out player puts the piece down where it fits; when
  nothing fits the piece stays held until something does, because dropping it
  through a wall or a body is worse than holding it a moment longer. See
  `src/game/session.ts`, `putDownWornOut`.
- **Carried sleep surface.** A bedroll lets the player sleep where they are at
  worse recovery than a bed, paid for by carrying it in the hands, so resting
  becomes a choice between place and quality. It lifts because a cover piece is
  exempt from the size cap, not because of any rule about bedrolls, and its
  recovery stays below every fixed sleep surface. See
  `src/core/furnitureMove.ts`, `movableRefusal`. Packing it into the inventory
  is a separate item-to-furniture conversion that waits for its own decision.
- **Noise.** Moving scrapes, and shamblers hear it like any other world sound,
  so barricading under pressure has a price.
- **Stacks settle once.** Settling belongs to the move rather than every tick,
  so a stack pays no ongoing simulation cost. Floor steps use the same support
  rule as lifting: what remains supported stays, and what loses support settles
  instead of riding the piece. A fall with no loaded floor is refused, because
  an unloaded chunk reads as air. See `src/core/furnitureMove.ts`, `settle`.
- **Nothing falls on a body.** Hurting the player with their own tidying would
  punish an action the game wants them to take, and crushing shamblers with a
  stack would be a cheaper weapon than any the game balances. Lifting and floor
  steps therefore share the fall refusal; see `src/core/furnitureMove.ts`,
  `fallRefusal`.
- **Nothing moves from under a body.** Movement and removal share one support
  query so no parallel rule can drift. Clearing a body off a piece needs a
  separate decision rather than making furniture movement a weapon. See
  `src/core/furnitureMove.ts`, `supportRefusal`.
- **What lies on top.** Moving a container is not searching it. Pockets stay
  intact, while loose items settle with the stack rather than being lost or
  buried. A move with nowhere for them to land is refused for the same reason.
  See `src/core/furnitureMove.ts`, `resettlePiles`.
- **Where it can stand.** A piece may not cover a hatch or fill the space a
  climber stands in front of a ladder, since either would wall off a floor. A
  flat cover may lie on a shut hatch, because it walls nothing off and hiding
  a way down is what the secret cellar rests on. A hatch with a cover on it
  will not open, from either side, until the cover is lifted: refusing keeps
  "an open hatch is a drop" true, so no cover ever lies over an invisible
  fall, and it adds no saved state. An open upright door's doorway takes a
  piece, because barricading a door is a use, not a mistake; the door then
  cannot close over it, and a moved piece blocks shamblers like any solid. The
  front of a shaped container is its body, which an open door doesn't clear,
  and an open hatch is a drop, so neither takes a piece. See
  `src/core/furnitureMove.ts`, `standRefusal`, and `src/core/blockEntities.ts`,
  `inDoorway`.
- **Covers.** A cover is a flat, loose, non-solid piece, such as a rug or a
  tarp: walking and sight pass through it, and a pick hits it before the hatch
  under it. The size cap does not apply to a cover, because a rug rolls up and
  the secret hatch is wider than the cap allows a piece to be. A cover is never
  fitted, because the room it hides must stay openable. See
  `src/core/schema.ts`, `FurnitureSchema`, and `src/core/content.ts`,
  `checkPaletteObjectRefs`.
- **A carried piece carries its contents.** An explosive inside a carried
  piece goes off at its carrier, because the piece is in their hands, not where
  it last stood. See `src/game/session.ts`, `detonationPoint`.
- **Seen while carried.** Carry feedback must agree with where the piece can
  be put down, without hiding the placement outline. A dragged piece stays
  visibly on its floor plane rather than floating with the player's view.
  Presentation reads the hold owner so it cannot outlive the hold. See
  `src/render/carriedPiece.ts`, `CarriedPiece`.
- **Turning and tipping.** Lifted pieces can be reoriented because a piece
  that could fit through a doorway laid over should not become a dead end.
  World-relative axes make a press predictable wherever the player stands.
  Rotation feedback needs no separate aid or charge: the piece and placement
  outline show the result, and lifting and carrying already pay for the move.
  Dragging retains the floor-step restriction on reorientation rather than
  introducing a new rotation rule. See `src/core/furnitureMove.ts`,
  `turnCarried` and `tipCarried`, and `src/core/orientation.ts`, `turnPose`.
- **Refusals live in content.** Each refusal says why in a short first-person
  line, kept in content with the other UI text so a pack can reword it.

### Generating the world in layers

Generation is deterministic from the seed and coordinates, so chunks can be
requested independently and in any order. Region and settlement context shapes
local terrain and authored structures; a structure spanning chunks must not
read neighboring chunk state. Keep authored-site terrain variation restrained
around structures, routes, and spawn so shaped ground does not look like a flat
platform or cut-out tree border. Site-generation controls belong in content,
not in authored layout geometry. See `AuthoredSite` in
`src/core/authoredSite.ts` and the site-generation schema.

Small structures use authored templates because they are reviewable and
content validation can check them. Keep template representation and import
mechanics in the implementation rather than repeating the format here.

### Gauntlet

Gauntlet uses ordinary survival rules, not a second mission runtime. Its arrangement
is designed from the start tower outward so the roof overview, civic stops and destination
form a legible place rather than a lucky row draw. Authored lots preserve that arrangement
while their house draws retain replay variety. Containment bounds hold only the points
of interest, their yards and filler housing, avoiding a fringe that makes the area too
large. Adding a point of interest is the trigger to expand those bounds, not a reason
to reserve empty city in advance. Reserving the service campus makes its street approach
constructible; knowing a clue never grants access. Independent notes in separate civic
buildings give alternate ways to infer the destination. See
`src/content/base/gauntlet-layout.libsonnet`, `lots` and `paving`, and
`src/core/cityLots.ts`, `placeCityLots`.

The play area is closed by physical voxels, not an invisible wall: a continuous
containment wall with sealed checkpoints makes the limit visible. Its worn foot shows
abandonment without an authored walk-through hole. The containment wall is deliberately
exempt from passable breaches because it encloses the playtest area; buildings and yards
inside it have alternate ways through their damaged perimeters. Those gaps are real
routes, not only a weathered look. There is no perimeter band of housing. Ordinary
movement, doors and destruction remain authoritative, rather than a separate admission
rule predicting whether a jump can clear the wall. Sounds and crowds beyond the wall
are a separate decision. The ground around the wall is flat at the city floor, because the
gauntlet is a confined playtest area and relief beyond the wall would only be
unreachable scenery; a distant ridge can return later as an authored feature. The
scenario opts in, so other sites keep their natural ground; see `src/core/citySite.ts`,
`surface` and `src/core/schema.ts`, `flatSurroundings`.
See `src/core/cityPlan.ts`, `cityPerimeter`, `perimeterGaps` and `perimeterIssues`. City size, scarcity and
pressure need in-game judgment; multi-day pressure growth and needs-rate authoring
remain outside #671's first version.

Dense blocks need inner circulation, not deeper empty lots behind two facade rows.
The benchmark and scenario share a finished plan so streets, reserved approaches
and stamping cannot diverge. Playable upper floors use authored stairs rather than
benchmark stacking. Elevated routes reward getting onto structures and traversing
away from default ground; not every structure must provide one, and existing
movement remains the only authority. See `src/core/cityPlan.ts`, `buildCityPlan`;
`src/core/citySite.ts`, `CitySite`; and `src/content/base/gauntlet-city.libsonnet`,
`templates`.

The start tower guarantees a melee weapon, a revolver and revolver ammunition
instead of rolling for them, because the player who spawns on the roof can meet
a fight before reaching the city and a roll that came up empty would leave them
unarmed. It guarantees a backpack the same way, so the player can carry what
the tower and the first streets offer before the descent instead of leaving it
behind. See `src/content/base/gauntlet-start-rooms.libsonnet`, `loot`, and
`src/content/base/gauntlet-start.libsonnet`, `start`.

Gauntlet stock has three layers. The economy layer is what a building's template
rolls from its loot context and tables, so a place holds what suits it. The core
layer is stock the gauntlet instance promises at its stops, because the lab must be
winnable and a roll cannot promise that; Upheaval stays procedural and promises
none. The reward layer rewards exploring and need not suit the place; it belongs
to the gauntlet instance, not the location's template, and needs no in-game
reason. Promised stock still passes the economy check under its holder's loot
context. Stock that does not suit the host building comes from a special event: a
small authored scene, such as a dead special operations soldier, with its own loot
context, which the instance places on another building's lot. The event is not
linked to that building; it sits on cells the host leaves empty and is not a clue.
The rifle lies on the soldier's body and the magazine and the NVGs are in its pockets,
because `DESIGN.md`, "The item model" keeps the pocket real-sized while loot lies outside
containers; the substation gives a military reward ahead of the lab. An event may author its own threat, which spawns with it
so the scene tells its story; how those markers count against the scenario's
population budget remains open. An authored event carries the promised reward, so
fixed stock still passes the economy check without bending a place's theme. Stock that suits the place but not
its context's tier is a content fix to the context instead: the crisis HQ is a
military command post, so its tier admits military items such as a rifle, and no
event is needed there. See `src/content/base/crisis-hq.jsonnet`, `military`.
A promise names a fixed lot and a container anchor in that lot's building or event and
leaves the template unchanged. Validation refuses a promise without a fixed lot or
an anchor, an event outside its lot or over the host's blocks or furniture, and fixed
container stock that fits no pocket of its furniture; the
seeded build and furnishing throw rather than drop it, because a silently dropped
promise would leave the lab unwinnable. Certified promised stock means the item is
there and fits its container, nothing more. Reach is proved only for stock a scenario
resource names, as the police armoury's rack is (below). Other stops are few and
hand-placed, so review and play own their reach, but an edit that cuts one of them off
fails no check, and saying so keeps that risk in view. Each stop has its own role, and the player
may visit them in any order, so finding the stock rewards exploring rather than
following a rail. See `src/core/schema.ts`, `ScenarioSchema`;
`src/core/scenarioComposition.ts`, `scenarioCompositionIssues` and
`composeScenario` and `eventIssues`; `src/core/placementLoot.ts`,
`placementLootIssues`; `src/core/inventory.ts`, `furnish`; and
`src/content/base/scenarios.jsonnet`, `composition`; and
`src/content/base/gauntlet.jsonnet`, `utilities`.

A stop's rolled stock follows its place theme, not its building. Each stop takes a
theme context, the station's carrying the Police usage and the HQ's Military, and
tables are written per theme rather than per building, because finding what suits a
place is the economy's job (`DESIGN.md`, "Loot"). Two stops of one theme therefore
roll alike; a stop that should feel unique gets that from its instance layer, not
its rolls. The station, the HQ and the armed rooms share role tables, and each
source's context admits only the rows it allows, so the station never rolls the HQ's
rifles. See `src/content/base/gauntlet-city-building-types.libsonnet`, `armoury_arms`.

The police armoury key lies on a dead officer on the station's roof, which the
start overlooks. The start's lookout keeps that view clear rather than hiding the
officer behind its own roof edge. This gives the armoury a route independent of
the sewer, whose exploration already carries enough. The key route and the
blowtorch route must remain independent alternatives; neither should require the
other. See `src/content/base/rural-police.jsonnet`, `templates` and `loot`, and
`src/content/base/gauntlet-start.libsonnet`, `start` and `mapPieces`.

The blowtorch has one source: the secret cellar's footlocker, with one cartridge fitted. No economy table rolls a torch. The torch is one of the armoury's two routes, so a single hidden source keeps that route the price of finding the secret. Spare cartridges are ordinary hardware and garage loot. See `src/content/base/gauntlet-city-cellars.libsonnet`, `reward`, and `src/content/base/loot.jsonnet`, `building_tools`.

The armoury's gun is a proved resource through the key route alone: the certificate
walks from the start up the officer's ladder, takes the key, comes back down and
reaches the rack through the station and the armoury door the key opens. Without that
proof, a layout edit that cuts the key's route would go unnoticed until play. The
torch is no part of the guarantee, because its route is the bonus for finding the
secret. A ladder on an outside wall holds the climber flush against the wall, so the
climb check accepts that pose where the wall runs the whole climb. See
`src/content/base/scenarios.jsonnet`, `resources`; `src/core/scenarioCertificate.ts`,
`lotResource`; and `src/core/climbCertificate.ts`, `wallBacked`.

Dead scavengers who came for the lab before the player lie by its hatch with
rolled pockets, so the approach signals that the lab needs preparation before the
player commits to it. See `src/content/base/gauntlet-service.libsonnet`,
`gauntlet_scavenger_pockets`.

The gauntlet is the default entry because one discovery route should carry the playable start rather than compete with a separate sandbox. The authored playtest remains an independently selected route. See `src/game/config.ts`, `makeConfig` and `configFromUrl`.

The shambler CPU and browser benchmarks use the same forest world because a playable scenario's enclosed start can prevent the benchmark's sight-ring placement. Keep that workload independent of the default entry. See `src/bench/shamblerWorld.ts`, `createHeadlessShamblerWorld`, and `src/main.ts`, `bench`.

Marker-only population omits the ordinary settlement's wanderers and horde, making
empty marker sets silently remove street pressure. A scenario therefore scales the
ordinary settlement policy by building groups, not by the reserved campus's empty
area, while authored markers stay separate. The policy is the scenario's
`population` content, so any scenario tunes its street pressure without code.
The gauntlet places one horde rather than one per building group, and stragglers
carry more of the street pressure. This reuses population and spawn
admission instead of inventing an enemy-density runtime. See `src/core/schema.ts`,
`ScenarioSchema`; `src/content/base/scenarios.jsonnet`; `src/core/gauntlet.ts`,
`gauntletPopulation`; `src/core/settlementSpawns.ts`, `settlementZombieSpawns`; and
`src/core/zombieSpawns.ts`, `ZombieSpawner`.

The route/save browser flow proves connectivity and persistence, not balance or
combat. Its test-only admission omits settlement crowds and the lab's authored
markers before world construction, including on reload, so neither can turn that
proof into an encounter trial: a scripted walker would only stall on a chasing
zombie. The body and rules stay ordinary: damage, collision and the dead-survivor
barrier apply, and default play keeps both populations; lab encounters are judged
in play. See `src/core/gauntlet.ts`,
`GauntletSite`; `test/browser/save-controller-regressions.mjs`, `observation`; and
`test/browser/gauntlet-flow.mjs`, `gauntletFlow`.

Admission fails closed because dangling references, ambiguous selectors, overlapping
reservations or a building that cannot fit its admitted placement would otherwise break
the designed route before play begins. A landing near a ladder is insufficient if a partition separates them;
local portal admission and the final composition must both preserve the normal
ladder owner's supported, body-clear entry and braced exit. Entry palette markers
prevent later descents from being mistaken for the entrance. Whole-cell voxel
queries prevent fractional sweep poses from reading an unrelated array slot.
The plan freezes placement decisions; compiled template buffers remain
compiler-owned inputs. Repeated buildings share immutable leaf compilation within
one planning pass because recompiling the same leaf for each slot wastes startup
work. Style bindings and per-slot provenance remain independent, and a later
compilation must see registry edits rather than a process-wide cache. See
`src/core/templates.ts`, `compileMapPiece`, and `src/core/cityPlan.ts`, `templateCompiler`.
Stamping never consumes the column index, because later
vertical chunks and furniture requests need the same complete plan. See `scenarioPlanIssues` in `src/core/cityPlan.ts`,
`scenarioPortalIssues` in `src/core/scenarioPortal.ts`, and `templateBodySpace`
in `src/core/templateSpatial.ts`; see also `templateReachableStandingPositions`
there and `src/core/ladders.ts`, `ladderOutward`.

Lab threat grows with depth so descending feels like going deeper into a failing
facility, not repeating one room. Each level authors weighted marker rows and places
its own marker cells, so threat follows depth and not a level's function, and where a
level puts its cells sets which rooms are dense. The threat first changes kind on the
research level, where the place turns from offices to labs, and special research still
carries more of the dangerous kinds. The rows are slot choices, so a mod retunes a
level by overriding data. The amalgam is never a weighted row: its body needs space
built for it, so it has one dedicated marker where that space is. See
`src/content/base/gauntlet-lab-threat.libsonnet`, `rows` and `amalgamSlot`; and
`test/scenarioCertificate.test.ts`, "lab threat by depth".

One owned assembly supplies the service facade and underground campus, so the
playable world and visual inspection cannot diverge into separate geometry.
Fixed resources and promised core stock are present whatever incidental loot rolls.
Promised stock alone is presence; a resource adds reach from the start.
Public documentary leads must be independently useful and spatially separate;
reading one cannot authorize another. Named civic buildings keep the clues part of
plausible places, while reserved destination landmarks keep the written directions
consistent with the designed approach. Utility silhouettes alone should not reveal the
destination. See
`src/content/base/gauntlet-service.libsonnet`, `mapAssemblies`;
`src/content/base/scenarios.jsonnet`, `composition`; and
`src/core/scenarioComposition.ts`, `composeScenario`.

Furniture anchors rotate as occupied boxes, while standing poses rotate as
continuous points. Keeping these distinct prevents turned resource and objective
metadata from pointing beside its furniture. Fixed-loot reference, container and
source-context rules share an owner across authored layouts and city composition;
the same placement transform supplies their runtime items. This makes a resource
independent of incidental loot without bypassing ordinary inventory rules. See
`src/core/placementLoot.ts`, `placementLootIssues`; `src/core/loot.ts`, `rollLoot`;
`src/core/authoredLayout.ts`, `authoredLayoutIssues`; and
`src/core/citySite.ts`, `furnitureIn`.

Tests prove that the final composition can be finished, because a locally valid
template cannot protect the route from later stamping or furniture. Play doesn't
wait on a runtime proof, because proving the route at world build stalled the main
thread before Go. The accepted risk is that a seed no test covers can be
unfinishable; a playtest report of such a seed becomes a fixed-seed test. Default
tests certify fixed seeds, and a seed sweep runs behind the `DEADVOX_SWEEPS` flag as
its own CI step. The certificate reads the same planned, stamped chunks and
furniture occupancy as play, without materializing the whole city. Authored entrances and perimeter crossings belong to that
proof: finding a detour around a fence does not certify a blocked breach. Furniture anchored across a chunk boundary still
belongs to an envelope that crosses that boundary. Clearance caching is private
to this immutable initial-world proof, not a cache of live edited terrain. See
`src/core/scenarioRoute.ts`, `ScenarioRouteSpace`; `src/core/scenarioCertificate.ts`,
`scenarioCertificate`; and `test/gauntletRoutes.test.ts`.

A sewer from the HQ yard to the lab's entry level is a second way in, and a trade
rather than a shortcut: it skips the street run to the hatch, but the tunnel is dark,
sparsely haunted and opens through a guard room whose containers may roll police arms
and ammunition from the existing tables. Its mouth is visible at street level and no
note points to it, so the sewer is found by looking. Because it is a real entrance,
admission requires a body-clear threshold through the lab's shell into the entry
level's circulation, and the certificate proves the street reaches each mouth and
each mouth reaches each port as surely as the hatch reaches the lab; an accepted
route that play cannot cross would be worse than none. Elements list their mouths and
ports so a later network adds entries rather than a rewrite. The plan places them in
three dimensions and refuses one that claims a cell another placement owns: a
corridor may pass under a building but not through it. See
`src/core/cityUnderground.ts`, `placeUnderground`;
`src/core/scenarioPortal.ts`, `undergroundPortIssues`;
`src/content/base/gauntlet-sewer.libsonnet`, `mapAssemblies`; and
`src/content/base/gauntlet-lab-threat.libsonnet`, `rows`.

A resource's route passes a lock only with a key the proof takes on its way from
the start, never a key or tool whose acquisition depends on the resource itself. An
unlocked door is reversible; a locked door is not assumed open simply because its
key exists somewhere. A key opens its locks only for its own resource's proof: a
resource without a key is proved with none of them, so a lock that stays open for a
later resource would turn a key-only route into a false promise of reach from the
start, depending on the order resources are listed. See `src/core/scenarioRoute.ts`,
`withLocks`. Independent
public clue access must survive missing either lead; possession and reading
never authorize the route. These are construction guarantees, not proof of clue
interpretation or survival balance. Those judgments remain the integrated play
gate on #671.

Discovery observations distinguish designated public-lead reads or readable-item pickups, landmark and
building proximity, reachable entrance hatch encounters/open state, accepted
travel through the entry ladder envelope, and passage through a sewer port's
threshold, so an attempt records which way the player came in. Generic furniture
reads or other ladder travel cannot stand in for this funnel. Missing events are missing observations,
not proof that a player failed to interpret a note or that an entrance was broken;
optional player descriptions and BR's play supply those judgments. Direct discovery
remains legitimate. The attempt snapshot preserves first observations and completion
freezes them so Continue cannot rewrite the journey. See
`src/core/scenarioDiscovery.ts`, `discoveryForPlan`; `src/core/scenarioRun.ts`,
`ScenarioRun`; and `src/game/session.ts`, `createSession`.

The lab's four underground levels follow a working facility's progression from entry
and security through administration and general research to special research, with
the nuclear objective on the last, so the rooms explain why the player keeps
descending. Each function from the drawn plan gets a level, but the drawing is
inspiration, not a blueprint: its mood guides the build and BR judges fidelity in play.
Looped circulation and separated descents make exploration and retreat choices rather
than one corridor and a continuous climb. The levels share one builder and one scale,
so a level's rooms keep their proportions and a fix to the builder reaches every level.
See `src/content/base/gauntlet-lab-level.libsonnet`, `build`, and
`src/content/base/gauntlet-lab.libsonnet`, `mapAssemblies` and `anchors`.

The stair is the main way down because a building's descent should read as one. A
lidded shaft remains an alternate return route. Each level's stair and shaft leave from
different places than the ways that arrive on it, so the next way down is something to
find and retreat by the other route is a real choice. The deepest level has no onward
descent: its loops serve exploration and retreat around the destination. Threat is
allowed to move between levels; that behaviour is not built. Depth ordering is not a
promise of isolation. Floors damp sound like walls rather than silencing it between
storeys; see `src/core/soundOcclusion.ts`, `soundOcclusion`. See
`src/content/base/gauntlet-lab-administration.libsonnet`, `stair`, and
`src/content/base/gauntlet-lab-descents.libsonnet`, `shaft`.

The objective occupies special research's central chamber so the floor's strongest
spatial landmark is also its end. The amalgam shares the destination so the final
interaction takes place under the encounter's pressure; the button stays reachable
without a kill, because the goal never required one. The amalgam waits in a specimen
pit sunk below the chamber floor, so the encounter is a look down from the rim rather
than face to face. The pit gives its whole body room inside special research, so the
research level above stays untouched and the creature keeps its full size. A ladder in
the pit lets a player who falls in climb back to the rim. See
`src/content/base/gauntlet-lab-special.libsonnet`, `pitPiece`, `amalgam` and `objectiveFace`;
`src/content/base/gauntlet-lab-threat.libsonnet`, `amalgamSlot`; and
`src/content/base/scenarios.jsonnet`, `composition`.

Deeper lab stock keeps the shallower tiers, so depth adds possibilities rather than
replacing ordinary supplies. Special research's experimental-arms locker rolls a table
no other source shares, so what it holds is a discovery at the deepest level rather
than equipment found elsewhere in preparation for it, and none of it is needed for the
objective. The laser rifle joins that table when #1128 defines it. See
`src/content/base/gauntlet-lab-special.libsonnet`, `loot`.

The hatch-side entrance is open. Each rebuilt level's ways down need that level's own
keycard, from one authored spot on its open side. A card may be stock in a container
instead of lying in the open, so that finding it is a search rather than a sighting.
Level three's card is harder to reach than level two's by place and threat, not by
mechanism: it is in a dead researcher's pockets in the breached lab, the level's densest
threat room, off the main route. A harder place costs one furniture piece, while a new
mechanism would change the certificate or the engine. Acquisition cannot depend on the seal
it opens. The seals are vault or bulkhead doors, which a crowbar cannot force: only
the card opens them. The certificate checks seals top-down: each level's matching
card must be present, reachable from the hatch landing with only the seals above it
open, and within pickup reach, in the open or in its container, before its locks are admitted to the descent
proof. Checking in that order means no card can depend on its own seal or a deeper one,
which would make the run a dead end. Cards gate ways down, so special research, which
has none, has no card: level three's seal is the last clearance, and the destination is
open to whoever reaches the level. See
`src/content/base/gauntlet-lab-administration.libsonnet`, `seal`;
`src/content/base/gauntlet-lab-research.libsonnet`, `lab_breached`;
`src/content/base/gauntlet-lab-level.libsonnet`, `cardStock`;
`src/core/scenarioCertificate.ts`, `seals`; and `src/core/prying.ts`, `pryPlan`.

Each level is fully built and judged in play before the next one, so the first level
sets the look and the destination is built last.
The authored plan scales rooms together while equipment and doors stay human-sized.
Rooms differ in
height, finish and furnishing so each reads as its own space under a carried light.
Loops run between rooms instead of along a one-sided excavation corridor that serves
nothing; unused excavation stays solid rather than making the rooms larger and emptier.
Delegated equipment bays prevent furnishings from borrowing thresholds or circulation.
A level that holds a hazard separates its staff side from its working side through a
changing or decontamination room, with a second way between them, so the player reads
where the danger is without being forced through one small room. Those cues are not a danger or balance proof. A room stocks from a loot context that
fits its use, so what a search turns up says what the room was for; few rolls and
heavy nothing weights keep the lab scarce. In-lab papers explain the facility without
authorizing access: staff notes filed in special research's records vault tell the work
and its failure but give no directions, so finding the destination stays architectural.
See `src/content/base/gauntlet-lab-entry.libsonnet`, `rooms` and `plan`;
`src/content/base/gauntlet-lab-administration.libsonnet`, `rooms`;
`src/content/base/gauntlet-lab-research.libsonnet`, `rooms`; and
`src/content/base/gauntlet-lab-special.libsonnet`, `rooms` and `items`.

Level two's briefing hall is double height: it extends down into a column that the
research level reserves for it, so a level gains one tall space without a storey of its
own. The well's walls are whole so the hall stays apart from the research level around
it, and its floor steps up so a player can climb back out. See `src/content/base/gauntlet-lab-administration.libsonnet`, `well`, and
`src/content/base/gauntlet-lab-level.libsonnet`, `voids`.

Level two carries a larger population than level one because BR judged it too thin in
play. Its spawns spread over the briefing hall, the corridor, the canteen and the offices,
so no single room holds the danger, and the storey below stays at least as dense so threat
still grows with depth. See `src/content/base/gauntlet-lab-administration.libsonnet`,
`markers`, and `src/content/base/gauntlet-lab-threat.libsonnet`, `rows`.

The underground campus extends beyond the small service facade because a surface
disguise must not dictate the lab's capacity. One compiled assembly owns their common
excavation; an independent copy would let the visual preview and playable routes drift.
Closed descent lids support the neighboring floor cells as well as the ladder column,
so walking an upper room does not accidentally commit the survivor to a drop. The
real-city session witness opens these lids and proves the furnished descent and return.
See `src/content/base/gauntlet-service.libsonnet`, `mapAssemblies`,
`src/content/base/gauntlet-lab-descents.libsonnet`, `mapPieces`, and
`test/fixtures/scenarioCertificate.ts`, `traverseScenario`.

Portal anchors address furniture in the finished assembly rather than palette markers
inside one source piece. This keeps portal admission independent of how the facade and
lab are decomposed. Static admission indexes occupancy before body queries because a
multi-room campus must not scan every furnishing for each clearance cell. See
`src/core/scenarioPortal.ts`, `portalPieces`, and `src/core/templateSpatial.ts`,
`TemplateSpace`.

The objective's terminal win is a session/save decision, not an observer counter.
Live entity, reach and unobstructed gaze admission prevents a stale displayed
interaction from winning remotely; an already dead survivor cannot activate it.
Completion stops the attempt, while presentation distinguishes victory from
acknowledged storage. A failed write leaves the earlier checkpoint intact and
keeps ordinary save recovery visible, rather than claiming the win is durable.
A restored completion remains terminal and cannot count another success. See
`src/game/session.ts`, `activateGoal`; `src/core/scenarioRun.ts`, `ScenarioRun`;
`src/core/saveFormat.ts`, `validateWire`; and `src/ui/saveController.ts`, `finishWin`.

Attempt observation belongs in the snapshot so Continue neither pools another
survivor's counters nor counts the restored pose as travel. Export identifies
the build, scenario, world and character instead of pooling by seed. Accepted
physics movement includes ladder travel, while debug displacement is not play
travel. Observation never authorizes the objective. Replay is a fresh attempt,
with no attempt history or resurrection. A frozen playtest follows successful
play approval and #660's separate publishing prerequisites so a round retains
its build and origin.

Discovery cues must not be unique merely by material. The city plan must scatter
incidental structures in the same visual family with different silhouettes,
so the exhausts reward recognizing their arrangement and context instead of
spotting the only matching colour. Keep that ambiguity compatible with the
independent notes; visual redundancy is not a false-destination quest chain.

Rendered geometry, lighting and clue interpretation still need player judgment:
construction and route proofs cannot establish a legible discovery experience.
Readable furniture does not confer objective authority; the live interaction must
reach the terminal button. See `src/core/scenarioCertificate.ts`, `scenarioCertificate`,
and `src/game/session.ts`, `activateGoal`.

The whole lab shares one grid, fed by a generator on its first subterranean level.
Its small fuel reserve makes working lights temporary rather than a permanent escape
from darkness. Lights and machinery declare their electrical roles in content; there
are no per-level breakers or player refuelling interaction. See
`src/content/base/gauntlet-lab.libsonnet`, `furniture`;
`src/content/base/gauntlet-lab-entry.libsonnet`, `rooms`;
`src/core/sitePower.ts`, `SitePower`; and `src/game/session.ts`, `createSession`.
Darkness also uses world-derived sky transport and ordinary carried light. Finished site placements
expose the same sky eligibility contract across authored layouts and
scenario composition. Benchmark city plans do not opt into scenario
sky work, preserving their stress policy. Demo stock stays outside ordinary
reachability, while admitted scenario templates and fixed items are world sources.
See `src/core/site.ts`, `Site`; `src/game/engine.ts`, `createEngine`;
`src/core/citySite.ts`, `authoredPlacements`; and `src/core/reachability.ts`,
`worldSources`.

### Points of interest

Loot and threat rise with distance from the spawn area and near lab sites. Labs
are the source of the weirdness: mutation pressure and hazards spread outward.
Keep that spatial relationship in region-generation rules; content owns the
specific sites and their rewards.

### Debug scenes

Keep the firearm-handling range in the debug test house, not ordinary world
sites, so test stock cannot become a playable-world loot source. Derive rack
contents from firearm and ammunition compatibility rather than maintaining a catalogue.
See `src/core/range.ts`, `HandlingRange`, and `src/game/testHouseRange.ts`,
`testHouseRangeSupply`. Every addition must decide its normal or debug-only scope;
see `docs/test-house.md`, "Normal and debug additions".

### Loot

Choose every world-supply item through one selector so source-specific rules cannot
bypass admission and a loot unit's floors and caps have one candidate-filtering boundary. Tables
own relative weights and variants, not geography; fixed progression stock uses the
same admission without becoming optional. Source-point identity owns the random
stream, keeping generation independent of chunk request order. See `src/core/loot.ts`,
`selectLootType`, `rollLoot` and `lootPointStream`.

Usage tags and tiers decide which items a source admits, so what a place holds matches
what it is. See `src/core/loot.ts`, `economyEligible`.

Furniture has no loot table of its own; only a placed container has one, named by the place it stands in, and later by its loot unit's plan. What a container holds follows from where it stands, not from what it is, so a bunker's wardrobe and a bedroom's can hold different things, and no container rolls a table its author never chose.

Police is its own usage, apart from Hunting, because a police armoury holds police
stock, not a gun store's or a hunter's. The HQ vault's Military context differs from
the station's by tag rather than by a separate table. A tag filters only the items it
narrows; one that every common item carries filters nothing. Police narrows only items
no other place should hold, such as the armoury key; the station's guns, vest and
radio stay common, so Police alone keeps rifles out of the station. Item tiering stays
open.

Medicine is rare outside medical places in every scenario: shared tables such as home
furniture, pockets and kits weight it low, and the strong analgesics are Medical-only,
while the common one stays findable anywhere. A medical detour is worth making only if
the street does not already supply it. Shared tables give one knob for every scenario,
so Upheaval's survival balance moves with the gauntlet's; whether its pace still works
waits on a playtest. See `src/content/base/economy.libsonnet`, `medicalItems`, and
`src/content/base/loot.jsonnet`, `shambler_pockets`.

Loot never depends on the order in which places are visited. There is no map-wide
running count of what has spawned, because such a count would make one police station's
stock depend on which stations the player reached first. A central economy that counts
the whole world and restocks toward targets serves many players on one long-running
shared server; this game is not that, and multiplayer is far enough off that it does not
shape this rule.

The economy is instead to be planned per loot unit (`LootUnit` in code): a place with its
own loot plan, such as a farm, a town block, an air base or a shed in the woods. The name
joins the `Loot`-prefixed types and reads plainly in prose; "unit" alone is generic, so
this is its one definition. A loot unit is to settle its whole plan when its first column
generates, so planning is eager inside the loot unit and lazy across the map. The plan
sets floors ("this farm has at least one pump shotgun") and caps ("at most one per police
station"), and chooses which points hold them. A loot unit's spawn points come from its
layout without generating its columns, so what bounds its size is how many points its
plan must weigh in a short pause, not its area. See `src/core/loot.ts`, `lootPointsByColumn`.

Map-wide rarity is per-point odds set in content, not a count: the odds give the
expected total, and scarcity is statistical. Tier gradients are a function of position,
such as distance from the spawn area, so they need no shared state. Required stock sits
outside every cap, so story and promised stock are never squeezed out. It does count
toward a floor for its own type: a floor promises at least that much of a type, and a
required item of that type already keeps the promise, so the plan rolls no duplicate.

Items that come together, such as a pump shotgun and shells nearby, form an ItemSet: an
anchor and its companions. Each ItemSet names where its companions may land, because the
right reach differs by set. Companion placement is best effort, never fail-closed: each
companion is tried within its set's scope and skipped if it cannot land there, so the loot
unit still generates, since a missing box of shells costs the player less than a loot unit
that will not generate, and skipping needs the least plan logic. A skipped companion leaves
its set incomplete with no trace in the world, so the plan's debug report lists what it
dropped as part of the same rule; without that report an incomplete set is silent and
cannot be tuned. Companions come as a count per anchor, not as odds, and are placed after
caps, like required stock, with no cap check or chance roll; lack of room within the set's
scope is the only thing that skips one. That leaves the most room to refine: a cap check or a chance roll on
companions can be added later, for every set or per set, without undoing anything. The
price is that until such a refinement lands, a loot unit's ammunition can exceed a cap.
How ItemSets are authored (which items form sets and each companion's count), scenario
multipliers on odds and the pool axis beyond police are open on #699.

Loot is placed once, when its place is first generated, and never restocked. What a
player takes stays gone, so scarcity holds, a searched place stays spent instead of
becoming a farm, and a spent place pushes the player on to new ones. Untouched items
never despawn either: despawning only makes sense as the other half of restocking, so
the two come together or not at all. The world is then its generation plus what
players did to it, so a save need record only changes. Dynamic events (crashes,
convoys and the like) bring supply under their own rules, outside this default.

Every visited column shares one roll-once rule, including empty columns and debug
overlays: visiting a column means the same thing whether or not it belongs to a site.
Ownership belongs to the column rather than individual points or surviving furniture,
so emptying or moving supply cannot turn a spent place back into fresh generation.
Furniture and loose supply share that barrier so changing a point cannot invite
another roll. Once a column has rolled, furniture removed from it is not re-added,
because a returning piece would bring a fresh roll of its loot, which is a restock.
See `src/game/session.ts`, `onColumn`, `src/game/columnArrival.ts`, `columnArrival`,
and `src/core/saveState.ts`, `SaveSnapshot`.

Loose supply needs supported standing space and visible reach, not furniture, so it
uses the same physical reach rule as piles the player puts down. Reserved circulation,
gateways and route poses stay free because finding loot must not compromise a certified
crossing. See `src/core/templateSpatial.ts`, `templateGroundLootIssues`, and
`src/core/reach.ts`, `pileInReach`.

A ground supply must fit one pile in its worst case, and content validation enforces it:
an overfilled pile throws when its column loads, so the check moves that failure to
validation, where it costs nothing at play time and the author sees it. Content that
needs more than one pile's worth uses several anchors. The check packs every reachable
roll with the runtime's first-fit placement and credits the source's admission rules, so
an entry the source cannot select does not count. It does not credit stack merging: each
stack is placed as its own stack, so a large fixed stock of one stackable that play would
merge into one stack (more one-cell items than the pile has cells) is refused, and the
author splits it across anchors. Crediting merging would make the exact check far too
costly to run at validation, while crediting admission is cheap and removes entries the
source cannot select. A supply the packer cannot decide within the inventory tuning's state
cap is reported as unproven, never accepted. The cap stays where content sets it: a higher cap
costs several times more per supply on big tables and still leaves some of them unproven or
overflowing, so splitting is needed either way. A table the check cannot prove fits is split
across anchors, or replaced by a smaller one, before it is ground-anchored. Column load still
throws on overflow; validated content cannot reach it. See `src/core/pileBound.ts`,
`groundPileIssue`, and `src/core/placementLoot.ts`, `groundLootSupplyIssues`.

Items carry no record of where they were born. Floors, caps and odds act when loot is
placed, so no rule needs a birthplace, and keeping one only stopped equal items from
stacking. Debug stock is kept out of the world economy by
the scene that supplies it, not by a mark on the item. See `src/core/items.ts`,
`stackRoom`, and `src/core/loot.ts`, `LootSpawnPoint`.

## Items and inventory

### The item model

An item is an instance. Identical stateless items stack; anything with its own
state is unique, so its condition, contents, and fitted parts remain the same
item in a hand, pocket, container, or pile. Item types declare components that
own behavior; the game must not branch on item IDs, including when drawing an
item. See `ItemSchema` in `src/core/schema.ts` and `itemLook` in
`src/render/itemLook.ts`.

Inventory space is a grid of rotatable item footprints and pockets. One cell is
a real length, named once in content (the `inventory` tuning's `cellMetres`),
and every footprint is its item's real size rounded up to whole cells, so a
rifle's footprint reads against a shotgun's as the guns do. Furniture
containers and pockets use the same unit at their real inside size: loot also
lies outside containers, so a small container precludes nothing, and an item
that fits no pocket of the furniture rolling it is a content error. Validation
holds content to this; see `src/core/inventoryScale.ts`. Pockets may
restrict their contents; liquids remain measured within their container.

A soft container such as a bag isn't rigid, so packed empty it is plausibly
smaller than what it holds when used: its footprint may be smaller than its
interior. A soft bag nests only when empty, because nesting it loaded would
turn that extra interior into space gained by stacking bags. A hard case is no
smaller outside than inside, so it gains no space wherever it goes: loaded, it
may go into any container with room, furniture included, as in DayZ. Rigidity
belongs to the definition rather than saved instance state. Free nesting is
plausible and realistic, but not worth its complexity yet; one loaded-case level
keeps storage manageable without excluding packed cases. Packing and filling
must obey the same limit so move order cannot create extra storage. See
`src/core/schema.ts`, `ItemSchema`; `src/core/inventoryScale.ts`,
`rigidPocketScaleIssue`; and `src/core/inventory.ts`, `Inventory.gridPlacement`.

The ammo can uses the ordinary cuboid item presentation and shed loot, because
a steel box suits that shape and belongs among tools without needing a firearm
model or military-only supply. See `src/content/base/items-other.libsonnet`,
`ammo_can`, and `src/content/base/loot.jsonnet`, `shed_tools`.

A soft bag's interior has no bound against its footprint; each bag is balanced
by hand in content. Two soft bags of one volume, a plastic garbage bag and a
rucksack, differ greatly in packed size and in worth, so no formula fits them.
Nothing then stops a bag from holding any amount, so content review owns that
balance; stacking can't multiply it while only empty soft bags nest.

Pockets have no weight limit, but total carried
weight slows movement and costs stamina. Condition is readable as a word, with
exact values available on inspection. Condition reads as a band word from one
content table shared by items and furniture, so a mod retunes or renames the
bands without a code change.

Item descriptions identify the item, not its controls. Controls belong to the
binding table and displayed controls list, because bindings can change. See
`INPUT_BINDINGS` in `src/game/inputBindings.ts`.

### Hands: what you see is what's there

Inventory is diegetic except during long actions. To use an item, wield it and
then activate its ordinary capability; unpacking ammunition follows the same
rule. The inventory screen must not provide a shortcut that bypasses handling.
Every handling action gets visible hand feedback, without creating a second
action owner. The longer-term direction is more specific handling animations.
Handling animation follows the simulated job's elapsed time and duration, so
compression, cancellation, and interruption cannot show work the simulation
did not perform. See `rummageFrame` in
`src/render/rummagePose.ts` and the handling-pose readers in `src/render`.

The character's immutable dominant-hand identity determines which hand quick
actions and presentation use; saves preserve it. Roles follow the character,
while anatomical placement and mechanical axes stay physical. See
`docs/character-handedness.md`.

Eating, drinking, treatment, reading, and using a light all require the item in
hand. Getting it into hand has its own handling time; using it is separate, and
a two-handed item occupies both hands. What is held appears in first person,
what is dropped appears in a pile, and furniture shows its contained items. A
held light needs both its world illumination and a self-lit held presentation.
A flame hidden inside the palm cannot communicate ignition, even when its world
source is working. The lamp's authored grip must leave the flame visible; see
`src/content/base/models-items.jsonnet`, `oil_lamp`, and `src/render/modelFlame.ts`, `ModelFlames`.

**Held screens.** An item with a screen is held at a raised spot with the screen
facing the eye and the palm on the item's back, the way a person holds a compass
or a phone, so the hand can never sit between the eye and the screen. Content
states facts about the object: where its screen is, how big it is, which way it
faces and which way its top points. The engine turns the item from those facts, so content holds
no numbers tuned to the arm and later changes to arm size, pose or animation keep
screens visible; arm animation must keep the screen's line of sight free. Radios
and GPS units reuse the rule unchanged, a watch is the same rule with the wrist as
the back, and handedness stays mirroring of placement only. The hand's grip point
is the face of its palm, so the item's back sits on the palm and no part of the
arm reaches past the palm into the item or its screen. Validation rejects a
held-display item whose model has no screen. See `src/render/heldDisplay.ts`,
`presentHeldDisplay`, and `packages/thing-core/src/schema.ts`, `NeutralModelSchema`.

Primary action activates the capability of the held item. A held item must not
become an unarmed attack, and a reserved support hand must not redirect an
action. Continue preserves the physical fist sequence. See
`selectPrimaryAction` in `src/game/primaryAction.ts` and `PlayerCombat` in
`src/core/playerCombat.ts`.

Every sealed can is opened before it is consumed, but a pull-tab needs no tool,
so a pull-tab can's opening takes time and no tool quality. A can that needs a
tool requires a prepared held pair because tools in storage are not in
use. Either member can initiate opening, and opening quality determines work
rate so improvised tools need not be as effective as a dedicated opener. The
player chooses when opening competes with the tool's ordinary action, avoiding
surprise weapon use. See `src/game/canOpening.ts`, `openingTargetForHand`,
`src/game/itemActions.ts`, `ItemActionSelection`, and `src/game/unpacking.ts`,
`Unpacking`.

An opened can retains its vessel so opening and eating cannot teleport food or
leave an empty shell in a different place. Food exposure histories belong to
servings, not measured fuel, so liquid transfer does not mix them. See `src/core/schema.ts`,
`ItemSchema`, `src/game/unpacking.ts`, `Unpacking.complete`, and
`src/game/survival.ts`, `Survival.finishConsuming`.

Can vessels are inventory atoms because opening and eating retain one vessel,
not a disassemblable set of parts. Sharing filled-package geometry must not impose
its mass on an empty vessel; shell and food tuning must remain independent. See `src/content/base/models-items.jsonnet`, `models`,
`src/content/base/items-food.libsonnet`, `canShellGrams`,
`packages/thing-authoring-tool/cans.libsonnet`, `shellMassKg`, and
`src/core/items.ts`, `typeWeightGrams` and `weightOf`.

An opened vessel must read as opened even after its food is gone, so the lid
stays attached and raised rather than relying on a food surface or an item name.
The dedicated opener needs the silhouette of a hand tool rather than a storage
bundle. These are visual distinctions, not extra inventory parts or mass sources.
See `packages/thing-authoring-tool/cans.libsonnet`, `items`, and
`packages/thing-authoring-tool/src/families/openTin.ts`, `openTin`, and
`packages/thing-authoring-tool/src/families/handOpener.ts`, `handOpener`.

Sharpening is held-item work rather than a craft-list repair: the prepared
blade-and-stone pair makes carried equipment matter, and the wheel rewards a
trip to furniture. Like can opening, a blade's competing action remains a player
choice so sharpening does not cause a surprise swing. Aimed wheel activation
uses the held blade. Repair recipes retain the shared content-owned restoration,
skill and work-rate contract; their activation selector keeps held work out of
the craft list. See `src/game/sharpening.ts`, `Sharpening`,
`src/game/itemActions.ts`, `ItemActionSelection`, `src/core/schema.ts`,
`RecipeSchema`, and `src/ui/craftReadout.ts`, `craftRows`.

Craft-list repairs, crafting and disassembly gather reachable supplies because
retrieving materials is part of the work, not free access to distant storage.
See `src/core/reach.ts`, `bindReach`, and `src/core/craftCommands.ts`,
`CraftCommands`.

### Shoulder and sling

A sling lets the player carry a long gun and a melee tool without dropping one.
The shoulder holds one two-handed firearm only when its sling is fitted; the
same gun instance keeps its rounds and attachments. The slung gun takes no
pocket space, but its full weight counts toward carried encumbrance. Slinging
is an ordinary worn-item move, and a displaced long gun prefers a free shoulder
over a pocket or the ground. Every long gun may take the Deadvox sling mount;
the sling itself has no model or handling effect. Rare loot and authored fitted
guns make this carrying option discoverable. See `SLING_SLOT` in
`src/core/firearmFitting.ts` and `Inventory.carriedWeight` in
`src/core/inventory.ts`. Third-person rendering waits for worn-gear rendering
(#582).

### Light mount on a long gun

Players tape lights to guns, but gungen exports mounts only where a rail exists.
Deadvox owns the rail-less mount so content can choose compatible guns without
pretending they have exported rails. See `src/core/firearmFitting.ts`,
`LIGHT_MOUNT_SLOT`, and `src/core/magazine.ts`, `lightMountSlotReason`.

Crafting the taped light consumes a handheld flashlight rather than creating a
light from mounting hardware. Recipes must explicitly permit consuming fitted
parts so a flashlight with a battery is usable stock without making ordinary
crafts swallow filled items. Pocket contents and unfinished work remain excluded.
See `src/content/base/items-slice2-content.libsonnet`, `make_taped_flashlight_mount`;
`src/core/crafting.ts`, `indexCraftReach`; and `src/core/items.ts`, `craftComponentEligible`.

The mount remains a complete light item because removing it or servicing its
battery must not erase its identity. Battery replacement with the gun in hand
uses the same work as a handheld light rather than requiring removal of the
mount. See `src/core/lights.ts`, `lightInHands` and `swapBattery`.

Putting a switched-on gun light away does not turn its switch off: concealment
blocks illumination, not battery use. An exposed dropped gun must remain a light
source because dropping it does not cover its lens. Its drawn ground pose owns
the beam rather than the player's aim. Without a first-person slung-gun model,
the shoulder and a downward beam approximate that absent geometry. See
`src/game/survival.ts`, `Survival.tickLight`; `src/core/lights.ts`, `inventoryLightEntries`;
`src/render/piles.ts`, `PileMeshes.beamPoseOf`; and `src/render/flashlight.ts`, `Flashlight.update`.

### Handling time

Moving an item takes real time while the world keeps running; that makes
looting a consequential choice. Handling stops sprinting and slows walking.
Queued actions transfer one at a time, so each move remains visible and
interruptible.

The handling weights are content, authored beside the Inventory Management
skill that scales them, so a mod can retune how long moving things takes. The
schema requires them and no reader falls back to a code default, because a
silent default would hide a mod that left one out. See `src/core/inventory.ts`,
`handlingWeights`, and `src/content/base/recipes.libsonnet`.

### Inventory screen

Timed actions, crafting and play included, share one circular progress indicator at screen centre, so progress reads the same everywhere and stays visible over dark scenes and across HUD scales. Simulation-owned progress and the existing stop or resume controls stay authoritative. The ring shows no centre percentage: the arc already shows progress, and a number in the centre of the screen is noise. See `src/ui/activityProgress.ts`, `activityProgress`, `src/ui/hud.ts`, `renderHandling`, and `src/ui/crafting.ts`, `renderCraftStatus`.

The inventory is a keyboard-first HTML overlay with **you** and **around**
panes. Hands and worn storage appear beside reachable piles and furniture.
Items move by drag-and-drop or keys; the destination preview communicates fit
by shape as well as color, and rotation is available. The layout must work on
small zoomed screens without letting an oversized container dominate nearby
storage.

Everything lootable, from furniture to ground piles and downed bodies, is within
reach only along a clear line from the chest. A solid block or a closed door in
the way stops the arm; other furniture does not. Reach is a physical arm, so a
wall that stops the player's body also stops looting, while a table in front of a
shelf does not. See `src/core/reach.ts`, `clearLine`.

Show a name, stack count, condition, and pocket handling time at a glance;
inspection exposes exact weight, condition, qualities, and times. Grid labels
avoid ellipses and early word breaks because they spend cell space that could
show more distinguishing letters while scanning. Full names remain available
in inspection and held/worn slots. The glyph-width prediction is conservative,
not browser layout: when covered fonts or grid text size changes, refresh it
with `tools/grid-name-glyph-widths.mjs`. See
`visibleGridName` in `src/core/inventoryGridName.ts`. Filters, search, and item
details work by hover or focus.

Dropping a whole item onto an occupied slot swaps only when each item fits in
the other's exact place. Partial-stack moves retain the ordinary refusal so
neither item is displaced into invalid space. Quickbar assignment confirms its
destination even while the bar is hidden behind inventory; assigning to an
occupied slot replaces its binding. A tap takes an item into its capability-
directed hand or puts it away; holding uses an available action. Stowing prefers
the captured source, then the best pocket, and saves preserve that choice.
Separating deliberate use from a tap prevents accidental activation. See
`visibleGridName` in `src/core/inventoryGridName.ts` and `Inventory.plan` in
`src/core/inventory.ts`. `QuickbarActions` in `src/game/quickbarActions.ts` owns
quickbar use.

The view-item binding over an item card, or as a key on the selected item, opens
the item viewer: that instance's own model, with its fitted magazine and
attachments. A grid card hides the detail that tells items apart, and inspecting
must not cost a move, so the viewer is view-only. It is modal because a covered
control must not activate. It fills the inventory panel because a larger panel
shows more detail. See `src/ui/itemViewer.ts`, `ItemViewer`, and
`src/render/itemPictures.ts`, `ItemPictures`.

### Piles and item models

Ground presentation preserves an item's identity rather than making distinct
objects read as the same bundle. Portable papers use flat paper models, not
standing furniture, so their appearance agrees with ordinary pickup and carrying.
Spent cases read as loose debris, not stacked material. See
`src/render/piles.ts`, `PileMeshes`, `src/core/schema.ts`, `PILE_DISPLAY_KIND`,
and `docs/readables.md`.

Pile meshes and presentation endpoints use the same current display projection.
It accounts for active arc hides and gives scatter items their displayed pose, so
an endpoint remains joined to the visible pile when another throw overlaps or
scatter is involved. See `src/core/pileDisplay.ts`, `effectivePileDisplay` and
`effectivePileItemPosition`.

Pill medicines show a blister strip or bottle regardless of stack size, including
when one item is one pill. A pack is easier to see and reads as medicine; the
visual pack does not change dose counts or carried mass. See
`packages/thing-authoring-tool/food-medical.libsonnet`, `bottle`, and
`src/content/base/items-other.libsonnet`, `pillPack`.

Food portions depict food rather than a second vessel, so a serving does not
duplicate the can that owns it. See
`packages/thing-authoring-tool/food-medical.libsonnet`, `atom`, and
`src/content/base/items-food.libsonnet`, `beansGrams` and `soupGrams`.

Use one item look derived from that instance's own state in every view. A
firearm with its magazine removed must not appear loaded in a hand or pile; a
fitted part keeps its own model. This makes the displayed item agree with the
item the player actually owns. See `itemLook` in `src/render/itemLook.ts` and
`heldLook` / `groundLook` in `src/render/models.ts`.

### Assets and credits

- **Licences.** Asset files (models, sounds, textures) are made for the game,
  or are CC0 1.0, CC BY 3.0 or CC BY 4.0. Other licences, such as share-alike
  or non-commercial ones, aren't accepted.
- **Models are our own.** Every item and thing model is authored in the
  project's model tools and voxelized on its class grain; no model comes from a
  third party, whatever its licence. A third-party mesh isn't an authored recipe
  row, so it can't be voxelized on a class grain, and it would stay outside the
  one look every other model shares. A model is authored when an item first
  needs it (firearms through gungen, other items through the thing tool), not
  kept ready ahead of its item: a model with no item gets no play check and
  drifts until something uses it.
- **The asset manifest.** Each pack records the source, author, licence and
  changes for its assets. Validation rejects disallowed licences, missing CC BY
  attribution, duplicate or unlisted files, and missing files. The manifest and
  its checks are owned by `src/core/assets.ts`, `MANIFEST_PATH`,
  `assetFileIssues` and `validateManifest`.
- **The credits screen** lists every source, CC0 included: the title linked to
  its page, the author, the licence linked to its text, and what we changed. It
  opens from the start and pause card, and it's how we give the credit CC BY
  asks for.
- **Synthesised sounds.** A sound variant can be a jfxr preset in content
  instead of a recording. jfxr's editor is the design tool for BR and modders,
  and the jfxr library renders what the editor plays, so a preset pasted from
  the editor sounds the same in game and needs neither an asset file nor a
  credit. The game renders a preset once and plays it like a recording, so
  every playback rule applies to both, and any sound can move between the two.
  A preset is one voice, so it suits simple sounds such as knocks, hums and
  engine tones. Compound sounds, such as a gunshot's crack, boom and tail
  together, lose fidelity, so they stay recordings, as do voices. Validation
  rejects a preset that jfxr would silently clamp or ignore, so content plays
  what it says. If the library ever falls short, the fallback is a fork, which
  becomes our own code. The renderer is `src/core/soundSynth.ts`,
  `renderSoundRecipe`.
- **The listening sheet.** `/sounds.html` lists every loaded sound with its
  settings, variants and credits, and marks a synthesised variant as such. What
  makes a sound play is the required description on its content entry, so a
  pack's sounds reach the sheet without a code edit. The sheet keeps no approval
  status: a verdict is history, which belongs in the commit that changes the
  sound. See `src/ui/soundGuide.ts`, `buildSoundGuide`.

## Crafting

Recipes combine reachable materials with skill, quality, and optional
workstation requirements. A reachable workbench can provide its qualities and
speed bonus. Disassembly uses an authored yield or salvage list specific to the
item; it is not inferred by reversing all recipes that could produce it. See
`planDisassembly` in `src/core/disassembly.ts` and `docs/crafting.md`.

Crafting is a compressed long action that can be interrupted and resumed. An
in-progress item retains its components. Bleeding can refuse compression, but
treatment, crafting, and reading remain available at real-time pace so the
player can still respond. Skills improve through relevant activity and books;
books and schematics teach recipes beyond the simple recipes known at the start.

## Character

The player is one fixed, curated figure. One hand-authored look suits parts made
in the authoring tool and the existing review loop, where customisation would
multiply every part and every review.

The figure is seen whole, not only as arms in first person: a visible body when
looking down, and mirrors that show the player themselves. So the full body must
hold up from every side, and a body built only for first person is not enough.

Worn items carry their own part model that covers or replaces the body part
under it, so gear shows on the body without the body knowing about gear.

The first-person arms are the figure row's own arm models, bent through the row's
arm rig to reach each grip (`DESIGN.md`, "Models"), so the arms the player sees
and the arms others see never differ in look or proportion. In first person the
view draws both arms, gripping or as fists, so the body's own arms hide there;
otherwise an empty hand would show two arms.

Third person remains a debug inspection aid, not a player-facing camera.
`PlayerMeshes` in `src/render/playerFigure.ts` draws the body from the `player`
figure row (`DESIGN.md`, "Models"); the authored parts are thing tool rows in
`packages/thing-authoring-tool/avatar.libsonnet`. The debug query in
`src/render/avatarStudy.ts` stands a model beside the body for comparison.
`src/render/avatarMannequin.ts`, `createAvatarMannequin` stands a second, inert copy of the
body, drawn by the same `PlayerMeshes`, in every pose the figure row defines (`avatarPoses`
in `src/render/playerFigure.ts`), so BR can judge a pose from outside instead of only in
first person. It is debug-only, and its controls (pose, relocate) fill their own debug-panel
group, present only while a mannequin exists, because BR wants mannequins driven from
one section of their own and possibly several later; the rows are the `debug.mannequin-`
actions in `src/game/inputBindings.ts` and the group is in `src/debug/groups.ts`,
`DEBUG_GROUPS`. Where it stands is the figure row's `mannequinPlacement`. Held-item holds and the ready stance are drawn by the
first-person `HeldItems`, not the world body, so the mannequin shows them only if the
world body grows them.

Needs are calories, hydration, fatigue, stamina, and body temperature; rates use
game time. Body temperature is not simulated; #366 is the trigger for deciding
how the heat property serves it.

Fatigue is unbounded sleep debt, not a percentage: a person can remain awake
long after becoming tired. Sleep quality scales recovery, while resting clears
debt more slowly than sleep. Sleep's main value is recovery: health and
regional damage recover faster while sleeping. Health recovery requires
adequate nutrition and hydration, and is limited by a state-specific fatigue
ceiling; regional damage also requires that the region is not bleeding or
infected. These gates are owned by `healthRecovers` in `src/core/needs.ts` and
`Body.recoverRegionDamage` in `src/core/body.ts`. Blood recovery is separate:
`Body.advanceBlood` in `src/core/body.ts` permits it only when no wound is
bleeding. For #393, moving recovery tuning to a content predicate remains an
unresolved direction; its expression format is not chosen.

Treatment uses a wielded item. The default action treats the worst bleeding
first, then the most damaged region, because blood loss is what kills soonest.
Infection risk is deterministic and time-based, with an antiseptic window.
Knockout is timed: the player is prone, the screen is black, and audio is muted;
death while unconscious transitions to the death screen. See `Body.advance` in
`src/core/body.ts` and `playerEyeHeightMetres` in `src/game/session.ts`.

Death is permanent. A new run starts a new world or a new character in the same
world; the prior character's item piles remain. The death card identifies the
world the player actually played, including a continued save. Its loot tally
counts distinct item units taken from containers, not inventory actions, so
returning and retaking an item is not another find. See `die` in
`src/game/play.ts`, `showDeath` in `src/ui/death.ts`, and `Inventory.countLooted`
in `src/core/inventory.ts`.

### Moving in the air

Movement input steers only a body on the ground. A body in the air has nothing to push against, so input cannot
change its horizontal velocity: the momentum it had at takeoff carries until it lands, and only collisions alter
it. A ladder climber is held by the ladder, not airborne. See `steer` in `src/game/player.ts` and
`advancePlayerBody` in `src/game/session.ts`.

### Landing injuries

A fall loads the body at terrain contact, not at its highest point: catching a
ladder reduces the impact, and a stair landing counts even if the player leaves
that step again within the same tick. Landing injuries reuse localized hits,
so pain, shock, movement impairment, bleeding and saves have one owner rather
than a separate fall-health system. The body has legs but no separate feet or
fracture state; landing content chooses the affected regions. Zombies share
collision physics but not the player's body-hit path, so they do not take
landing injuries. See `src/core/physics.ts`, `stepBody`, `src/core/sim.ts`,
`Simulation.land`, and `src/game/session.ts`, `advancePlayerBody`.

The lowest gauntlet roofs should hurt modestly without normally opening an
artery; the tallest should kill roughly one fall in three, not guarantee death.
These are play-balancing goals, not medical predictions or frozen test rates.
Calibrate against roof-to-street distances in the authored buildings rather
than an assumed human storey. See `src/content/base/gauntlet-city.libsonnet`,
`templates`, and `src/core/cityPlan.ts`, `buildCityPlan`.

Speed squared represents impact energy; removing the safe-speed energy gives
a continuous onset without punishing an ordinary jump. One seeded damage
multiplier per fall gives a wide range of outcomes before distributing the hit
across regions: a tall roof remains a gamble instead of a deterministic death
boundary. The shared roll keeps both legs part of the same impact. Gravity is
deliberately heavier than Earth's, so calibration uses in-game speeds rather
than real-world free-fall speeds. Content owns the threshold, scale and spread
so balance can change without changing the injury mechanism. See
`src/content/base/body.jsonnet`, `landing`, `src/core/sim.ts`, `Simulation.land`,
and `src/game/player.ts`, `physicsFor`.

### Bleeding

Bleeding tiers are content-owned: tuning a tier changes content, not mechanism.
Wound severity moves continuously within tier bands so closure and dressing
reduce it gradually rather than in jumps. Damage drives wound thresholds and
outer-layer wear for both blows and continuous exposure: a stronger burn must
corrode faster without depending on frame size. A blow is one exposure; continuous
contact and its lingering burn retain a single wound draw per region and damage
kind. Accumulating damage can cross stronger thresholds, but cannot heal an
existing wound. Rates are starting points tuned by play, not calibrated to a
reference attack: a per-damage rate cannot preserve every attack's per-hit
outcome, so feel takes precedence over a fixed balance point.
See `src/core/body.ts`, `Body.bleedingTierForHit` and
`bleedingWound`; `src/core/damageExposure.ts`, `DamageExposures`.

Lingering damage belongs to the damage kind, not a particular enemy. Its rate
tapers linearly after contact ends, and re-entry before it ends retains the
exposure's damage and draw. A lingering hit starts its tail at hit damage divided
by linger duration, so the tail adds half the immediate hit. Stronger globs are
intentional: this relation avoids another independently balanced attack value.
Ending an exposure early removes the burn, not damage,
wear or wounds already taken. Long actions cannot run during a contact or tail
that can harm; a persistent refusal owns that constraint instead of an interrupt
every step.
Blows still interrupt when they land. An idle exposure system must not fragment
unrelated action timing or replay; it only imposes tick boundaries while a burn
is live. A save taken within a tick must continue like live play; pending
activation must not replay dormant time. See `src/core/scheduler.ts`,
`SystemSpec.enabled` and `Scheduler.snapshotState`;
`src/core/sim.ts`, `Simulation.expose`,
`Simulation.leaveExposure`, `Simulation.endExposure` and `Simulation.actionRefusal`;
`src/core/longAction.ts`, `LongActions.interruptExposure`.

**Worn items seen.** Head gear can sit in front of the eyes, so the player should
see what they look through. It belongs with the hands because the world camera
cannot draw that close to the eye. It blurs under painkillers for the same reason
the hands do: it is part of what the drugged player sees. Its strength is moddable
content, not a player setting like the HUD's options: the frame belongs to the
item worn, so a mod that changes the item changes how it looks from inside.
Worn items belong on the body figure so the player's shadow and outside views
show what they wear. Other slots follow the helmet when an item or view needs
them. See `src/core/schema.ts`, `WearableSchema`; `src/render/hands.ts`,
`HeldItems`; `src/render/playerFigure.ts`, `PlayerMeshes`.

**Worn coverage.** Vests take their own outer slot over the torso so a vest and
a jacket can be worn together, and the outer layer is the one a blow meets.
One vest at a time makes the player pick pouches or protection. Whole-region
coverage keeps layering simple rather than asking the player to judge uncovered
fractions. Contact can meet a different layer because a puddle reaches boots
before trousers and a grip reaches gloves before a sleeve. See `src/core/wear.ts`,
`wornItemMet`; `src/content/base/body.jsonnet`, `coverage` and `touchFirst`.

**Eyes slot.** Goggles take their own slot beside the head, so night-vision goggles
stack with a helmet or a headlamp instead of making the player choose between seeing
in the dark and head protection or a lamp. Both show on the figure's head. See
`src/core/schema.ts`, `WearableSchema`, and `src/render/playerFigure.ts`, `PlayerMeshes`.

A worn item stops a share of a hit before flesh damage and bleeding are resolved,
set per damage kind because real armour is built against particular threats.
A stab vest's flexible panels stop blades and points but barely spread a blow;
its fabric soaks up acid. A riot helmet's shell and padding spread blows and turn
blades; its shell and visor turn teeth, but gaps at the neck and face edge remain.
The visor keeps spit off the face without sealing out acid. Protection trades
away the utility vest's pockets or the head slot's headlamp. Protective panels
are built to take blows, while the helmet's hard shell scuffs more readily.
The shares, burden, warmth and durability are content tuning, not armour rules.
Later Vest-slot armour, such as plate carriers and ballistic vests, will carry
strength in blunt and pierce because hard plates spread a blow and stop a point;
that is why protection is per kind rather than one number. See
`src/core/schema.ts`, `WearableSchema`; `src/content/base/items-wearables.libsonnet`,
`items`.

Armour wears by the whole blow because it took the whole blow. Protection holds
until ruin and then stops so the player sees the moment armour fails rather than
guessing at a fading number. A ruined item still sits in its layer until removed,
so the player must clear it to expose the layer beneath. Imperviousness remains
a separate per-kind rule so rubber boots can stop acid outright without a boots
rule in code. Putting them on during contact lifts its refusal without erasing
the exposure's tail, so removing them before it ends exposes the player again.
Keeping protection and wear at the shared impact boundary prevents falls,
projectiles and lingering damage from bypassing them. See `src/core/wear.ts`,
`playerWearHooks`; `src/core/sim.ts`, `SimOptions`, `Simulation.impact` and
`Simulation.expose`.

Modifier ownership follows the actor supplying the effect, not its target.
`src/core/body.ts`, `Body.modified`, resolves the player's bodily values;
`src/game/session.ts`, `createSession`, resolves attack damage through
`src/core/modifiers.ts`, `modified`, on the attacking `Zombie` immediately before
`Simulation.hit`. This keeps wound depth driven by delivered damage, so a stronger
attack can cross a content bleeding threshold without a second wound rule.
See `src/core/zombies.ts`, `Zombie` and `ZombieState`: attacker modifiers are
runtime attachments, empty on creation or restore and excluded from saves.

Each bleeding wound loses blood and wound losses add together. Blood recovers
only when no wound is bleeding; no blood means death, with no faint beforehand.
Fainting would consume the player's remaining chance to dress a wound when
nobody else can help. A bleeding wound closes only when needs allow recovery
and the wound is not infected. Natural closure is deliberately slow, so most significant wounds need
treatment. These rules make dressing the wound urgent while preserving a chance
for minor wounds to close. See `Body.advance` in `src/core/body.ts`.

Under normal play, blood loss progresses with simulation time; a stalled browser
slows the whole simulation rather than skipping ahead. Content sets when
bleeding refuses compression. Rest, sleep, and waiting must stop or stay refused:
the player must stay conscious enough to act. Doable long actions remain available
at real-time pace because making or using treatment may be the player's remaining
chance to stop the wound. Harming exposure instead refuses every long action:
leave the fire first, then treat. Unconsciousness permits no action. Debug time
controls do not bypass real emitted interruptions. See `src/core/body.ts`, `Body.compressionRefusal`;
`src/core/sim.ts`, `Simulation.actionRefusal` and `Simulation.checkInterruptions`;
and `src/core/longAction.ts`, `LongActions.runsUncompressed`.

Treatments declare bleeding strength, infection stages, or both. Treatment
strength is spent progressively across severity bands, and applications stack;
any bleeding treatment may help any tier. Each tier owns its warning, notice,
and drip presentation; the inventory body panel names the tier. Saves preserve
wound severity. See `Body.treat` in `src/core/body.ts` and `bodyWound` in
`src/core/saveFormat.ts`.

### Pain

Pain is its own body state, apart from health and wounds, so a painkiller can ease
what hurts without healing anything. Felt pain is acute plus background pain,
less analgesia; it has no top. Reaching the threshold empties shock, so shock owns
knockout, recovery and save state (`src/core/body.ts`, `Body.impact` and
`Body.unconscious`). Acute pain comes from each
hit by damage kind and region,
then fades. Background pain is derived from region damage, bleeding and infection,
so treatment and healing change it without saved derived state. Pain tiers drive
the bodily cue, while aim sway and a shared handling slowdown grow with pain above
the first tier; treatment and crafting are not slowed.

Painkillers use an analgesic component regardless of item category. Each dose's
relief rises, holds and fades in game time; doses in a group share a cap, while
other groups add relief. They mask pain only: health, wounds and consequences
remain unchanged. Saves preserve acute pain and active doses.

Codeine and morphine relieve much more than the common analgesic, but while a dose
works it blurs vision, more for morphine, so strong relief is a trade rather than a
free upgrade. The blur is a vignette at the edges, not a full-screen blur: the centre,
where the player aims, stays sharp, while threats at the edges are harder to read.
Aim itself is untouched, so the cost reads as the drug's and not as pain's own sway.
The vignette follows the dose's relief, players who cannot tolerate it get a setting
for it, and it shows even with film off. Its strength needs a playtest. The held hands and weapon blur with the edges,
because the body is part of what the drugged player sees, and keeping the hands apart
would make every screen effect choose whether to cover them. The HUD stays sharp
because it is drawn on top of the game view. Whether a stacked dose can be dangerous
and whether dependence is ever modelled are later rulings. See `src/core/schema.ts`, `AnalgesicSchema`; `src/core/pain.ts`,
`drugVignette`; and `src/render/moodOutput.ts`, `moodDrugSample`.

The optional stats readout shows felt pain and its acute, injury and relief
components so BR can tune the scale in play. This debug-style number belongs
only in stats, not in player-facing cues, because pain has no upper bound and
its bodily cues should remain diegetic. See `Body.pain` in `src/core/body.ts` and `PainReading` in `src/core/pain.ts`. The interface rules are in
`INTERFACE.md`, "Bodily cues" and `INTERFACE.md`, "HUD".

## Combat and noise

- **Melee.** Every player and zombie melee move declares a motion: thrust, swing
  or wrestle. Motion describes how an attack reaches its target; damage kind
  describes the injury, so a bite can wrestle and still pierce. Keeping them
  separate prevents an injury label from granting passage through wire. Content
  validation requires the choice rather than inferring it from an actor or item
  identity. See `src/core/meleeMotion.ts`, `MELEE_MOTIONS`; and `src/core/schema.ts`,
  `WeaponSchema`, `UnarmedAttackSchema` and `ZombieMovesSchema`.

  Misses and obstructions still spend stamina and cooldown, so swinging has a cost
  even without a hit. Saves retain the active move, including its motion, so Continue
  cannot skip or repeat contact or change which obstacles it passes. Changing held
  items cancels contact without refunding cooldown. Damage spread consumes its draw
  even at zero variance so later dismemberment rolls stay stable. Class tuning remains
  content-owned for feel comparisons. See `src/core/playerCombat.ts`, `PlayerCombat.resolveContact`;
  `src/core/saveFormat.ts`, `meleeAction`; and `src/core/zombies.ts`, `ZombieSystem.applyMeleeHit`.

  A block always takes part of a melee blow, so holding the guard is a choice
  whose payoff the player feels on every hit; an all-or-nothing roll would read
  as luck. A skill roll can still turn it into a full block, so a skilled
  fighter has a clean parry to hope for. Skill raises the share absorbed and
  lowers the stamina paid per point, because practice should make defence both
  stronger and cheaper. Stamina is the price because swings and sprinting spend
  it too, so a guard cannot be held for free and a long fight wears the player
  down; a winded guard absorbs nothing, leaving an exhausted player open rather
  than half-protected. What gets past keeps the blow's region and damage kind,
  so wounds stay consistent with the strike. Acid spit is never blocked: a
  weapon cannot parry a spray. Training scales with the damage absorbed, so
  heavy blows teach more than scrapes and trivial hits cannot farm practice.
  Skill alone decides how well a guard blocks; the held item plays no part, so
  empty hands block like a weapon. A block is loud contact that the dead hear, so fighting draws more of
  them; full and partial blocks sound different so the player can tell the
  outcome by ear. A block also needs a visible cue, not only feel and sound, so
  the player can see the hit was deflected. Content owns every block number. See
  `src/core/meleeCombat.ts`, `meleeBlock` and `blockJolt`;
  `src/render/playView.ts`, `createPlayView`; `src/game/session.ts`,
  `blockedDamage`; and `src/content/base/recipes.libsonnet`, `melee_combat`.
- **Firearms** come from gungen assemblies: part choices decide calibre,
  capacity, handling and noise. Ammunition and magazines are items; a magazine holds its
  cartridges and fits a rifle's magazine slot (see "Magazines" and "Rifles" below). The
  simulation's `AimController` publishes the same offset to shot resolution and
  held-firearm presentation, so the weapon does not visibly aim somewhere other
  than its shot ray. Aim state is saved because it can change hit outcomes. The
  crosshair follows the projected muzzle point, including while the firearm is
  unready or turned for handling; it is hidden only when outside the view or
  behind the camera. With no firearm wielded, the main-game center crosshair
  remains. Handling turns affect the drawn muzzle and crosshair, not the shot
  ray; firing is refused during handling or a cycle.
  Shots leave along the visible firearm's bore, plus firearm-owned spread.
  `src/game/firearmAim.ts`, `firearmBoreRay`, supplies that shared line to both
  shot resolution and the held-firearm crosshair; `src/game/play.ts`,
  `heldFirearmBore`, supplies its current raise progress. `src/ui/playHud.ts`,
  `projectCrosshairScreenPosition` and `playCrosshairFrame`, hide it outside the
  viewport and keep the centered default only when no firearm is wielded. The hip pose reuses the hand placement but not the melee
  wrist rotation, so the visible bore follows the player's look. The debug X is
  separate from the optional crosshair. In ADS, recoil, sway, and handling
  move the firearm pose and bore while the view stays fixed; only the intentional
  over-limit pitch shift moves the view. See `heldFirearmTransform` in
  `src/core/heldPose.ts` and `applyAimViewPitchShift` in `src/game/session.ts`.
  `src/debug/index.ts` owns the development target-range readout, which should
  distinguish sub-metre differences. While an automatic trigger is held, recoil
  does not recover; once the weapon reaches its pitch limit, the saved view pitch
  continues to climb without a plateau. The shifted view stays after release
  while the on-screen weapon offset recovers, so mouse look can counter the
  climb. Firearm-owned `dispersionRadians` is sampled per round, while
  `firearmsSkillEffects` controls sway, kick per shot and recoil recovery;
  legendary grants no control beyond ordinary expert. Skill-zero handling must
  make automatic fire meaningfully harder to control. Tuning lives in content
  and can be adjusted with runtime debug controls.
  Accordingly, skill-zero endpoints for single/first shots and
  automatic follow-ups are separate values in `src/content/base/recipes.json`, under the
  firearms-combat skill's `skillZeroHandling`; `src/core/schema.ts`, `SkillSchema`, validates
  them. A follow-up is a committed shot from the same firearm within its burst window; see
  `src/game/firearmHandling.ts`, `FirearmMechanics.handlingShotKind`. The expert
  endpoint stays on the existing curve, so skill-10 shot handling is unchanged;
  legendary still matches expert.
  Different guns need different skill-zero factors. The per-gun values are
  provisional and await BR's slider review; endpoint approval did not approve
  these individual starting factors. Optional per-firearm settings sit beside
  base recoil in `src/content/base/models-firearms.json`. The `FirearmSchema`
  in `src/core/schema.ts` requires a complete in-range shape when present.
  A per-gun shape replaces the shared skill-zero endpoints as a whole; absent
  factors use the global firearms-combat endpoints. Keeping the override
  complete avoids mixing fields from different guns. `FirearmMechanics.skillZeroHandlingFor`
  in `src/game/firearmHandling.ts` selects the effective factors, and
  `firearmsSkillEffects` in
  `src/core/firearmsSkill.ts` interpolates them toward
  the same expert endpoint. `src/debug/index.ts` renders runtime tuning controls
  for the shared and per-firearm skill-zero settings.
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
  `wirePayloadSchema`.

  Shared reload and rack curves scale with firearms skill without changing
  skill-zero time. Legendary remains clamped to expert. See `firearmsSkillEffects`
  in `src/core/firearmsSkill.ts` and `FirearmMechanics.load` / `cock` in
  `src/game/firearmHandling.ts`.

  Readied-gait sway and look lag follow firearms skill, while dispersion and recoil remain separate. An unskilled character's readied sway is large with any firearm because they've never handled one; at skill 10, the character hardly sways. Each firearm's skill-zero values set the relative steadiness between guns. Automatic follow-ups sway at least as much as single shots, so sway does not drop during burst fire. Sharing `src/core/footsteps.ts`, `FootstepClock`, keeps the stride-synced path aligned with gait, and content owns the shape and skill endpoints. See `src/core/aim.ts`, `frameFromState`, and `src/core/firearmsSkill.ts`, `firearmsSkillEffects`.

  Mean-reverting Brownian drift avoids unbounded sway; smoothing keeps fixed-tick noise from reading as frame-level twitch. The shared walking lune remains separate, firearms skill continues to scale sway, and content owns the noise tuning. Saving the running state lets Continue and replay segments preserve the exact path, avoiding a motion discontinuity. The vertical/horizontal lune ratio remains independently tunable without changing the drift. See `src/core/aim.ts`, `advanceOrnsteinUhlenbeckAxis` and `AimController.snapshotState`, `src/core/saveState.ts`, `snapshotSession`, `src/game/inputReplay.ts`, `encodeInputReplay`, `src/game/config.ts`, `configFromUrl`, and `src/content/base/recipes.json`, `firearms_combat`.

  **Holding breath** lets the player steady a readied firearm for a moment, so a careful shot through an optic is earned by timing rather than by waiting out the drift. It damps the wobble drift only; recoil and dispersion keep their owners, because breath steadies the body, not the gun. Held breath and whatever limits it change where shots go, so they are simulation state: saved with aim state and restored by input replay (`CONTROLS.md`, "Replay boundary"). The sprint key, held while the firearm is ready, holds breath: the ready stance already refuses sprint, so the key is free there and needs no new binding. It works in any ADS, through irons or an optic, standing or crouched, but not while moving, because a moving body can't be held still. Each second held spends stamina, since holding breath is effort and one shared resource keeps the rules simple. The winded line gates both ends: a hold can't start while winded, and a hold in progress gives out when stamina drops to that line. One threshold keeps the hold simple and adds no tunable. Giving out leaves sway worse than normal for a recovery period, and no new hold starts until that ends, so pressing the hold too long costs the next shot. Firearms skill strengthens the hold and pain weakens it, on top of their effect on the wobble itself, because steadying breath is part of handling the gun. The player hears it and nothing else shows it: an inhale when the hold starts, quiet while held, an exhale when it ends, a strained gasp when it gives out, and the stamina heartbeat carries on. These are presentation only, not noise events, so a shambler never hears a breath. Its stamina cost, recovery length, recovery sway penalty, steadying factor and the skill and pain terms are content (`PILLARS.md`, "Content forward compatibility"). See `src/core/aim.ts`, `AimController.advance`, and `src/game/session.ts`, `advanceSessionAim`.

  Ready stance gates firearm fire; sprinting prohibits it. Duck-walk speed is
  owned by firearms combat, and melee combat owns blocking. A held, completed
  ready stance remains active through firearm rack/load handling; raising still
  takes skill-scaled simulation time. Racking, loading, magazine changes, and
  charging train firearms handling, while a magazine change and charge preserve
  the held ready stance. See `advancePlayerReadiness` in `src/game/session.ts`
  and `isFirearmTrainingAction` in `src/game/firearmHandling.ts`. Firearm quality
  owns dispersion; skill controls handling. Training is tiered: an activity trains
  only up to its tier, so above-tier practice is dropped; see
  `src/core/character.ts`, `Character.awardPractice`.
- **Shot impacts.** Each round that meets world geometry leaves a surface
  mark. Marks and dust are presentation, not simulation damage or save state.
  When a wall lies between eye and muzzle, tracing from the eye lets the near
  wall receive its visible impact mark. The session traces each round against
  the same physical world its hits resolve in, parked vehicles included, and the
  view only draws those segments: a view that traced its own world could show a
  shot passing through a body that stopped it. The shot trace's reach is shared
  firearms tuning in content, so the crosshair, bore target and impact marks
  agree on one range and a mod changes it once
  (`PILLARS.md`, "Content forward compatibility"). See `src/game/session.ts`,
  `ResolvedFirearmTrajectory`, `src/core/shotTrace.ts`, `traceShot`, and
  `src/render/impactEffects.ts`, `ImpactEffects.fire`; the range comes from
  `src/core/skillTraining.ts`, `firearmsCombatTuning`, and
  `src/content/base/recipes.json`, `firearms_combat`.
- **Magazines:** A detachable magazine is an item whose exported model carries gungen's fitted round column. Its calibre and capacity come from that model, as the pump's tube capacity does, so the geometry that fits the rounds also sets how many go in. Its cartridges are item state in feed order, top round first, and save with the magazine; loading pushes onto the top and stripping takes from it, as with a real spring-fed box. Each round loaded or stripped is one handling job, so releasing R loses nothing and the inputs replay deterministically. Hold R loads; stripping is the held magazine's item action, not an R gesture, because R's gestures load, rack and remove (`CONTROLS.md`, "Reload, rack, remove"). Loading and stripping a round both use the firearms skill's reload factor. See `src/core/magazine.ts`, `magazineSpec`, and `src/game/magazineHandling.ts`, `MagazineHandling`.
- **Rifles:** A magazine is a child item of its firearm, so removing it preserves its identity and state; nested accessories and batteries use the same ownership. Cartridge data owns calibre-specific damage. A magazine change is one handling motion, so holding R does not repeat it and releasing R does not cancel it. Deadvox hand-authors `chargingHandleDegrees` because Gungen exports no value for it. See `CONTROLS.md`, "Reload, rack, remove" and `docs/firearm-cycle-playback.md` for the player actions and their presentation; `src/core/saveFormat.ts`, `wirePayloadSchema`; `src/core/pellets.ts`, `projectileShot`; `src/core/zombies.ts`, `ZombieSystem.firePellets`; `src/core/magazine.ts`, `magazineWellCalibre` and `slotsReason`; `src/game/firearmHandling.ts`, `FirearmMechanics`; and `src/render/handlingTurn.ts`, `handlingRotation`.
- **Modular weapons:** Fitted accessories remain complete child items so removal and saving preserve identity, condition and nested contents. Default and fitted models use the same slot-frame contract; connector axes keep distinct attachment shapes aligned without per-kind guesses. Dynamic fitting trusts gungen's certificates instead of duplicating its geometry solver, while rail footprints remain separate because a slot anchor does not describe the full occupied span. The sling mount and the light mount, which gungen does not export, are the mounts deadvox owns (see [Shoulder and sling](#shoulder-and-sling) and [Light mount on a long gun](#light-mount-on-a-long-gun)). These boundaries keep rendering, saves and compatibility consistent. Firearm details must remain responsive as the inventory fills while the world continues; see `src/game/firearmAttachmentHandling.ts`, `FirearmAttachmentHandling.candidates`; `src/ui/inventoryScreen.ts`, `viewModel`; `src/core/items.ts`, `ItemFactory.create`, `snapshotItem` and `restoreItem`; `src/core/itemTree.ts`, `walkItemTree`; `src/render/itemLook.ts`, `itemLook`; and `src/render/models.ts`, `hideSlotNodes` and `ModelLibrary.attachParts`.

  A fitted optic owns the aiming sight line because its mount can obstruct the irons. Visible placement and aiming must share the connector transform so the view and shot remain aligned; see `src/render/firearmSight.ts`, `sightedFirearmModel`. Magnification changes the local sight picture, not the weapon or its ballistics, so zoom selection stays outside saved item and replay state. Content-controlled per-weapon memory lasts for the play session; a fresh session starts at the authored power rather than making a camera preference authoritative simulation state. See `src/game/opticZoom.ts`, `OpticZoom`; `src/core/opticView.ts`, `mountedOptic`, `opticViewSettings` and `projectLensAperture`; and `src/render/opticLens.ts`, `OpticLensRenderer`. The digital thermal optic stays out of loot, fitting and ADS until its thermal view exists; exposing an optic without its defining view would mislead the player. See `src/game/firearmAttachmentHandling.ts`, `FirearmAttachmentHandling.fitReason`.

  An attachment is an atom, so its mass is the mass authored for its item, and a fitted gun weighs the sum of its own parts and its fitted items; see `things/README.md`, "Rules". Every atom's item `weight` is authoritative even when atoms share a visual model. Assemblies author no competing item total: their model carries authored body-part masses, with replaceable geometry owned by the fitted child item instead. See `src/core/items.ts`, `typeWeightGrams`, and `src/core/modelMass.ts`, `modelBodyMassKg`. `muzzleLoad` combines fitted attachment mass with mount distance from the grip to feed the existing handling response. Runtime skill-zero tuning remains separate from attachment response so editing a debug endpoint cannot apply the attachment effect twice. Suppressors affect recoil, noise and wear, and foregrips affect aim, stance and wear. Effects are tagged with their model's attachment kind, each kind authors every effect it has, wear included as zero for none, and a suppressor model always exports its noise factor: a missing value is a content error rather than a silent neutral default, so an unfinished attachment cannot ship as one that does nothing. Fitting either suppressor requires Firearms Combat 4; removing one has no skill gate. See `src/core/schema.ts`, `FirearmAttachmentEffectsSchema` and `AttachmentSchema`; `src/core/content.ts`, `checkItemAttachmentEffects`; and `src/game/firearmAttachmentHandling.ts`, `FirearmAttachmentHandling.fitReason`. A powered light nested under a held firearm remains exposed to carried-light and sense behavior and drains its owned battery on simulation time. Effect estimates remain tunable until attachment behavior has been playtested. See `src/core/firearmAttachments.ts`, `muzzleLoad`, `firearmAttachmentResponse` and `wearFirearmAttachments`; `src/game/firearmHandling.ts`, `skillZeroHandlingSettingFor` and `skillZeroHandlingFor`; `src/core/items.ts`, `weightOf`; and `src/core/lights.ts`, `lightExposureFor`. Heat (#366), improvised accuracy, fouling and smoke (#365, all in #367) are deferred until after the playtest.

- **Military loot (3.2):** Authored Military-only usage protects military progression without inferring admission from calibre or furniture type. Shared supplies remain craftable even when military sources can carry them; ordinary crafting, salvage and unpacking cannot manufacture Military-only supplies. Fixed stock and its installed descendants must match their resolved source context. Tables supply weights, not a second geography authority. See `src/core/loot.ts`, `economyEligible` and `lootTypeIssue`, `src/core/magazine.ts`, `militaryLootItems`, and `src/core/content.ts`, `checkMilitaryLoot`.
- **Spent cases per block:** Cases must never end inside terrain; use only clear,
  supported landing cells, including spill destinations. If none is available,
  discard the case rather than jam the firearm for a cosmetic item. When an
  outward ejection path is blocked, its supported gameplay landing stays under
  the free launch column and the visible case drops straight down, monotonically
  to that landing without entering the floor or reversing upward. Clear ejections
  retain their authored motion. Keeping both landings in the launch column avoids
  a case passing through a raised floor toward a lower adjacent surface, as well
  as corner contact and crouched short falls making recoverable cases disappear.
  A save taken during a case flight keeps its simulation landing time but shows
  the case at the landing on Continue, without replaying
  the presentation arc. The landing is gameplay state; the arc is transient
  presentation. This avoids saving an individual physics body for every shot. A
  deterministic scatter represents the pile visually. Ejection speed, flight
  time and landing lift are shared firearms tuning in content rather than per
  firearm, because every gun ejects the same presentation case and a mod should
  change it in one place. See `docs/decisions/0006-firearm-handling.md`,
  `src/game/firearmHandling.ts`, `FirearmMechanics`,
  `src/core/scatterPile.ts`, `spentCaseScatter`, and
  `src/content/base/recipes.json`, `firearms_combat`.
- **Noise** is an event with loudness and position. Sprinting makes footsteps
  louder; melee, gunshots, doors, breaking glass and engines also make noise.
  Walls reduce how far it travels. Zombies hear, investigate and pass noise on
  (see the screamer below), so stealth means managing noise and staying out of
  sight. Suppressor effects apply across firearms through attachment metadata;
  the shot event selects the sample, not another radius. Near hearing ends at the
  scaled base radius, while the far tier follows the listener's hearing model.
  A real suppressor is quieter than an improvised one, and wear makes either
  louder. Keep suppression local to shots so other noises retain their range. See
  `gungen/src/gun/attachments.ts`, `suppressors`;
  `src/core/firearmAttachments.ts`, `firearmAttachmentResponse` and
  `wearFirearmAttachments`; `src/core/zombies.ts`, `hearVocalNoise`;
  `src/game/audioPresentation.ts`, `firearmShotSound`; and
  `src/game/session.ts`, `createSession`.
- **Player-owned sound playback:** Character- and held-item sounds have the
  player as their source; listener-relative playback makes them move with the
  player, who is the listener. Simulation sound/noise events keep their source
  positions for zombie hearing, while independent world sources remain
  positional. See `playPlayerSound` and `playWorldSound` in `src/game/session.ts`.

### Weapon sounds

- **Recordings of the same kind of gun.** A shot recorded from a real gun of the same
  action and a close cartridge beats a synth or a repitched borrow, because a borrowed
  report makes a gun sound like another one. Where no free recording of the exact
  cartridge exists, the nearest real one stands in. Loudness, pitch and tonal balance
  belong to content so listening adjustments need no weapon-specific code. Bass
  shaping must retain the recorded attack rather than muffling the whole report;
  see `src/game/audio.ts`, `GameAudio.startSource`, and `src/core/schema.ts`,
  `SoundSchema`. Keep the original recordings untouched so provenance remains
  intact. A synth stays only where it already reads as its gun; a suppressed shot
  keeps its synth until a recording of one exists.
- **Near takes.** Shots play from the shooter's position, so the close recording
  matches what the shooter hears; distance comes from the game's own playback and
  hearing, not from room tone baked into a take.
- **Handling from the same gun first.** Mechanics heard from the recorded gun's own
  takes match its shot; a click pack fills only the parts those takes lack.
- **Dry fire on every gun that can run dry with the action closed.** A silent trigger
  hides that the gun is empty; the click tells the player before the next shot is
  needed. Dry fire is a sound per gun in content, so a gun without one stays silent
  rather than borrowing another gun's click. See `src/game/firearmHandling.ts`,
  `dryFire`.
- **One click, then silence until the action is worked.** A click is the hammer or
  striker falling, and a fallen hammer cannot fall again until something cocks it. A
  magazine gun's slide, a bolt or a pump's rack cocks it, so after the first empty
  pull the trigger is dead until the player works the action; a shot from a hand-worked
  action likewise leaves the hammer down until the next stroke. A double-action trigger
  cocks and drops the hammer itself, so such a gun clicks on every pull. Whether a pull
  re-cocks is a fact of the gun's mechanism, not of its kind, so content decides it per
  gun and a new double-action gun needs no code. The fallen hammer is saved, so a load
  cannot re-arm a dead trigger. See `src/game/firearmHandling.ts`, `dropHammer`, and
  `src/core/schema.ts`, `triggerCocks`.
- **Bolt strokes per phase.** Opening and closing a bolt are separate actions the
  player can stop between, so each phase plays its own cut; one whole-cycle recording
  would play a close the player has not made. See `src/game/firearmHandling.ts`,
  `startHandCycle`.
- **Melee sounds by weapon weight and material.** A knife and a bat should not sound
  alike, so a melee weapon can name its own swing, its own hit and a layer over the
  hit, such as a metal ring for a metal striker. A weapon that names none keeps the
  shared swing and hit. See `src/core/zombies.ts`, `MeleeWeapon`.

## Damage, destruction and dismemberment

Damage should be interesting, not just bigger numbers. When armor is introduced,
its different resistances should enter through per-region, per-type damage
application rather than weapon-class special cases. See `ZombieSchema` in
`src/core/schema.ts` and `ZombieSystem.applyMeleeHit` in `src/core/zombies.ts`.

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
- **Ruined furniture.** A piece of furniture whose damage reaches its durability is
  destroyed: what it held, and any debris its content names, falls as piles and
  whatever rested on it falls, so destruction loses and floats nothing; a door
  instead breaks and stays as an open leaf. Like a destroyed block, a ruined piece
  is gone for good; unlike blocks, which do not collapse (next bullet), furniture
  left unsupported settles, and a piece that cannot come down clear is destroyed in
  turn. A blow that would ruin a piece whose contents and debris have no room to
  fall still adds its damage and is heard, but the piece stays standing at full
  damage until a blow finds room, so nothing is lost. See
  `src/core/furnitureMove.ts`, `ruinFurniture`.
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
- **A downed shambler is cleared by hand.** A destroyed torso with the head
  still on leaves the shambler downed: it lies where it fell, stays in the save,
  and can't be hit. It no longer blocks the player or a closing door, so a body
  can't seal a corridor or a stair. Clearing it is a timed handling action on a
  body in reach. Finishing it off needs no tool. Dismembering needs a carried
  tool with the type's quality, takes longer and leaves the arms and head as
  items; it is where butchering will start. Either way it ends as a kill does,
  and its corpse sinks. The action re-checks reach and the tool when it ends, so
  walking away or cancelling leaves the body lying. Like all handling, an action
  in progress is not saved. The times and the quality are content on the zombie
  type. See `src/core/schema.ts`, `ZombieSchema` (`downed`); `src/game/downedBody.ts`,
  `downedBodyPlan`; `src/core/zombies.ts`, `ZombieSystem.finishDowned`; and
  `src/game/session.ts`, `standingZombieBodies`.
- **Gore is presentation only.** Every damaging hit sprays blood from the
  wound, mostly along the strike and some back toward the attacker, more for a
  heavier hit. Where a droplet lands it leaves a splat. Splats fade and are not
  saved, so a reload starts clean. Wounded bodies drip and wear blood stains,
  both derived from saved state (lost region health, severed parts, carved
  flesh), so they survive a reload with no state of their own; a corpse keeps
  the stains it fell with. Blood shares scene lighting rather than glowing over
  it, so darkness hides stains and carried light can reveal them. Authored blood,
  scorch and paint follow the same presentation-only rule; their age comes from the
  scenario, not a fixed outbreak timeline. See `docs/content.md`, "Authored decals".
  A player's
  bleeding drips from the affected region as the avatar is drawn in each view; in
  first person, droplets enter view only when looking down or near the screen edge.
  The HUD shows blood level and active regions, and the worst wound reaching a
  worse tier speaks that tier's notice, if content gives it one (see
  [Bleeding](#bleeding)). These cues derive from
  existing body wounds; none adds simulation or save state. Gore stays out of
  the simulation so that blood never changes a fight, a save or a replay.
  Splats are decoration, so they fade rather than being saved, which would add
  to every save. The simulation reports each shambler wound through a one-way
  callback and reads nothing back, and
  `test/zombies.test.ts` checks that a run with a listener matches one without.
  Droplets and splats live in fixed pools, drips come from the nearest few
  bodies, and a cap limits the droplets started per frame. Everything here
  covers the amalgam too, which is fused from shamblers. See
  `src/core/zombies.ts`, `ZombieSystemOptions.onWound`; `src/render/gore.ts`,
  `Gore` and `woundSeverity`; `src/render/bloodStain.ts`, `bloodStain`; and
  `packages/mobgen/src/mob/crowd.ts`, `packBloodiness`.
- **Determinism.** Hit regions, blast falloff and any spread are seeded, so
  saves and replays stay exact. Region and material state is simulation state:
  it goes into the save snapshot and the source fingerprint.
Still open: the full list of damage types and each material's resistances,
shambler bleeding consequences, partial block damage (cracked looks),
explosives damaging blocks, breach charges, and the sounds for severing and
destruction (the audio manifest). Blast damage by distance is the hand grenade's
rule ("Hand grenade").

## Light

A flashlight must illuminate a semi-dark room plausibly, including when its user
stands outside in daylight. Turning the aim must not rescale the whole beam:
a nearby sunlit face must not suppress illumination elsewhere in a dark interior.
Keep source output independent of aim and judge daylight washout at the receiving
surface, using the same diffuse sky estimate that lights that surface. This keeps
bright outdoor surfaces washed out without making dark targets inherit the user's
outdoor lighting. See `src/render/playView.ts`, `prepareLighting`, and
`src/render/skylight.ts`, `Skylight`.

Small omnidirectional item lights must not inherit their holder's daylight washout:
a bright doorway can otherwise extinguish their contribution throughout a dim room.
Keep their authored world output rather than compensating with brighter fuel-light
content, which would also change nighttime illumination. The separate held layer may
still adapt to the viewer's sky. See `src/render/lightPool.ts`, `LightPool.update`,
and `src/render/playView.ts`, `updateHeld`.

Dark interiors make carried light useful without an authored indoor flag.
For authored worlds, live opaque blocks and blocking furniture determine
diffuse sky transport; placement geometry only bounds discovery. Roofs, openings
and doors therefore change the estimate through geometry, not template categories.
Blocking furniture counts as its whole envelope, so a shaped piece whose faces sit
back from that envelope would read its own blocked cells and render black. Its
surfaces sample the sky from the envelope face along their normal instead.
A vehicle's cabin lies inside its blocked envelope, so a face sampling from where it
sits reads black. A cabin face whose normal reaches a window samples the sky just past
the envelope on that line; one that meets roof or body borrows the nearest window's
sky, as a room is lit from its openings. Every vertex of a quad takes the same borrowed
anchor, because the shader interpolates anchors across a face and a line between two
windows crosses the blocked envelope. The choice is made once per vehicle look when its
geometry is built, on the main thread, so that build must stay cheap: it reads only the
window voxels, shares one outlook per block of window, and compares distances without
allocating, because a stall on first sight of each look would cost frame rate on weak
GPUs (#680). A cabin with no window stays dark. See `src/core/skyTransport.ts`, `buildSkyResult`, `src/render/skylight.ts`, `Skylight`,
and `src/render/skyAnchor.ts`, `addSkyAnchors` and `addSkyOpeningAnchors`.

Gameplay and the renderer read one sky field cache. Sky light scheduled by camera
residency or wall-clock budgets would read differently on two machines, after a reload
or from a different camera (`docs/decisions/0008-deterministic-world.md`), so the cache
answers from world state alone and when an answer is computed never changes it. The
renderer only chooses which fields to build early and draws what the cache holds; two
caches would let the room a player sees and the room gameplay reads disagree. The
visibility is derived, so it is not saved: a reload recomputes the same answer from
restored state. Outside every field the answer is open sky, as `docs/readables.md`,
"Reading needs light" requires, so missing data never reads as darkness. See
`src/core/skyField.ts`, `SkyFields`, `src/game/worldSetup.ts`, `createWorldSetup`, and
`src/game/session.ts`, `createSession`.

Rules that ask whether a place is lit enough, such as reading a page or a sign, take the
renderer's falloff and its content tuning, so light levels for the rules are never tuned
apart from the light the player sees. A carried beam counts for its holder, because the
player aims it at what they read; a beam set down points somewhere the rules don't model,
so it counts for nothing. A lit candle held alone is enough to read by at night. See
`src/core/illumination.ts`, `illuminationAt`, and `src/render/lightFalloff.ts`,
`installNearFieldFalloff`.

Mesh-first admission protects the first visible geometry without making it wait for
lighting readiness. A copied sky request may wait outside the pool capacity;
a mesh completion admits it before the next mesh refill, preventing persistent
mesh backlog from starving lighting. Native worker FIFO remains the executor;
its FIFO alone cannot guarantee fairness between these callers. A synchronous build
of a large field takes far longer than a frame, so the renderer asks the cache for
off-thread builds of the fields near the camera, one at a time, and never builds while
drawing. The cache captures the snapshot on the main thread and installs the worker's
result only while that snapshot is still current, so it is the result a synchronous
build would give. Each field holds its own pending capture, waiting or out at the
worker, until the result lands or an edit makes it stale; a capture the worker cannot
take yet stays on its field for that field's next request, so several fields the camera
passed can each hold one. See
`src/game/streamer.ts`, `dispatchSky`, `src/core/skyField.ts`, `request`, and
`src/render/skylight.ts`, `prepare`.

Until a field's answer lands, the view dims its diffuse sky to a content cap, during the
load pause and in play alike. Near the player, direct sun still follows the shadow map,
because that map is cast from real geometry; beyond the shadow map, an unbuilt receiver
gets no direct sun. This is a presentation fallback, not the simulation's answer: a
query builds the field synchronously, so gameplay already reads the room's real light.
A room briefly too dark reads as "not lit yet", while open sky in a roofed room reads
as wrong light; finishing a field before revealing its room would avoid both but stalls
frames on walks without scheduling to spread that work. When #1261 provides that
scheduling, finishing before reveal replaces this fallback. See
`src/content/base/graphics.jsonnet`, `unbuiltSkyCap`. Once a field has a complete
result, the view keeps it while an edit is rebuilt, so opening a door cannot flash a
dark room. The replacement
swaps atomically, and a late result for superseded geometry cannot install. Retained
column heights supply the nonresident estimate. CPU and shader share this policy. The
kept result can delay a darkening edit or step visibly at replacement; that is
presentation latency only, since gameplay's answer is already current. Results survive
GPU eviction, so re-entry does not repeat transport. Solve halos and spatial lookup
cells do not expand the fields. Arbitrary construction and caves remain outside them.

Worker execution protects rendering from dense transport work, but copying, submission,
publication and texture uploads still consume the main frame, so background execution
alone does not show that a weak GPU holds its frame rate; #680 owns that. Lighting readiness is derived presentation, never simulation or save state.
Interior-source propagation remains separate work.

Keep a carried item's glow attached to the item in hand, on the ground, and in
flight. Rendering and zombie sensing are separate: visual beam shape affects
what the player sees, while zombies sense a carried source by its visibility
and distance. Source colour, intensity, range, beam, and burn rules belong to
content. The flashlight needs a broad, soft-edged beam; a narrow cone showed too
little of a room and path to play by. Time-of-day lighting belongs in sky and
fog, not baked into chunks. See `src/core/lights.ts`, `lightSenseSourceFor`;
`src/render/lightPool.ts`, `LightPool.update`; and `src/core/dayPhase.ts`,
`dayPhaseAt`.

A burning torch or candle set down keeps burning and spending its fuel, standing
upright with its flame and light where the flame is: standing one up is how a player
sets it down to light a room. Whether a model rests upright is content, so any such
light stands the same way. See `src/render/models.ts`, `prepareModel`, and
`src/render/modelFlame.ts`, `ModelFlames.onModel`.

An oil lamp gives lamp oil a use, and a lit lamp set down at night makes the base a
beacon: the player trades light for being seen, either lighting the room and being
noticed from far off, or sitting in the dark. A lamp carried lit keeps a hand busy;
a doused one stows. Its fixed reservoir keeps the bottle an ordinary bottle rather
than a fitted part. Fuel moves only between explicitly selected compatible vessels:
emptying needs a receiver, not disposal or an automatic search for nearby stock.
Service requires extinguishing, but no cooling wait: there is no heat consequence
to model, and a lamp-only heat system would invent procedure without a meaningful
choice. See
`src/core/liquids.ts`, `planLiquidTransfer`, `src/core/inventory.ts`, `Inventory.transferLiquid`,
and `src/core/lights.ts`, `drainLight`.
The reservoir readout owns the measured balance; the lamp's status reports only
its switch state so the same oil cannot appear to be a second battery supply.
See `src/game/survival.ts`, `Survival.describe`.

A battery goes into a light only as the player chooses: dropped onto the battery slot
on the light's card in the inventory, which shows the battery loaded, or used from one
hand while the other holds the light. A battery used from a pocket, by the quickbar
or otherwise, refuses. Only using the battery loads it: a dead or empty light used
refuses and says so, whatever the other hand holds, because one way to load from the
hands keeps the rule simple and the player acts with the battery on the light, not the
other way round. The player chooses which battery goes in, so a fuller battery hidden in
a bag never overrides the one in hand. The card slot serves a light with no free hand,
such as one fitted to a gun, whose card shows the same slot. A hand load needs both in
hands and a slot drop needs both in reach, a fitted light through its gun; the swap
rechecks the route that admitted it when it completes. See `src/core/options.ts`,
`batterySlotOption` and `batteryOption`, and `src/ui/inventoryScreen.ts`,
`batterySlotTemplate`.

A held light's battery can be taken out on its own, as an action chosen on the wheel
and then activated, because a swap needs a spare: without one a player could not move
a cell to a charger, another light or a pocket. It follows magazine removal: the light
must be in hand, the battery keeps its charge and goes to the first pocket with room,
else the ground, and with nowhere to put it, it stays fitted. A dead primary cell is
thrown away, as in a swap. Taking the battery out switches the light off, and an empty
light is a valid item that takes a battery back as a dead one does. See
`src/core/lights.ts`, `unloadBattery`; `src/game/itemActions.ts`, `itemActionsFor`;
and `src/core/options.ts`, `stowTarget`.

Zombies see light farther than they see a player in darkness, and see a player
lit by any source. Aimed-down or covered flashlights shorten that reach. Light
through doors and windows can make a building a beacon; covering or boarding
windows hides it. Thrown flares, glowsticks, and fire lure zombies like noise,
while the lantern zombie uses the same principle against the player. Most
portable lights occupy a hand; a headlamp frees both at the cost of a weaker
beam. Fuel, batteries, and powered fixed lights keep illumination consequential.

A road flare spends a light to buy a lure. It is snap-lit, cannot be doused and
stays lit where it lands, so the player gives up a light they could have kept, and
is seen while holding it, to move shamblers off a route or a doorway. It draws from
farther than a glowstick because its `seenFrom` is larger; the draw is content, read
by the same light sense as every other lit light, and a flare adds no damage. See
`src/core/lights.ts`, `lightSenseSourceFor`.

Night-vision goggles are a worn light, because power, battery swaps, the worn-light
hold and how far others notice a source already belong to the light component. Their
light stands in for the infrared lamp: dim, green and seen only from close up. While
they are worn, switched on and charged, the whole view brightens and turns green with
grain, and its edges darken to the goggles' narrowed field of view, so seeing in the
dark costs sight at the sides. A spectator sees none of it. It sits in the mood pass
with the drug vignette rather than in a pass of its own. Bright light in the goggles'
view flares through them, with a halo where each light is and the whole view paling,
and leaves them blind for a moment: goggles that make the dark readable are blinded by
real light, the rest of that cost. A wall hides a light's flare, and the flare stays in
the picture, so the simulation never depends on it. A torch carried in hand flares too,
because the goggles and a light in hand are a trade; a light that stays lit when put
down, set down ahead, is how to use both. The goggles' own lamp never flares, being
what they see by, and beams don't flare directly, because they point away from the eye.
See `src/core/lights.ts`, `wornNightVision`, `src/render/moodOutput.ts`,
`createMoodOutputPass`, and `src/render/nightVisionFlare.ts`, `nightVisionFlare`.

## Dropped items land

A drop comes to rest on the ground below the cell it is put down in, as a thrown
item does. So do the inputs or result that a craft puts down, the contents an
unpack spills and the spent battery or cartridge a swap takes out, so nothing is
left floating where the player was in mid-air. A cell with no ground below it is
skipped. A drop never refuses for distance: where it lands is not reach-checked,
so the drop and the throw behave the same, and over a high fall the item lands
out of reach. The player must still reach what they drop.

When no nearby cell has ground below it, throw, drop, craft, unpack and swap all
refuse with the same message, and nothing changes: the work and the package stay
in hand, and the old battery or cartridge stays fitted. One rule and one message
cover every way of putting an item down, and since nothing is lost, letting items
fall, adding diagonal cells for a player standing on a corner, or a pocket for
the spent part can still be chosen later without undoing anything. Ground with no
room left refuses with its own message. A finished repair puts nothing down, an
unpack still goes into a pocket with room, and a dead battery is thrown away, so
none of them needs a landing.

See `src/core/inventory.ts`, `Inventory.landing` and `Inventory.dropLanding`;
`src/core/options.ts`, `dropTarget` and `freshDropTarget`; and
`src/core/itemThrow.ts`, `settleCell` and `putDownRefusal`.

## Held-item throws

Inventory remains the sole owner during flight so saves and fuses do not need a
second ownership model. The arc ends at the pile's visible pose to avoid a landing
jump. A throw adds no hit damage or landing lure; explosive effects belong to the
grenade. See `src/game/throwCharge.ts`, `ThrowCharge.place`;
`src/render/itemThrows.ts`, `ItemThrows.update`; and `src/render/piles.ts`,
`PileMeshes.sync`.

Landing, presentation and duration share a stepped flight so drag cannot shorten
the range while leaving a light item floating through an undragged arc. The launch
follows the player's pitch, rather than borrowing the range of a different angle.
Replay records launch strength rather than a drag-adjusted distance so it can
reproduce the same flight with the recorded aim. See `src/core/itemThrow.ts`,
`throwDistanceForItem`, `flightForItem` and `steppedItemFlight`.

Drag derives from footprint and mass so items need no individual drag rows. The
footprint is a cell-rounded outline, not the face that meets the air, so one
coefficient stands in for shape and tumbling. See
`src/content/base/inventory.jsonnet`, `throwDrag`.

## Hand grenade

A grenade thrown into the horde is meant to be the playtest's climax: the one moment the player can answer a whole crowd at once, with the gore to show it. The FOB armoury holds the grenades, and the horde outside the FOB's west wall stands within earshot of prying the armoury lock through the compound's walls, so forcing the armoury brings the crowd the grenades are for, while the key leaves the horde where it stands. It stands on the west side so the crouch passage through the east wall stays a quiet way in, away from the crowd. See `src/content/base/items-explosives.libsonnet`, `frag_grenade`; `src/content/base/layouts-playtest.json`, `fob_west`; and `src/core/zombies.ts`, `hearVocalNoise`, for how far a horde hears.

- **Pulling the pin is an action.** The held grenade's primary action pulls the pin, or puts it back, and says which; the item's details show the pin, or a burning fuse. Arming takes a deliberate act, so a grenade is never live by accident. See `src/core/explosive.ts`, `Fuses.togglePin`, and `src/game/play.ts`, `togglePin`.
- **The fuse lights when the hand lets go.** An unpinned grenade lights the moment it is anywhere but a hand: thrown, dropped, or put away, because nothing holds the lever once the grip opens. A pinned grenade that is thrown remains a dud, and re-pinning before release makes it safe. There is no cooking, and a lit fuse cannot be stopped. Pin and fuse are saved on the item, including while its presentation arc is playing. The fuse counts down in simulation time inside the zombies system's step rather than in a system of its own, because the scheduler's set of systems is part of the save. See `src/core/explosive.ts`, `Fuses.advance`, and `src/game/session.ts`, `detonate`.
- **The lever flying off is the only sign of a lit fuse.** When the fuse lights, the grenade is drawn without its lever and a short-lived copy of the lever springs away, because the lever flying off is how a real live grenade shows itself. There is no smoke, spark or glow: a real fragmentation fuse burns inside the body, and a visible one would look wrong and would also set the look of every fused throwable. Any fused throwable whose model names a lever part takes the same path, and its launch and lifetime are content. See `src/core/schema.ts`, `LeverModelSchema`; `src/content/base/models-items.jsonnet`; and `src/render/leverProps.ts`, `LeverProps`.
- **The pin shows on the model until it is pulled; the lever stays on until release.** A pulled pin leaves the model and comes back when it is put back in, because our rules let the player re-pin a held grenade, so the model has to show which state it is in. The lever stays on after the pin is out, because on a real grenade the hand keeps the lever down; the lever flies and the fuse starts when the grip opens. See `src/core/schema.ts`, `PinModelSchema`, and `src/render/itemLook.ts`, `itemLook`.
- **It goes off where it is:** at its simulation position, whether the grenade is in a pile or with whoever picked it up. A render-only throw arc never moves its fuse or detonation point. See `detonationPoint` and `detonate` in `src/game/session.ts`.
- **The blast kills most of the way to its radius.** It reaches every body whose centre it sees, falling to nothing at its radius; a wall between stops it. It kills a shambler over most of its radius and severs limbs nearly to its edge, and it strikes the limbs before the region that kills, so a close blast tears limbs off before it drops the body: the giblets are the point. Which region kills is one rule shared with individual hits, so a blast and a hit never disagree on it. Its own push falls off with its damage and throws the severed parts outward. A full-strength level throw clears the blast, while fragments extend beyond it as a separate hazard; a short throw can still put the thrower in the blast. See `src/core/explosive.ts`, `blastShare`, and `src/core/zombies.ts`, `lethalRegion` and `ZombieSystem.detonate`.
- **Fragments are seeded shots.** They are rays through the same hit test as shotgun pellets, so walls and bodies stop them and fewer reach a farther body. One fragment severs a shambler's limb, and they reach past the blast, so a crowd around the landing point comes apart. A full-strength throw carries the player beyond fragment reach; shorter throws can still expose the player to fragments. Each ray is traced against every body in range, so the count sets the cost of the moment; the schema caps it. See `src/core/explosive.ts`, `fragmentDirections`; `ZombieSystem.firePellets`; and `src/core/schema.ts`, `ExplosiveSchema`.
- **The player takes the same falloff, line of sight and fragments** in a simpler model: one blast hit to the torso, and fragments traced against a body box, which zombie bodies do not shield. A short throw hurts the thrower. See `src/core/explosive.ts`, `fragmentHitsOnBody`.
- **The blast is the player's noise, heard from where it went off.** It carries further than any other sound, so it draws zombies from far around to the blast rather than to the thrower.
- **The blast sounds like an explosion; the flash is a placeholder.** The sound is a recorded explosion, because a pitched-down gunshot read as a gun rather than the climax the grenade is for. See `src/content/base/sounds.jsonnet`, `grenade_blast`, and `src/render/blastFlashes.ts`, `BlastFlashes`.

`?debug=1&loadout=grenade` starts with one in hand and more packed (`src/debug/debugLoadout.ts`, `equipDebugLoadout`).

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
| 0 | Farmer, site worker, medic | A shambler carrying its trade's kit |
| 1 | Runner | Fast, fragile |
| 1 | Screamer | Weak, but its scream pulls in the horde |
| 1 | Bloater | Bursts into a noxious cloud |
| 1 | Acid zombie | Spits acid from a distance; the first ranged enemy and first of the acid evolution line, lab storeys only. See `packages/deadvox/docs/acid-zombie.md`, "Acid zombie" |
| 2 | Brute | Big, knocks you back, breaks doors |
| 2 | Soldier | Armoured; carries ordinary kit at the military camp and the crisis HQ |
| 2 | Hazmat | Resists acid and fire (from lab sites) |
| 3 | Smoulderer | Hot to the touch; sets flammable things on fire |
| 3 | Incandescent hulk | A brute running a fever of a thousand degrees: glows, sets fires, warps glass. Seen from far away at night |
| 3 | Lantern | Bioluminescent lure that draws you in, and others |

Zombie types are content definitions used by shared systems; choose behavior through content properties rather than type-id cases. `src/core/schema.ts`, `ZombieSchema`, defines those properties, and `src/core/zombies.ts`, `ZombieSystem.emitFootsteps`, uses the declared footstep family. The soldier appears only at military-camp markers, explicit camp spawns, the crisis HQ's markers and the lab's research level, because the HQ is a military site whose threat should be mostly soldiers and the research level is where the lab's threat changes kind (`DESIGN.md`, "Gauntlet"); no other place that merely looks military takes them; `src/core/settlementSpawns.ts`, `ordinarySpawnWeights`, excludes authored-only kinds from ordinary selection.

A shambler's kit is the loot table its type names in `loot`, rolled when it dies from the world seed and the zombie's id (see `src/game/session.ts`, `onDeath`), so it is deterministic and needs no state of its own: the drop is an ordinary pile that saves already cover. Kit belongs to the kind and lives in content, not in code, because a kind such as the farmer, the site worker or the medic then differs from a plain shambler by one more type and one more table, never by a branch on its id. Kinds with a kit are authored-only and spawn only where their place puts them. Kit uses ordinary items; military loot remains restricted to site containers. A corpse drops only what its loot context admits, so a base kit item outside that context is dead content and a base-content test rejects it; validate does not, because a table supplies weights, not a second geography authority (`DESIGN.md`, "Military loot"). For #487, defer rendering what a kind wears and carries, the military clothing palette, armour, and body searching; until then clothes and tools appear only as drops.

The brute shambler guards the secret cellar (`packages/deadvox/docs/content.md`, "City building types"). It is an authored-only type on mobgen's brute body, with more health and harder hits than the shambler as content values. It wears the brute body rather than a shambler's so it reads as a different kind of zombie in the dark. It bashes doors with no more strength than the shambler and never knocks the player back: the tier-2 Brute's door breaking and knockback arrive together (`packages/deadvox/EPIC.md`, "5. Holding ground"). What that leaves open: a player meets the brute's look in a city house before the evolution line introduces brutes. See `src/core/schema.ts`, `ZOMBIE_MODEL`.

### Spawning

Time-windowed spawn markers provide authored beats without scripting a player
action. A windowed marker spawns only while its chunk remains loaded and its
clock window is open; live play and replay therefore agree at the window edge.
Bounded windows recur daily so leaving the area cannot permanently lose a
threat. An open-ended window is eligible from the first occurrence of its
boundary. A saved spawn ledger prevents a marker from returning after it has
spawned. Windowless markers retain chunk-load behavior. Scenario beats that do
not belong to a marker are event rules, under "Scenario events". See
`ZombieSpawner` in `src/core/zombieSpawns.ts`.

### Scenario events

A scenario composes its events from content rules (#313): a trigger, optional
conditions and effects, so a new beat needs no scenario-specific engine branch.
No script language is admitted. Triggers are elapsed scenario time only; position
triggers wait on BR's gate in `SLICE-5.md`, "Remaining event gate — issue #313",
so the schema admits none. A day-phase condition holds a due rule until its phase
comes round, letting an author aim a beat at night without fixing a clock hour.

A rule fires once. The first zombie tick at or after its time where every
condition holds records the firing in the saved scenario run and applies the
effects in the same tick, so no save can fall between them: loading can neither
repeat nor skip a firing. Only the calendar and that record decide firing, never
column loading or rendering, following `docs/decisions/0008-deterministic-world.md`,
"Decision". Rules stop once the run is won, because a run's timestamps end at its
completion. Rule ids key the record, so validation rejects duplicates.
See `src/core/eventRules.ts`, `advanceEventRules`, and `src/core/schema.ts`,
`EventRuleSchema`.

The first effect releases a horde from an authored world point toward where the
player stood when it fired. It reuses the horde spawn path, so arrival placement
is content, not a new placement rule. A released horde keeps its target until it
arrives, unlike a heard noise it may forget, so a wave sent from beyond the
stimulus memory still comes; that point then becomes its home. Released into
unloaded terrain, it waits like any unloaded actor until the abstract tier of
`EPIC.md`, "4b. The region", moves it. See `src/core/zombies.ts`,
`ZombieSystem.releaseHorde`.

### Amalgam body and damage (#308)

The amalgam's distinct sound-event identities reuse shambler recordings; an authored type pitch multiplier overrides the ordinary body-height rule so the fused creature can keep a distinct low voice. See `src/content/base/zombies.jsonnet`, `soundPitchMultiplier`, `src/core/schema.ts`, `ZombieSchema`, and `src/game/session.ts`, `admitSound`. Deadvox realizes its mobgen body from the saved figure seed and uses the part manifest as the authority for collision bounds, member-owned hit regions and severable roots; it does not maintain a second hand-written anatomy list. The axis-aligned collision envelope follows the realized voxel bounds, with independent X/Z extents. It answers what only needs the creature's size: spawn clearance, zombie-to-zombie separation and its stance on the terrain floor, where a conservative box costs nothing visible and the flesh nearly fills the footprint. Terrain, the player and shots meet the flesh itself ("Exact collision" below). The amalgam's no-jump rule is authored in its type data, so fence and container blocking does not depend on the jump probe's position relative to its envelope. See `src/content/base/zombies.jsonnet`, the amalgam type; `src/core/schema.ts`, `ZombieSchema`; `src/core/zombies.ts`, `ZombieSystem.stepZombieBody` and `terrainStance`; `src/core/amalgamFigure.ts`, `amalgamFigure` and `amalgamCollisionEnvelope`; `src/core/spawnClearance.ts`; and `src/core/physics.ts`, `Body` and `separateBodies`.

The amalgam's authored body scale is shared by its rendered body, collision envelope, posed hit regions and melee reach, so visible and gameplay size cannot drift apart. See `src/content/base/zombies.jsonnet`, `bodyScale`; `src/core/amalgamFigure.ts`, `amalgamFigureForType`; `src/core/zombieRegions.ts`, `posedAmalgamRegionBoxes`; and `src/core/zombies.ts`, `zombieAttackReachMetres`.

Severing a shambler member removes that member's hit regions and its contribution to attacks and reach; the core and every other member continue unchanged. `activeAmalgamMembers` determines which members remain capable of attacking; `zombieAttackReachMetres` disables reach when none remain and keeps shared reach while any member survives. The save records each manifest region's health and severed member IDs, then reconstructs geometry from the saved figure seed. `src/core/zombies.ts`, `ZombieSystem.applyMeleeHit`, `activeAmalgamMembers` and `zombieAttackReachMetres`, and `src/core/saveFormat.ts`, `wirePayloadSchema`, own that handoff. Initial member-health values inherit the shambler region values in `src/content/base/zombies.jsonnet`, keeping authored anatomy consistent; reviewing the realized body can identify any needed tuning.

The core's authored health keeps a center-mass pump blast from ending the fight immediately, while each fused member keeps its own damage regions and can be severed by focused fire. The resulting shell count is balance tuning, not a fixed gameplay contract; `test/amalgam.test.ts` protects survival of a blast and member loss before core death without pinning that count. See `src/content/base/zombies.jsonnet`, `amalgam.regions`, and `src/core/zombies.ts`, `ZombieSystem.firePellets`.

The amalgam reuses `ZombieSystem`'s perception, attention, movement and attack lifecycle: it wanders slowly until it notices the player, then takes a direct, heavy approach, telegraphing its more severe attack before damage resolves. Its pace and attack severity live in the zombie type data rather than a scripted phase or code default. A hit snaps the shared `core` pose so the fused body reacts as one while renderer and hit-region FK stay aligned. See `src/content/base/zombies.jsonnet`, the amalgam type; `src/core/zombies.ts`, `ZombieSystem`; and `src/core/zombiePose.ts`, `posedShambler`.

For #424, debug-spawned amalgams start beyond their type-scaled attack reach so the preview shows the approach rather than beginning in melee range. The debug placement also uses the realized collision envelope, avoiding spawns embedded in nearby solid geometry. This changes the preview's starting distance, not the amalgam's attack reach or chase pace. See `src/debug/shamblerSpawning.ts`, `spawnZombieType`; `src/bench/shamblerPlacement.ts`, `placeShamblerRing`; and `src/core/zombies.ts`, `zombieAttackReachForType` and `zombieBodyDimensions`.

A surviving amalgam attacks with a tentacle that strikes in a straight line from its core to the player's chest, at any height, within its usual reach; anything solid across the line blocks it. A creature with a long tentacle should be able to reach a player standing above it, on a roof for example, and not only one level with it. The reach stays the same, so height costs distance rather than adding range. Humanoid zombies keep their grab: horizontal reach within a band matching a standing player.

The line starts at a fixed interior point of the core at rest pose, so the simulation's check and the rendered tentacle start in the same place; the render follows the posed core, so the two part only during a hit flinch. A fixed point also keeps a change in the player's bearing from moving the root between the core's lobes. The tentacle extends along the line through wind-up and strike, then retracts, capped by the same reach; it adds no collision, hit region or saved state. See `src/core/zombies.ts`, `withinAttackReach`; `src/core/amalgamFigure.ts`, `amalgamStrikeOrigin`; `src/render/amalgamTentaclePose.ts`, `amalgamTentaclePose`; and `src/render/mobActors.ts`, `MobActorMeshes.updateTentacle`.

A damaging hit on the amalgam knocks a chunk of flesh out of it and leaves a hole. The hole starts at the flesh voxel the hit test struck ("Exact collision" below), so there is no second hit test. A severed member's voxels went with the member, so a shot passes through where they were, as the hit test and the renderer do. Every damaging hit takes at least the struck voxel, and the type's carving rule adds every visible flesh voxel within a radius that grows with the hit's damage, up to a cap. The rule is tuned so a full close shotgun blast to the centre knocks out a chunk several voxels across, which reads on a body the amalgam's size; a lighter hit takes less, down to the struck voxel. One shot's pellets make one hole per amalgam, sized by their summed damage and centred on the struck voxel nearest their middle: one shot reads as one chunk, and pellets along one line can't tunnel through the body. The core voxel the tentacle roots in is never removed, so the core always keeps flesh. See `src/content/base/zombies.jsonnet`, the amalgam's `carving`; `src/core/schema.ts`, `ZombieSchema`; `src/core/amalgamCarving.ts`, `carveAround` and `protectedCoreCell`; and `src/core/zombies.ts`, `ZombieSystem.carve`.

Holes change where shots land and where the body fits, never how much it can take: a hole shows damage the regions already took, so damage, region health and severing are as they would be without holes. `test/amalgam.test.ts` compares the hit that carves with the same hit without holes. A hole is simulation state, the amalgam's removed voxels as `Zombie.carved`, so it is deterministic, survives a save and replays. A restore refuses holes no play could make: a cell outside the grid or without flesh, the protected core voxel, or any hole on a type that doesn't carve. See `src/core/saveFormat.ts`, `wirePayloadSchema`, and `src/core/zombies.ts`, `ZombieSystem.restoreState`.

**Exact collision.** Terrain, the player and shots meet the amalgam's flesh, not its boxes. Rounded lobes make box-only collision stop it short of gaps its body fits and take shots that pass beside visible flesh. Hold near-wall collision work to at most 0.1 ms per amalgam per tick at p95, including snug corridors, so about ten simultaneous amalgams remain affordable. Measure collision work separately from perception and attack, rather than comparing unlike tick costs. The generated shape is a gameplay collision input, so Mobgen's voxel and triangle budgets don't establish its movement cost: keep collision-query measurements distinct from them. Read terrain through `worldBricks` as the game does: a stand-in brick source with a costlier read charges the shape for the stand-in. In open terrain, collision should cost no more than a box. Holes count for shots and movement as long as maintaining them stays cheap beside the tests themselves. See `src/bench/amalgam-cpu.mjs`, `scenarios`, for the rerunnable workload and measurement boundary.

A ray that enters a posed region box walks that bone's voxels and strikes the first flesh still there, so a ray beside the flesh misses, a shot into a hole strikes the flesh behind it, and a shot through a hole that goes all the way passes. See `src/core/amalgamCarving.ts`, `fleshHit`.

Movement and hit tests use the amalgam's flesh rather than its bounding box,
including carved holes; its rest pose stands for the moving body, not swaying
limbs. Shape-aware movement must let the amalgam and forward walkers turn off
terrain they press against, without pushing flesh through blocks. Refuse a turn
that cannot be freed and undo a step that leaves the body hanging on an
obstacle. A body resting on unchanged terrain skips collision work. Use these
rules for the cost target as well as plausibility: shape collision should not
make many simultaneous amalgams unaffordable. See `AmalgamShape` in
`src/core/amalgamShape.ts` and `ZombieSystem.settleTurn` in
`src/core/zombies.ts`.

Keep invariant geometry out of the repeated contact search: turns and small
translations revisit the same tree and terrain layer shapes. Hoisting that
arithmetic reduces work without changing the axis-by-axis movement path or
assuming nearby poses share collision answers. A filled leaf can answer as a
box only while no holes or height filter invalidate that equivalence; push-out
still needs individual overlapping voxels. Do not rebuild a per-facing
height-extents table: its upkeep costs more than the collision it avoids. See
`src/core/amalgamShape.ts`, `AmalgamShape.nodeOverlaps` and `layerBox`.

**Movement and corners.** A type's `locomotion` says how it moves relative to its facing. A `forward` walker, as every shambler type is, moves only where it faces, so it turns before it heads somewhere new. The amalgam is `omnidirectional`: it moves toward its goal at once while its facing turns toward the goal at the type's turn rate, so its sight, its reach and its look still follow the facing. A body its size that must face where it walks spends its time turning before it can move off a wall or toward a player beside it. Its pose has no gait, so moving sideways or backwards shows no foot slide.

It keeps a shambler's decisions, the same senses, targets and modes, but steers its size round corners, door frames, pillars and wall ends, so it stays a threat instead of grinding against them. `ZombieSystem.wallAhead` notices a wall by moving a body's shape the lookahead distance along its aim and testing that shape against terrain, so a block corner the centre line clears but the body catches still counts as contact. A shambler's body box and the amalgam's flesh both pass that shape-along-aim test, the amalgam's shape being its flesh. A shambler then slides off to a seeded side and sometimes wanders, while at a new contact the amalgam slides to the side its flesh can move to: met at a slant, that is the side the wall leads it along, and caught on a door frame, the side that frees it, where a random side could back it out of the doorway it is squeezing through. If both sides are open, or neither side is free as when snug in a doorway, it draws its side as a shambler does. This costs one shape test per moving tick and two more when a contact starts. See `src/core/schema.ts`, `ZombieSchema`; `src/content/base/zombies.jsonnet`, the amalgam type; and `src/core/zombies.ts`, `steer`, `ZombieSystem.wallAhead` and `ZombieSystem.openSide`.

The renderer rebuilds a holed amalgam's mesh without its removed voxels, and the faces the hole exposes take the type's interior colour. They are marked as wound faces (`CARVED_NEIGHBOUR`). The removed voxels fly off along the shot as a render-only rigid chunk that lands, lies, sinks and is removed, with a cap on live chunks. Gore covers the amalgam as it does shamblers ("Gore is presentation only" above): carving throws an extra burst of blood, and a chunk leaves a large splat where it lands. Neither the chunk nor the rebuilt mesh enters the simulation, and the corpse keeps the holes. See `src/render/amalgamFlesh.ts`, `buildCarvedGeometry` and `FleshChunks`, and `src/render/mobActors.ts`, `MobActorMeshes.zombieCarved`.

The runner's threat comes from speed rather than stronger attacks; the crawler's
low posture confines its bite to the legs. Keep their moves, hit regions, sounds and
spawn chance authored with the type. See `src/content/base/zombies.jsonnet` and the
spawn markers in `src/content/base/templates.json`. Type weights scale authored
marker chances and choose settlement wanderers, keeping rarity a content property
rather than an inference from generated counts.

The crawler is a prone ground-crawler with amputated legs, a grounded pose, and a
low profile that limits its bite to the player's legs. Its posture determines
posed hit regions, so gait and flinches follow those regions. Keep other short or
hunched forms as distinct future types, not crawler variants.

All mobs look toward the player only when they perceive the player. Hearing and
noticed lights can also draw gaze; hearing direction uses deterministic jitter,
and a noticed light uses the same near-perception presentation as noise. Gaze,
labels, and spectator-camera movement never affect hit geometry, saves, replay,
or simulation fingerprints. The test-noise action is different because it
intentionally enters the simulation's sound path. The mobgen viewer has no
perception state, so its gaze follows its camera. See `ZombieSystem.updateAttention`
in `src/core/zombies.ts`. The crawler gait and support rules live in
`crawlerGaitPose` in `packages/mobgen/src/mob/crawler.ts` and `resolveSupportBones` in
`packages/mobgen/src/core/generate.ts`.

When #370 is addressed, define hesitation and pursuit decisions on non-violent
sounds. When #371 is addressed, define how nearby shamblers respond to a
pursuing shambler's hunting sound.

### Evolution

A zombie can change into a tougher type after enough game days. Where it lives
decides the options: near labs they turn weird, around military sites they
toughen up. This is the game's long-term clock: the longer you survive, the
worse the world gets.

### Senses and AI

Occlusion cannot make a target beyond the maximum detection range detectable.
Reject those targets before querying terrain, rather than reducing AI cadence or
changing attention rules to handle dense crowds. The bound must include far
hearing and carried-light reach; nearer targets still use ordinary occlusion and
crouch rules. See `src/core/zombies.ts`, `hearingTier`, `hearVocalNoise` and
`seesPlayer`.

- **Senses:** sight (a view cone and range, blended smoothly from day range to
  night range through twilight and reduced when you crouch), hearing (noise events)
  and smell (a trail the player leaves, which rain washes out). The base pack's
  day cycle applies to every site; its late-June, mid-latitude cycle with nautical
  twilight gives long daylight without modeling seasonal change. The day cycle is
  required content with no code default, so a pack without one fails to load rather
  than silently playing under a hidden sun. See
  `src/content/base/dayCycle.json`, `dayCycle`, for its authored settings, sky
  looks and weather fog included (`docs/content.md`, "Day cycle"). Sky,
  sight blending, horde roaming and named spawn windows follow solar boundaries
  rather than fixed clock hours. Hordes roam from sunset through dawn
  until sunrise, and spawn words resolve from those same boundaries. Terrain height
  alone should not end a clear pursuit; sight over a rise is bounded by occlusion,
  not by spending range on vertical distance.
  See `src/core/dayPhase.ts`, `dayPhaseAt`; `src/core/zombies.ts`, `seesPlayer`
  and `ZombieSystem.updateHordes`; and `src/core/clock.ts`, `resolveSpawnTime`.
- A shambler moves directly toward its current attention target in the horizontal plane. Collision resolution preserves available tangential motion; when a head-on intent has none, `ZombieSystem.tick` uses the seeded `obstacleSlideSide` to supply it. `canJumpObstacle` gives low obstacles a jump attempt. On some obstacle contacts, `ZombieSystem.tick` selects a tested open heading from the shambler's seeded behavior stream, walks the distance configured in `src/content/base/zombies.jsonnet`, then resumes toward its current target. There is no route planning, stair traversal or waiting for a route. Height changes are handled only by ordinary collision and jumping. See `packages/deadvox/src/core/zombies.ts`, `ZombieSystem.tick` and `openWanderHeadings`.
- Shamblers do not gain stair knowledge from an attention target on another floor.
- For #281, visible prey suppresses obstacle wandering; an active wander ends when the prey becomes visible, and the shambler resumes beelining while retaining its slide. Unseen targets and idle strolling can still wander. See `packages/deadvox/src/core/zombies.ts`, `seesPlayer` and `ZombieSystem.tick`.
- The named phases in `src/core/zombies.ts`, `ZombieSystem.tick`, make the established order reviewable because later steps consume state produced by earlier simulation steps; keep that order when changing the per-tick behavior. See `ZombieSystem.updateAttention`, `ZombieSystem.stepZombieBody`, `ZombieSystem.updateObstacleContact`, `ZombieSystem.resolveZombieAttack` and `ZombieSystem.emitFootsteps`.
- **Quiet-sound hesitation:** An uncommitted individual pauses and turns toward a quiet noise before deciding; loudness, not a sound category, makes a noise urgent. Idle listeners refuse, while listeners already strolling pursue after the pause: movement expresses existing interest without a heard-noise history or a random pursue roll. Refusal biases the next stroll toward the sound and briefly makes another noise urgent. Searchers and pursuing bodies retain their existing attention rules; sight and light can interrupt the pause. Hordes beeline because their group response should remain decisive. Player movement hearing remains continuous rather than restarting a discrete-noise pause. See `src/core/zombies.ts`, `ZombieSystem.updateAttention` and `ZombieSystem.beginStroll`; tuning belongs to `src/content/base/zombies.jsonnet`, `hearingModel`.
- **Shared interest:** Alerts recruit only uncommitted listeners: searching and returning bodies already act on their own memory, and recruiting them re-arms echoes. Recruitment eligibility is an attention-state invariant, not content tuning. Sharing the target and its uncertainty keeps listeners interested in the stimulus rather than the caller. Cascades deliberately remain undamped so crowd behaviour can be evaluated before imposing a limit; slow echoes through bodies that become idle again are accepted. A future damping decision belongs at the recruitment boundary, not in player noise. Draining calls before movement prevents entity iteration order from giving one listener an extra movement tick, and keeping the queue transient avoids pending calls crossing a save boundary. See `src/core/zombies.ts`, `ZombieSystem.announcePursuit` and `ZombieSystem.processChainStimuli`; tuning belongs to `src/content/base/zombies.jsonnet`, `hearingModel`.
- **Attention and attacks:** Sight and hearing remain the authorities for choosing targets, so interest chaining must not replace visible prey. Far-hearing direction stays uncertain: a grounded listener projects it onto known terrain rather than learning the source's height. See `src/core/zombies.ts`, `seesPlayer`, `farBearingTarget` and `withinAttackReach`.
- **Background steps:** Background zombies beeline in big, cheap steps. Each type's content caps how far one step moves it, because that cap, not the chase speed, sets how fast a fast type closes in while unseen. The background tick rate stays in code: it is the scheduler's cadence, saved with its phase, so it is engine timing rather than tuning. See `src/core/schema.ts`, `ZombieSchema`, and `src/core/zombies.ts`, `ZombieSystem.tickBackground`.
- **Distant attention and noise persistence:** A horde retains a heard noise target until it arrives or forgets it; its sun-derived preference for home or roaming does not replace an active noise target. Once the target ends, the horde roams only from sunset to sunrise. A background zombie with no horde or stimulus uses idle behavior instead of treating the player as an implicit target, because distance alone must not make an unseen zombie pursue. See `src/core/zombies.ts`, `ZombieSystem.updateHordes` and `ZombieSystem.tickBackground`.
- **Stimulus memory:** Individual zombies and hordes forget unreachable stimuli after the shared content duration. The stimulus timestamp is saved so loading does not restart the wait. Whether this duration should use real time or game time remains open for BR's decision; the current simulation-seconds behavior is not a settled design choice. A horde resumes the sun-derived roam or home behavior after forgetting. See `ZombieSchema` in `src/core/schema.ts` and `ZombieSystem.updateHordes` in `src/core/zombies.ts`.
- **Background cadence persistence:** Save/load resumes the background scheduler's actor phase so a mid-cycle save does not reorder attention and movement updates. See `zombie-background` in `src/game/session.ts`.

- **Level of detail:**

  | Tier | Where | Simulation |
  | --- | --- | --- |
  | Active | Nearby actors | Detailed AI, body physics and beeline movement (implemented) |
  | Background | Distant actors in loaded chunks | Reduced-rate, collision-resolved beeline toward attention (implemented) |
  | Abstract | Actors in unloaded chunks | Hordes moving as groups on the region map (Slice 4b) |

  Loaded distant actors remain in the same store and switch their update
  schedule by derived proximity and terrain availability. Loaded hordes
  share noise-driven targets and drift at night, but
  remain individual actors rather than a region-map abstraction. Save the
  group's target and random stream with member offsets so noise response and
  roaming continue after load; derive the tier again instead of saving it. This
  keeps the terrain collision authority live and avoids persisting a navigation
  field. See `src/core/zombies.ts`, `ZombieSystem.tickActive`,
  `ZombieSystem.tickBackground` and `ZombieSystem.addHorde`; and
  `src/game/session.ts`, the `zombies` and `zombie-background` scheduler systems.
  Abstract hordes are a separate future system; loaded terrain remains the
  collision authority, so the current design does not persist navigation fields.

A chasing or investigating zombie held up at an obstacle bashes it once per attack
cooldown with its type's content strength; the piece decides what the blow does
(`DESIGN.md`, "Base building and electricity"). Bashing comes from strength, not
from movement or a silhouette, so a type of strength 0 never bashes. A zombie
keeps working at a piece only when the piece is its one way through, within a
reach its type names in content; the same reason holds it at a door leaf, so one
rule covers doors and furniture, and a zombie walks around clutter it can pass
instead of wrecking it. While it bashes it stays at the piece instead of sliding
or wandering along the wall. See `src/core/zombies.ts`, `ZombieSystem.bashObstacle`.

### Models

Blocky figures with rigid limbs and keyframed animation. This is where skelly's
skeleton roots come in: a zombie's body is a small assembly of connected parts.

The player figure is a cleaner low-poly human, distinct from the zombies. A
designer agent shapes its parts in the authoring tool and exports them like
items; BR reviews renders and in-game views. The figure is voxelized on the item
grain: the face reads crisper there than on the vehicle grain, which loses it,
and no extra class is left to maintain. Retuning the item grain moves the figure
with the tools, which is accepted.

The figure is a content row, so a mod or a second character ships its own row
and part models without a code change. The row names the body and limb models
and the anchors they join at, and holds every value that shapes the drawn
figure: hip height, walking swing, the arm rig and where the view hangs the
arms. One arm model serves both views: the world body swings it whole, and the
first-person view bends it at its authored joints to reach the held grip, so
the two views never diverge in look or proportion and the arm bends where a
rigid model could not. The view's shoulder is a row value, not a renderer
constant, because a figure with other proportions needs other shoulders. Every
part is an authored model, with no box stand-in, so a row that names a missing
model, anchor or rig part, or puts the right view shoulder left of or above the
eye, fails validation instead of drawing a partial body. Hit regions keep a box layout,
because the body simulation, not the drawn shape, decides where a hit lands, so
gore stays put while parts change. See `src/core/schema.ts`, `FigureSchema`,
`src/render/armRig.ts`, `buildArmRig`, and `src/render/playerFigure.ts`,
`playerFigureLayout` and `PLAYER_REGION_BOXES`.

A long gun is held like a rifle, and the hold is authored on the gun's model,
not in the renderer: the model says where its butt seats in the shoulder and
where and how each hand takes it. The firing hand wraps the pistol grip when the
gun has one, and otherwise the stock wrist, fingers under the wrist and thumb over
it, because a pistol-grip pose on a pump gun or a hunting rifle closes on nothing
and looks wrong. The gungen export marks the kind: a grip part means a pistol grip
and a stock part without one means a stock wrist, and a long gun that exports
neither fails to compile, because a guessed hold would close on nothing and hide
the missing part. The support hand cups the forend from below at the exported
support anchor, whose height gungen reads off the forend underside the file
draws, so the contact follows the drawn forend instead of a stale hand-copied
height: the bore running across the palm from its heel to the gap between
thumb and index, the fingers curling up the gun's far side and the thumb lying
along the near side, because a support hand on the side of the forend reads as
resting on top of the barrel instead of carrying the gun from under it. The view keeps the butt in its seat and
lowers and raises the gun by turning it about the butt, so the stock stays
shouldered at every ready level and both arms reach the gun from the shoulder
instead of the gun floating in front of the eye. A gun that turns about its
butt swings its muzzle further than one that only drops, so the lowered pitch
is set so the lowered gun stays inside the player's view. Both holds are
authored for a right-handed hold and mirrored together across the gun for a
left-handed one: the support hand is the other hand, but it keeps the gun's
side, so a hold is authored once. The hold lives in content because a new gun,
a mod gun or a retuned hold must not need a renderer change, which is the
content pillar in `PILLARS.md`, "Content forward compatibility", and because
one hold formula could not fit a pump gun and a pistol-grip rifle alike. A
two-handed firearm without an authored hold, a seat left of the eye or a palm
not square to its fingers fails validation rather than drawing a hand through
the stock. A one-handed gun keeps the grip frame it had. See
`src/content/base/long-gun-hands.libsonnet`, `firingHold`, `src/core/schema.ts`,
`HandsModelSchema`, `src/core/heldPose.ts`, `heldHoldFrame`, and
`src/core/content.ts`, `checkHeldHands`.

Many animations are expected over time, so a pose is data that names a joint and an
angle, and code-posed motion such as arm swing and idle breath is one clip among
many. A pose is never a formula buried in the renderer: a formula in code
cannot be authored, blended or added to without a code change per animation.

## Base building and electricity

- **Construction is crafting that places blocks and block entities:** walls,
  doors, barricades, furniture, workbenches, machines. Deconstruction is
  disassembly.
- **Doors and locks.** A matching key is the quiet route. The noisy fallback needs the door's forcing tool, not always a crowbar, so finding that tool is part of the trade. How a door yields follows from its material and its own resistance; flimsy and burglary-safe leaves need not yield alike. Forced entry destroys the lock so the breach is one-way. A leaf shows its state, because the player has to see which doors no longer hold, and how close the rest are to giving way, before trusting one: damage repaints it in steps as it grows toward breaking, and a broken leaf has its own look. The leaf's material in the shared furniture material table authors both, so a mod retunes them; the steps and redraws work as for any piece (`DESIGN.md`, "Block entities").
- **Breach by strength.** A door leaf yields to blows by its piece's breach, so flimsy and burglary-safe leaves yield differently. A blow below the minimum strength does nothing, so a weak attacker cannot grind through by waiting; stronger blows add up until they reach the durability. Zombie strength and a melee weapon's impulse share one scale, so a zombie's bash and a player's strike meet the same gate; a swing that meets no zombie strikes the standing piece, leaf or furniture, in its reach, and the blow is heard in the sound its material names. Every blow makes a noise zombies hear. A broken leaf stands open with its lock gone and cannot be shut, so the breach is one-way, as forcing is, and movement, sight and sound treat it as an open doorway. Damage short of breaking leaves a boarded leaf's opening sides as they were. A container's front is its body, so a blow on it damages the whole piece; on a piece that is no door leaf, the breach sets the durability its condition is measured against, and reaching it ruins the piece (`DESIGN.md`, "Damage, destruction and dismemberment"). See `src/core/blockEntities.ts`, `BlockEntities.bash`, `src/game/session.ts`, `bashPiece` and `strikePiece`, and `src/core/schema.ts`, `FurnitureSchema`.
- **Door bar.** Barring holds a door shut at the player's choice, so where to bar is a decision about which side to be on. A bar set on a shut door lies on the setter's side: that side must lift it before opening, and the far side is refused. Setting and lifting take time and both hands. The barred side is door state beside the lock, not item state, so a bar on a door survives a save and a bar item is just the thing that sets it; setting spends the item and lifting gives one back. A broken leaf loses its bar with its lock, and boarded doors take no bar. See `src/core/blockEntities.ts`, `BlockEntities.setBar` and `BlockEntities.liftBar`, `src/core/options.ts`, `heldDoorBar`, and `src/core/schema.ts`, `ItemSchema`.
- **Forcing routes trade time against noise.** A door offers more than one forcing method so the player chooses how to pay: the crowbar's prying is slow and the quieter route, the sledgehammer's hammering is fast and the louder one, and it is heavy and two-handed to carry. Each method names its own strike sound and times, so the choice is content, and the noise reaches zombies through the same hearing as any sound. Forcing by method and destroying a leaf by damage stay separate, so boarded doors and bashing leave this choice alone. See `src/core/prying.ts`, `pryPlan`, and `src/core/zombies.ts`, `hearPlayer`.
- **Cutting.** Cutting a wooden door will start a fire, so wood offers no cut method until a fire model exists. Cutting steel is a flame-cutting quality apart from a knife's `cutting`, and a finished cut spends gas from the torch's swappable cartridge, so one torch does not settle every cut door; a cut without enough gas won't start. Refilling a cartridge is direction only, with no source yet. See `src/core/prying.ts`, `pryPlan`, `src/core/torch.ts`, `spendFuel`, `src/core/longAction.ts`, `LongActions.beginForcing`, and `src/core/schema.ts`, `FurnitureMaterialSchema` and `DoorForcingSchema`.
- **Electricity** keeps topology separate from energy balance so rate changes
  do not rebuild networks. Resource settlement and timestamped power transitions
  preserve appliance history across absences and wiring changes. The dispatch,
  storage, solar and link rules and their reasons are in
  `docs/electricity.md`, "Electricity"; see `src/core/power.ts`, `PowerNetwork`,
  and `src/core/powerGraph.ts`, `PowerGraph`.
- **Portable charging.** Charging returns the same battery rather than replacing
  it, because stopping or destroying a charger must not erase condition or energy
  already paid for. Rechargeability and light compatibility are explicit content
  choices; primary cells must not become rechargeable by category or naming.
  Integer microjoules retain the fraction of a light charge across advances,
  stops and saves, so partitioning time cannot mint energy. Conversion losses and
  the unused fraction of the final served millisecond dissipate rather than
  charging network storage as well. An empty rechargeable cell remains worth
  keeping. See `src/core/batteryChargers.ts`, `BatteryChargers`,
  `src/core/battery.ts`, `batteryEnergy`, and `src/core/lights.ts`, `swapBattery`.
  Unattended work must not reserve the player's hands or depend on an open panel;
  local controls project the world owner instead of driving it. See
  `src/ui/chargerPanel.ts`, `chargerPanel`, and `src/core/sitePower.ts`, `SitePower`.
- **Fire** is a world system: burn rate per material, spread to neighbouring
  flammable blocks, smoke and light. Hot zombies and molotovs use the same
  system.

## Vehicles

The vehicle goal is deep modularity and customizability without requiring
fidelity beyond what play needs. The first playable scope and implementation gates
are in [SLICE-6.md](SLICE-6.md); the visual model's reasons are in
[docs/vehicle-spike.md](docs/vehicle-spike.md). These are design rules, not a claim
that parked scenery implements the vehicle simulation.

Vehicles are built, not picked. How a vehicle looks, holds together, runs,
handles, sounds, breaks, and gets repaired follows from the parts fitted and
their state.

1. **A car builder, not a car customizer.** Parts attach by capability, not by sockets a
   designer laid out in advance: a wing mirror needs a mountable vertical face, and a
   door, a halfboard or a plate the player welded on can all provide one. Players can
   then build things the designers didn't foresee. Vehicles own their fittings
   rather than switching a designer's list on and off. See `VehicleInstance` in
   `src/vehicles/model.ts`.
2. **Fitting answers four separate questions:** what may go here (slot and layer); what
   holds it up (a set of supports, which also decides what can be removed); by what
   (skill, tools, materials and time to install, remove and repair, because building and
   repair are crafting); and what it's for (the capabilities it provides). The spike's
   supports are `src/vehicles/model.ts`, `Fitting.supportedBy`.
**Parked service.** Factory service sites use a content mount identity and content-owned
quality and duration requirements. `src/core/vehicleWork.ts`, `vehicleWorkHooks`, keeps
the exact UID with its original owner until `src/core/inventory.ts`, `Inventory.vehicleTransfer`
preflights and commits the transfer, so a stopped or refused action cannot orphan it.
`src/core/longAction.ts`, `LongActions.beginVehicleWork`, saves references rather than a
copied part or an interaction closure. Removing a part another part rests on is refused
before work starts, so no work time is spent on a part that cannot come off.
Interacting with a parked vehicle part opens the vehicle in the inventory screen's
surroundings, because exact service requirements and which loose parts fit an empty site
are facts the world geometry cannot show. Fitted parts are ordinary items with their usual
details; empty service sites show their content names; each operation names the exact
vehicle, site and part the player selected and shows the core's own refusal, so the surface
never promises work the action would refuse. Vehicle reach is measured from the chest to the
nearest occupied part box, as furniture reach is, and one predicate decides opening, keeping the
section open and service admission; measuring to the origin would leave a part the player can
pick and touch out of reach. The reach also needs a clear line to a part box, the same rule as
furniture, so a wall can't be worked through; the line ignores vehicle cells because the car's
own body would otherwise hide every part. See `src/core/reach.ts`, `vehicleInReach`, `src/ui/vehicleInspection.ts`,
`vehicleInspectionViewModel`, and `src/core/interactionPick.ts`, `pickInteractionTarget`.
Site names stay in content rather than in the saved build, so a reworded pack relabels saved
vehicles; see `src/core/vehicleInstances.ts`, `vehicleSiteName`.

3. **Condition is not attachment or appearance.** Part types are immutable content;
   fittings own instance state. A fitting places an item on a vehicle without changing
   its identity or condition vocabulary. Cosmetic weathering
   stays separate from functional condition, so rust is not a mechanical diagnosis
   and refitting does not repaint a part. Functional wear comes from damaging events,
   not distance or time: repair follows consequences rather than scheduled chores.
   Impact may detach struck parts and cascade through unsupported dependents, retaining
   surviving parts as world items. Broken attached mass still matters; detached mass
   does not. The spike's type/instance seam is `src/vehicles/model.ts`, `PartType`
   and `VehicleInstance`; it is not the game's damage implementation.
4. **Networks at the fidelity play needs.** Steering is a per-part property. Drive is a
   per-axle driven flag, so front, rear or all-wheel drive is a build choice. Power and
   fuel are vehicle-wide pools: is there a charged battery, is there a tank with gas. The
   fuel tank is a liquid container, and the battery is part of the electricity system,
   which is a graph with batteries as nodes at base scale (see
   [Base building and electricity](#base-building-and-electricity)) and one pool inside a
   vehicle. A real connection graph is used only where the routing itself is gameplay.
5. **Behaviour comes from the build:** mass, centre of mass, noise and handling, then
   fuel use, protection and storage. Vehicles make noise, and driving is fast and loud.
   Engine noise is the source, with the chassis/hull damping it. See `measure` and
   `noiseRadius` in `src/vehicles/model.ts`.
6. **Parts are items.** Salvage and refitting retain condition, appearance, resources
   and contents, rather than copying them into a second vehicle item universe. Parts
   are unhanded to keep salvage reusable across sides, without closing later handed
   content. Shared identity starts at `src/vehicles/catalogue.ts`, `CATALOGUE`.
   Heavy recovery uses a heavy-part-hoist vehicle built and driven through the vehicle
   systems, not an equipment exception or an engine carried in a pocket.
7. **Data-driven and moddable.** VAT assembles things whose shapes the thing tool
   authors. Exported render and baked collision geometry keep authoring operations
   out of the game; shared per-part mass and centre of mass avoid a second physical
   authority. See `packages/thing-core/src/schema.ts`, `NeutralModelSchema`, and
   `things/WORK.md`, "Decisions". Game capabilities remain schema-validated content
   so a mod adds compatible parts without code.
8. **The grain is a useful salvage action.** Factory welded structure is one
   player-facing assembly with component fittings retained for damage and shape.
   Factory structures plus compatible parts and capability-matched add-ons come
   before scratch-building, without reducing mounting to fixed sockets. Keep the grain
   at named swappable parts, not individual bolts, wire runs or plumbing, so repair
   does not become assembly bookkeeping. A body fitted to a chassis cab, such as a box
   van's cargo box, is its own factory structure resting on the frame, not part of the
   cab's, so the chassis cab stays a complete drivable unit without it and the box can
   move to another frame. See `src/vehicles/boxVan.ts`, `BOX_VAN`.
9. **Cheap at scale.** A parked street must not pay continuous driving-physics cost.
   Part-level changes should not require rebuilding unrelated vehicles.
10. **Obstruction follows the build.** Render, collision and picking derive from the
    same fittings and poses, so removed parts cannot leave invisible walls or
    selectable empty air. `src/core/vehicleProjection.ts`, `VehicleOccupancy`, makes
    parked body blockers from occupied exported boxes; `src/core/solidBricks.ts`,
    `worldBricks`, uses the same projection for accelerated physics and navigation.
    This exterior cell approximation leaves clear exported space unfilled rather than
    inventing a cabin envelope. `src/core/schema.ts`, `ItemSchema`, validates the
    per-part obstruction channels, and `src/content/base/vehicles.jsonnet`, `part`,
    authors their policy. `src/core/collision.ts`, `worldOpaque`, `worldSoundBlocking`
    and `worldMeleeBlocker`, plus `src/game/session.ts`, `createSession`, route those
    channels to sight, hearing, combat, light, projectiles and blasts. Shared furniture
    reasons are in `docs/content.md`, "Furniture solidity".

**Driving and access.** Road-going arcade handling is sufficient for v1 beta;
greater realism is the post-beta direction under #322. The physics implementation
remains an evidence-based choice, with Rapier a candidate rather than a dependency;
see [CHALLENGES.md](CHALLENGES.md#8-vehicles-on-voxels). Determinism and streaming
follow `docs/decisions/0008-deterministic-world.md`, "Decision". Leaving a moving
vehicle is allowed: coasting, collision and bystander consequences must not vanish
when a column unloads. Parked vehicles retain their derived world collision.

**Cargo space.** A body's storage and its contents belong to a cargo space: a separate
part resting on a load floor whose own shape is the hold, so storage travels with the
part and losing a wall does not lose the load. The game reads the pocket grid from that
shape rather than from authored numbers; a part's capabilities are names and its sizes
live in its own data, so each size has one source. Only the floor area counts toward
capacity, so open beds and flatbeds hold cargo the same way boxes do; the block's height
only has to clear what is above it. A player sizes a cargo space while placing it by
dragging out a rectangle, which stops at the edge of the free floor the game works out
from the load floor and the parts standing on it. Dragging is the complete form of
choosing a size, so a proposed size can be added on top later without redoing it. The
floor is a rectangle because storage is a rectangle of pockets, as in a backpack: an odd
floor takes several spaces, and a rectangle stays valid if shaped spaces ever come, so
nothing fitted or saved is redone. A space grown to fill walls and roof was not chosen
because open beds have neither. The block then keeps its size, and a part can't be
fitted into it. Players build cargo spaces on load floors the vehicle already has; load
floors and walls built from nothing wait for scratch-built frames, which add to the
cargo space rather than replace it. Player placement arrives with #1124. A cargo
space is a datum, so it fits the drawn vehicle the way grips and anchors do: its block
is its cells, and the block and each free-floor cell snap onto the voxel lattice the
load floor is drawn on. A space that fills a drawn bed then fits it at any vehicle grain,
with no tolerance tuned to that grain. See `src/core/cargoSpace.ts`, `freeFloor`.

Entry is seated through animated usable doors for the first loop. Walking through
plausible interiors is an important long-term requirement for the #322 trucks, RVs
or free-form-building follow-up, not a permanently excluded interaction. Start with
useful fitted cargo; further compartments extend the same ownership model rather
than turning the entire wreck into a container.

**Deferred scope.** #322 carries scratch-built frames, voxel erosion, player-cut
structure, enclosure and arbitrary world objects riding vehicle space. These are
separate from first-slice impact detachment and fitted cargo. #221 owns finer
collision grain; the parked approximation must not be mistaken for exact geometry.
The consumer triggers and reasons are in `SLICE-6.md`, "Deferred work and its trigger".

## Content and modding

Content is data, never JavaScript: mods must not bypass simulation ownership or
persistence. Schema validation keeps authored definitions and runtime types in
agreement; reference validation prevents partial files from entering a world, and a
file that fails validation is skipped whole, so one broken mod cannot leave
half-applied content. See `src/core/content.ts`, `buildRegistry`.

Admission runs in the browser because mods can change what a scenario depends on,
and a failing mod file must be skipped whole. The bundled files pass those same
proofs before a build ships, so re-proving unchanged content on every start adds
pre-title delay without detecting anything new. With no mod selected, a matching
build-validation stamp permits trusting those proofs; any selected mod restores
full admission. Missing or mismatched evidence must also restore full admission,
not silently trust an unproved build. See `src/core/content.ts`, `buildRegistry`,
`src/core/bundleAdmission.ts`, `BundleAdmission`, and `tools/stampBundle.ts`, `stampBundle`.

The registry is built after startup content selection and passed through the world
configuration so every consumer uses the same admitted definitions. A module-load
registry would freeze the base pack before a player could select mods. See
`src/game/bundledContent.ts`, `buildBundledContent`, and `src/game/config.ts`, `GameConfig`.
Both admission paths remain fingerprinted because either can change a world without
changing a simulation call site; see `tools/simulationFingerprint.ts`, `SIMULATION_ENTRIES`.
The stamp also binds its proof dependencies because unchanged content is not evidence
that changed validation code ran. See `tools/bundleStampPlugin.ts`, `bundleStampPlugin`.

A whole-definition override restates the entry, so it freezes the base as of its
writing; how a mod changes one field instead is decided in
`docs/decisions/0007-typed-field-patches.md`, "Decision". Browser Jsonnet and uploaded
assets follow `docs/decisions/0008-mod-authoring-tool.md`, "Build plan"; start-flow
selection follows that ADR's rule in
`docs/decisions/0008-mod-authoring-tool.md`, "Testing, sharing and start flow".
See `src/ui/modsPanel.ts`, `chooseMods`.

Remote intake shares local admission so a host cannot bypass the content contract.
Browser-owned fetching keeps credentials and cross-origin permission with their
owners, without a proxy that widens access. Streaming bounds memory before parsing;
see `src/ui/modsPanel.ts`, `readPaste`.

Browser mods require an explicit mod identity independent of their URL or upload
name. Repeated selection of that identity is an error, not a second admission;
changing transport must not bypass the clash. Different mod identities may still
override the same definitions. Identity belongs to browser intake rather than
bundled content fragments, which are parts of one core pack, not separate mods.
This also gives later persistence and save-pack identity work an explicit owner;
see `src/game/browserMods.ts`, `readMod` and `evaluateMods`.

A save records the base pack's identity, and a save made with different base content
is refused rather than migrated until v1.0 beta (#1023)
(`../../AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility").
Browser mods join the ordered save-pack identity so changing a selection cannot
silently resume a different world. Selection persistence is atomic so a storage
failure cannot load half a set. See `docs/content.md`, "Browser mod identity", and
`src/core/saveFormat.ts`, `versionDifferences`.

Import voxel-editor work (MagicaVoxel, vengi) only when a building outgrows curated
Jsonnet pieces (`../../docs/jsonnet.md`, "Curated map features"); no importer contract
is settled.

## A world that feels real

The world should feel like a real place that was left behind, not a set. A
place feels real when things happen in it that the player didn't cause, and when
it answers what the player does. Each layer below should also do something in
play, not only decorate it.

- **Vegetation:** trees, shrubs, hedges, tall grass, and overgrowth after weeks
  without care: gardens gone wild, weeds through cracked asphalt, and accumulated
  leaf litter in open doorways. Leaf litter is residue from earlier leaf fall, not
  a cue to the current season. What it does in play:
  - **Cover:** passable opaque foliage conceals without trapping you; solid
    trunks and branches also obstruct movement. Content properties govern
    movement and visibility for player, zombies and physical bodies alike.
    Passive cover remains world geometry while
    crouch is player state, so the stance does not change foliage opacity; this
    keeps visibility rules attached to the obstacle rather than making scenery
    appear or disappear with player input. `src/core/zombies.ts`, `seesPlayer`
    and `hearingTier`, own the stance's visibility and hearing effects.
  - **Low growth:** furniture hides someone only by being solid
    (`src/core/collision.ts`, `worldOpaque`), so only a block can be passable and
    still hide you. Author concealing overgrowth as passable opaque blocks;
    vegetation takes its movement and visibility rules from content properties,
    not its name or appearance.
  - **Placement:** authored sites default to light growth, weeds and a few
    shrubs, which keeps them legible and their paths clear; heavier growth is
    left for sites that should feel abandoned. Whether hiding growth stands near
    a gate is each site's own content choice, because no project-wide rule
    exists yet.
  - **Noise:** pushing through a bush admits positioned rustle and hearing
    together through F4, on entry and a moving cooldown, faster/louder when
    moving faster. Leaf litter changes footsteps (`footstep_leaves`). Leaves do
    not muffle either simulation hearing or WebAudio, and do not obstruct
    melee/bites; they still obstruct ray picks.
  - **Materials:** branches and felled trees give sticks and wood, the same
    materials loot gives in Slice 2.
  - **Movement and landmarks:** solid trunks channel movement for you and the
    dead; passable opaque foliage conceals it. A lone big tree is a landmark.
- **Motion:** cosmetic wind moves foliage and loose debris, and rain falls
  (Slice 4a). It makes exposure and the weather readable, rather than leaving a
  world that reads as paused. Wind here is render and audio ambience, not
  another simulated weather system beyond version 1's rain and temperature.
- **Sound of the place:** wind in the trees by biome, birds by day, insects at
  night, a building settling, and the distant sounds from the simulation (see
  [Audio](#audio)). A proposal for birds to go quiet or take off is not accepted;
  BR must decide whether to adopt it. If adopted, it should respond to a real
  nearby cause, not a timer or a guaranteed enemy alarm.
- **Dilapidation:** built things show abandonment through collapsed sections,
  breaches, slumped or missing segments and rubble. A passable breach is a real
  route, so each authored site names the gaps a player can cross. The gauntlet's
  containment wall shows wear without a passable gap because it must still enclose
  the playtest area; its interior buildings and yards are not exempt. A culvert
  may reach a wall only as a grated outfall choked with tonnes of junk: never a
  passage and never pryable, so it leaves the wall closed and the perimeter check
  must keep passing with it in place.
  The gauntlet's sewer stops short of the wall and builds none. See
  [Gauntlet](#gauntlet). New structures and reworks follow this direction;
  retrofitting existing structures is tracked
  in #396. See `src/content/base/camp.libsonnet`, `camp_wall_run`, `camp_gate`, and
  `camp_gate_return`.
- **Wildlife as scenery:** birds, crows on the dead and flies help the player
  read the place, the bodies and the decay. They're environmental cues, not an
  animal ecology, hunting or farming in version 1 (`EPIC.md`, "Not in version 1").
- **Time passing:** authored overgrowth, and dust and leaves indoors, show the
  weeks since people left. Food rotting changes what's still worth scavenging.
  There is no plant-growth or dust-accumulation simulation.

Building weathering gives each site a render-only mood without changing simulation or shared geometry: fairly kept points of interest benefit from restrained change, while long-abandoned places need a general overgrown and dilapidated look. It marks built materials, not nature's terrain or vegetation; `src/core/schema.ts`, `BlockSchema.weatherable`, lets content keep that distinction, and an absent flag means no weathering. Fabric, window frames, chain link and sandbags stay clean because moss and lichen belong on stone, concrete and wood; hazard paint keeps its warning colour, and galvanized sheet keeps its corrugated ribs legible. The overgrown tint may shift the base hue, but the surface pattern must still read; the restrained default keeps each material's base hue.

**Rendering and performance.** Foliage gets a performance plan from the start,
so scale does not force a later redesign:

- **Near the player,** trees use trunk, branch and leaf blocks in the voxel
  grid. Their movement and sight behaviour is explicit; richer foliage rules
  and cutting come in their scheduled slices. Solid and cut-out leaves are
  measured on the same forest workload, including meshing, overdraw, shadows
  and memory. Neither is assumed faster in advance.
- **Far away (Slice 4b),** simplified tree shapes are planned in the far-terrain
  meshes (see [Rendering](#rendering)), aiming for a forest that still reads as
  one at 512 m. That distance and its cost are unmeasured. Neither far-tree
  detail levels nor grass instancing is part of Slice 2's sneak peek.
- **Grass tufts and small plants** that have no effect on play are instanced
  decoration, not blocks.
- **A forest workload in the benchmark,** like the stress-test city, keeps each
  performance change measured.

## Rendering

The current state of the look, and its open items, are in [GRAPHICS.md](GRAPHICS.md).

- **The look:** per-block colour and procedural surface patterns, with weathering layered through `src/render/chunks.ts`, `chunkMaterial`, plus ambient occlusion and fog. The palette is muted and grey; the saturated colours are the ones that mean something: warning signs, blood, fire and the glow of hot zombies.
- **The default look:** tone mapping off, low exposure, the mood pass off and no weathering, because it looks better by eye and costs less. It is content (`src/core/schema.ts`, `LookDefaultsSchema`) and stays tunable by URL parameter and debug panel.
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
  (`src/render/skylight.ts`, `Skylight`). The sun and the carried beam are lit
  on their own, and carried or dropped sources are the pool's shadowless point
  lights (`src/render/lightPool.ts`, `LightPool`; see "Light"). First-person
  hands share the room's sky visibility, so they do not glow in enclosed dark
  spaces; see `src/render/playView.ts`, `prepareLighting`, and
  `src/render/hands.ts`, `HeldItems.render`. Light from torches, lamps and hot
  zombies through the grid is planned for Slice 4a, with
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
- **Far zombie bodies draw at full detail:** a coarser mesh for distant bodies
  cut submitted geometry but showed no repeatable whole-frame GPU saving, at two
  crowd sizes under fixed and adaptive render scale (closed branch
  `deadvox/far-actor-lod`). Any later coarse path keeps the full skeleton, parts
  and joint contacts, so severing and stump gore work at any distance, and
  crawlers keep full detail. Revisit when a frame profile shows far-body cost
  (#1273).
- **Sun shadows:** Favor a stable edge near the player over sharp shadows far
  beyond them. The remaining jaggedness is accepted; do not pursue further
  refinement without a new decision. See `sunShadowTexelSize` and
  `Shadows.update` in `src/render/shadows.ts`.
- **Sealed rooms stay dark at every hour (#562):** darkness must not end where
  detailed sun shadows stop. Beyond the near shadow box, a surface with no diffuse
  sky light or an unknown sky field gets no direct sun, because this keeps distant
  sealed rooms dark at no measurable frame cost. Near shadows remain authoritative.
  The accepted cost is that far roofed floors lit sideways through a door or window
  read dark until they enter the near box; a little diffuse sky can still leave a
  far room sunlit. See `src/render/skylight.ts`, `Skylight.patch`. Light through
  furniture-only barriers remains accepted. Near shadows must hold at every hour;
  see `src/render/shadows.ts`, its header, and `src/core/sky.ts`, `sunShadowStrength`.
- **Furniture is not its own roof (#998):** furniture blocks light in whole
  cells, coarser than its shape, so a wall or seat beside a parked vehicle samples
  sky from inside the vehicle's cell. That cell must not count as the receiver's
  roof, or open daylight shows hard black patches. Transport still treats
  furniture cells as blocking rather than holding light, because held light would
  blend the light outside a closed door into the floor of a sealed room. See
  `src/core/skyTransport.ts`, `visitCell`.
- First-person hands must not stay sunlit when a wall blocks the player's light,
  but nearby lights still need to reach them. Their separate scene prevents wall
  clipping; see `src/render/hands.ts`, its file header.

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
  the same law. It is calibrated on the whole authored figure pool and also
  pitches figures without seeds of their own, so its anchors and clamp are one
  sense tuning rather than a zombie type's; see `src/game/shamblerAudio.ts`,
  `shamblerVoiceLaw`. Body-size pitch tuning affects playback only, never
  hearing or simulation; the `voice_size` comparison site exposes its endpoints.
- **Shambler movement is audible:** surface-specific, heavy, dragging footsteps
  follow actual ground travel; a chase is faster than a stroll. Only the nearest
  few moving shamblers emit footsteps at once, so a horde does not become a wall of
  noise; see `src/core/zombies.ts`, `SHAMBLER_FOOTSTEP_VOICE_CAP`. The MVP reuses pitched-down
  player footstep recordings as an explicit stand-in; body size also shifts
  their playback pitch.
- **Your own sounds:** footsteps by surface and speed, doors, the inventory
  (zips, cans), and heavy breathing when stamina is low. You hear how much
  noise you're making.
- **Heartbeat:** The heartbeat becomes audible as stamina falls and grows faster
  and louder toward exhaustion. It is a presentation cue, not a noise event, so
  shamblers do not hear it and it does not alter simulation or save identity.
  Fear/danger and low-health responses remain open questions for BR. Its curve
  belongs to the body it reports on, so it is body tuning, and its two
  recordings are sound events so validation checks their files. See
  `src/game/audioPresentation.ts`, `heartbeatForStamina`, and
  `src/game/audio.ts`, `GameAudio.updateHeartbeat`.
- **Audio tuning is content** (`PILLARS.md`, "Content forward compatibility"):
  the voice law, the heartbeat and the audio options' starting volumes are
  required content fields with no code fallback, so retuning them never needs a
  code change. The starting volumes are UI tuning because they are what the
  options sliders show before the player saves any.
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

## Regional paper maps

Paper coverage uses the world's existing grid, not settlement bounds: wilderness
needs an owner too, and a settlement need not fit on one sheet. A sheet belongs to
its saved world; its region pair identifies the publication, not the physical
copy. See `src/core/paperMap.ts`, `paperMapAt` and `paperMapBounds`, and
`src/core/worldRegion.ts`, `regionIndex`.

Paper is a carried source of knowledge, not a permanent atlas unlock or a live
camera. Its terrain layer samples the baseline generation surface, including
unvisited places, rather than visited columns or mutable world blocks. Roads need
a separate public-cartography export from each generation owner, so that neither
layer shows actors, possessions, secrets or mutable damage. See
`src/core/publicCartography.ts`, `PublicCartographicFeature`, and
`src/core/site.ts`, `Site.publicCartography`. A one-cell sampling halo preserves hillshade and
contours at the cut, and shared contour levels keep neighbouring sheets aligned.
A bounded session cache deduplicates renders by world identity, region and render
configuration; it is disposable presentation work, not saved knowledge. See
`src/core/paperMapRender.ts`, `samplePaperMapTerrain` and `PaperMapRenderCache`.
The discovery policy is optional local supply without guaranteed coverage;
duplicate copies are ordinary possessions, not globally unique collectibles.
A map needs light like any paper, with no map-only exception; see `docs/readables.md`,
"Reading needs light".

Region payloads stay with ordinary item ownership so putting down a sheet removes
access without erasing its identity. Sheets do not stack: stateless merging must
not discard coverage. Saved coverage must not require visited or edited terrain,
and render caches are not durable knowledge. See `src/core/schema.ts`,
`ItemSchema`; `src/core/content.ts`, `checkItems`; `src/core/items.ts`,
`ItemFields`, `ItemFactory`, `snapshotItem` and `restoreItem`; and
`src/core/saveFormat.ts`, `itemSchema`.

## UI principles

- **HTML and CSS** over the canvas. Dense, legible, and keyboard-first, with
  the mouse also fully supported.
- The world never pauses for UI (except the F9 menu). UI should make actions
  fast: search, filters, "take all food", and repeating the last move.
- Every number the simulation uses (weight, time, condition, noise) can be seen
  somewhere in the UI, **on request**: on surfaces the player opens (inspecting an
  item, the inventory), never pushed at them during play. Depth is only fun when
  you can read it; play stays as diegetic as possible (see `INTERFACE.md`).
- **The UI only shows what your character knows.** No enemy markers, no
  minimap of zombies, no threat meter. A rest interruption says what you
  heard, not what it was. The in-game map is a paper map (#470); top-down
  renders are review tools, not UI.
- **Aim for full diegesis.** New players need the HUD to understand a voxel
  world; experienced players can turn off individual elements as diegetic
  affordances grow. See `src/ui/hudOptions.ts`, `DEFAULT_HUD_OPTIONS`. Utilities
  such as the compass and the wristwatch are items the player finds and holds
  (#183).
- **Core mods set the UI's spacing and size.** `spacing` multiplies every
  margin, padding and gap, so a value below 1 packs the UI for smaller screens;
  padding that reserves room for a label or glyph follows the text size instead.
  `hudScale` sizes the HUD and menus, so a player can leave page zoom to the
  browser and still tweak the HUD. Edge insets, such as the HUD's offset from the
  screen edge and the inventory's inset from the window, follow `hudScale`, not
  `spacing`. `src/content/base/ui.jsonnet`, the `ui`
  section, owns the values; `src/ui/uiTokens.ts`, `applyUiTokens`, installs them
  on the document root at startup, and validation requires the core entry
  (`src/core/content.ts`, `requiredContentIssues`).
- **Action text is content.** What the character says when an action is
  refused, the handling labels, interaction hints, held-item details and the
  causes the death screen names are mod content (#393, #456): a mod can reword
  or translate them without code, and wording is edited in one place rather
  than across the game's modules. Every line is required, so a missing one
  fails validation instead of showing nothing in play; a template must use
  exactly the placeholders the game fills, so a mistyped one fails validation
  too. A hint's `{key}` is drawn as the bound key's cap, so the template places
  the key without naming it. See `src/core/actionText.ts`, `ActionTextSchema`
  and `fillParts`. A reason that reports broken content or engine state
  rather than the world, such as a gun model without exported action data,
  stays in code: it is a diagnostic for the author, not the character's voice.
- **UI lengths are in rem.** The root font size is the browser's font size times
  `hudScale`, so one factor scales every rem length and the player's font
  setting still counts. Scaling through the root size, not CSS `zoom`, keeps
  client coordinates true: pointer events, `elementFromPoint` and element rects
  agree at any scale. Code that turns a rem length into pointer maths reads the
  rendered root size (`src/ui/inventoryScreen.ts`, `cellPx`).
- **What stays in px:** borders, outlines, hairlines and stripes (grid lines, the
  crosshair's bars, the splitter's line, a blocked drop's hatching), so they stay
  crisp at any scale; the gutter around a grid item, so the grid line beside it
  stays visible; shadows; the game cursor, a bitmap sprite kept at its native
  size; positions computed from viewport coordinates (the crosshair, the drag
  ghost, combo-box lists); and the world canvas, which sizes from the viewport.
- The inventory's breakpoints are viewport media queries, so they don't follow
  `hudScale`: at a large scale its columns can overflow before the window is
  narrow enough to stack them.

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
