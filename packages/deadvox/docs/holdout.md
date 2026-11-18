---
read_if:
  - you're designing or implementing Holdout's world, encounters or progression
  - you're changing Holdout's power plant, wave attention or high-ground threats
  - you're authoring Holdout PoIs or deciding what varies between runs
  - you're selecting Holdout phase questions or designing modular plant repair
  - you're implementing a P1 build slice or preparing its fixture start
  - you're authoring part condition gates, seeded failures or plant service jobs
---

# Holdout

## Design contract

Holdout is an endurance scenario about building a home worth returning to and defending.
These rules own its intended experience, not a claim that the mechanisms are implemented.
The construction playtest belongs to `SLICE-5.md`, "Settled base-building playtest rules";
the composition architecture belongs to `docs/decisions/0010-composed-sites.md`, "Decision".

## A landscape of destinations

The map is a 1 × 1 km square, with one self-contained point of interest wholly inside
each 100 m × 100 m cell. Cell containment gives every part of the map a distinct
destination without letting a large compound consume neighbouring destinations.
A PoI can be a lone shack in the woods with a rusty knife or a large construction
site with abundant materials and enemies. Small discoveries matter alongside ambitious
raids; not every destination needs to be a building complex.

Use a broadly even mix of quiet, moderate and intense sites. Contrast gives exploration
both relief and danger rather than making every supply run the same encounter.
PoIs admit their own occupants according to that mix. Local encounters do not replace
waves: the player can choose which PoIs to approach, but waves arrive regardless.

Keep the same landmark kinds across runs while varying their placement, contents and
approaches. Familiar functions reward learning; changed routes and circumstances keep
that knowledge from becoming a memorised itinerary. The unique power plant remains a
landmark rather than a random substitute for another kind of home resource.

## Supplies and progression

A rich site supplies most essentials in its speciality, not everything the player could
want. Construction sites offer building materials such as brick and planks; advanced
defences require military or laboratory access. Separating bulk essentials from advanced
specialities keeps excursions worthwhile as the home improves. Automated defences are
part of that ambition, not a reason to turn every supply site into a universal stockroom.

The unique thermal electric power plant is the home anchor. It starts broken but is
repairable, making restoration part of progression. Its fixed resource gives the player
an unusually valuable reason to build around it rather than relocate. Repaired, it
provides inexhaustible energy for increasingly ambitious electrical equipment, with
automated laser turrets an end-game example. Inexhaustible energy does not settle output
capacity or equipment requirements; content must define those without equating energy
with unlimited instantaneous output. The value of the installation, not an arbitrary home designation,
makes defending it worthwhile.

Restoration means finding or crafting a spare part and fitting it, rather than repairing
an independent plant health value. The plant reports only its housings and slotted parts.
A housing is itself a block-scale part with its own condition; see
`packages/engine/src/core/blockEntities.ts`, `BlockEntities.conditionOf`. It is not a
second condition for the assembly. Use placed housings with item slots, not vehicle-style
fittings: those would promise a movable plant despite its fixed thermal resource.
The cross-kind rule and phased adoption belong to
`docs/decisions/0011-lazy-part-state.md`, "Scope". Its lazy-state constraint keeps
inspection from making every component permanent save data.

Each output module is a separate source with content-authored required slots and
capacity, on one bus. A single-module plant uses the same mechanism; later progression
adds modules through content rather than a second repair system. Reuse
`packages/engine/src/core/sitePower.ts`, `SitePower`, for the shared bus. Do not average
part conditions into output: a pristine casing must not compensate for a ruined
controller. Modules convert energy from the shared heat source. Whether that source
caps their combined output remains open; any such ceiling belongs in content.

Each requirement has a content-authored minimum condition; omitting it means the part
stops working only at ruin. Ruin is the lowest threshold of the same predicate, not a
second gate mode, so content can choose simple survival behaviour without a hard-coded
substitute for authored gates. The gate reads stored or computed condition through
`packages/engine/src/math.ts` and writes nothing, preserving lazy part state. A part's
condition does not drop while its module runs: there is no wear by use. Plant gauges
must communicate when a part is below working condition; the parts-and-instruments
exploration owns that presentation, not the gate mechanism.

Plant service takes the parts path in `DESIGN.md`, "World repair selection": one job
removes or fits one part, lives in the piece's work slot, requires a review and explicit
Start, and supports pause and continue from the ring. Time and tool/skill requirements
are authored per part. Instant service is that same job with zero time and no tool or
skill, still with review and Start; there is no item-exchange path or separate instant
mode. Reusing the piece's work owner avoids two paths for fitting a part. Service time
is Holdout's core tension: work exposes the player during a lull before the next wave,
while per-part times keep trivial swaps from inheriting heavy maintenance costs. While
a service job is under way, its module does not run: service is a maintenance window.

Author the required initial failure, with the seed choosing among authored critical
failures, and a reachable spare or crafting route. Each non-critical part's seeded
condition range must stay above its requirement's minimum, so random condition cannot
introduce failures outside the authored set. Parts should be abundant across supply
destinations, with recipes broad enough that ordinary loot-table items probably always
permit repair. This is not a guarantee about every
random loot roll, nor permission to hide a guaranteed spare in engine code.

Destroyed housings release surviving internals into ordinary world item piles through
`packages/engine/src/core/furnitureMove.ts`, `ruinFurniture`. If drops have no room,
the piece remains standing at full damage; no contents disappear. This follows
`DESIGN.md`, "Vehicles", where surviving detached parts remain world items. Do not
introduce a wreck owner beside piles or ruin pristine internals merely because the
housing failed: both would replace a shared, understandable consequence with a second
rule.

## Waves and attention

The plant anchors both the player's investment and wave attraction. Waves remain the
forcing function because they come regardless of optional PoI fights, and the plant
draws them. Arrival and attention are distinct: going quiet stops fresh attention, not
the arrival of groups. Already-alerted groups continue toward the last-known spot.
This lets quiet operation matter without erasing a threat that has already noticed its
target. The plant's detectable emissions must make that cause understandable in the
world. Far noise is required alongside near noise: imprecise perception over long
ranges lets distant activity draw attention without revealing an exact target. World
noise sources need their own loudness, rather than treating all noise as the player's
signature. Extend the perception tiers in `packages/engine/src/core/agentPerception.ts`,
`hearingTier` and `farBearingTarget`. How plant output affects its noise, and how waves
outside hearing range retain a target, remain P2 choices.

Do not confuse this target contract with arrival placement. See
`packages/engine/src/core/eventRules.ts`, `advanceEventRules`, for event execution, and
`packages/engine/src/core/composeLayout.ts`, `composeLayout`, for compiled arrival anchors.

## Contested height

Big verticality must create playable routes and positions, not just tall scenery.
High ground is not very safe against specialised enemies: Brutes break constructions,
while leapers and climbers gain access by other means. Height changes how the
player defends a position rather than granting immunity to pressure. Construction
breaking and alternative access are distinct capabilities; neither implies attacks
through intact floors or damage unrelated to physical reach.

## Phase decisions

Card only the active phase's choices. Earlier play can reshape later questions, so
an up-front card queue for every phase would prematurely constrain the design. P1
restores the plant; P2 turns that investment into a defence loop.

P10's fliers are parked: flying actors need real three-dimensional movement, the
largest cost for the smallest part of the vision. Revisit after P6–P9 establish whether
height is contested enough without flight. This keeps the high-ground goal without
committing to an unnecessary movement system.

Plant UI design waits for the separate parts-and-instruments exploration. Do not card
or brief it before that exploration lands: its gauges must reflect real simulated state,
not constrain that state to an invented display.

## P1 build specification

This is implementation intent, not implemented behaviour. The playable exit is:
discover the broken plant, obtain a required spare through loot or crafting, fit it,
power an ordinary bus consumer, and reload with the repair intact. Waves, noise,
automated weapons, gun/vehicle conversion and difference-only column supplies are out.
Plant UI remains blocked by the parts-and-instruments exploration under
`holdout.md`, "Phase decisions"; core slices may proceed, but no coder may invent a temporary plant
screen to call P1 playable. Gates and service follow the settled rules in
`holdout.md`, "Supplies and progression"; the shared heat-source ceiling remains a later
question. P1 must not invent a cap or claim unlimited combined capacity as a permanent rule.

### Slice A: lazy housing slots and transfer ownership

Extend `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`, at its
parts-blueprint boundary, and `packages/engine/src/core/content.ts`, `referenceIssues`,
for validated blueprint, slot compatibility and initial-state content. Extend
`packages/engine/src/core/blockEntities.ts`,
`BlockEntities`, to own housing slots, rather than storing them in unrelated pockets.
Reuse `packages/engine/src/core/items.ts`, `ItemFields`, `snapshotItem` and `restoreItem`,
for changed child items, and extend `packages/engine/src/core/inventory.ts`, `Inventory`,
for their traversal and transfer. `Inventory.fitSlot` accepts an item owner, not a
housing; it is a transfer precedent, not a ready furniture adapter.

Provide a deeply readonly baseline view and an owner-only sparse override path:
no override means baseline, explicit absence means removed, and a changed item keeps
its identity and condition. Derive baseline variation from world seed, stable authored
assembly identity and slot path, not allocated item UID or observation order. Use
`packages/engine/src/math.ts` for deterministic computation. Admit destinations before
materialising, then publish in canonical event/slot order. Refusals allocate nothing.
Do not erase an override merely because its condition equals the baseline. Wire saves
through `packages/engine/src/core/saveState.ts`, `snapshotSession`, and
`packages/engine/src/game/session.ts`, `createSession`. Reuse the planning/publication
discipline of `packages/engine/src/core/columnSupply.ts`, `createColumnSupply`, without
converting its storage or building a speculative universal entity framework.

Tests earn their place by checking that different read orders leave snapshots and next
item identity unchanged; removal survives reload without regeneration; a refused fit
changes neither owner; and an accepted transfer leaves exactly one owner. Use fixture
parts, not production IDs or seeded numeric outputs. Mutation proof: make a read publish
one baseline item and show the read-purity test fails.

BR fixture: a start-kit fixture beside fixed housings with a compatible spare, an
incompatible item and a full destination. It must support the inspection/transfer/reload
check through the approved interaction surface once available. No such surface is
approved, so the fixture claims no playable look and its evidence is core evidence; see
`packages/deadvox/mods/skelly.deadvox.scenario.test-house.housing-slots-look/README.md`, "Housing-slot look",
and `docs/PROCESS.md`, "Reviews by eye and by play".

### Slice B: part-gated module sources

After Slice A, extend
`packages/engine/src/core/powerContent.ts`, `PowerDeviceSchema`, with an inexhaustible
source whose capacity is content, not fictitious generator fuel. Extend
`packages/engine/src/core/power.ts`, `PowerNetwork` and `production`, rather than adding
a plant solver. Bind each module's requirements through
`packages/engine/src/core/sitePower.ts`, `SitePower`, including `control` admission.
Keep switch intent separate from derived availability: an enabled broken module need
not produce. Settle power at the action timestamp before changing parts or housing
availability, including entering or leaving service, so a repair cannot supply an earlier
interval and a maintenance window cannot produce power. Do not save a second
readiness or plant-condition field.

Use a pure required-part predicate over Slice A's readonly view. Its failure causes
must distinguish absent, incompatible and insufficient-condition parts. Compare each
requirement's content-authored minimum, with omission meaning failure only at ruin,
through the same predicate. Reads must not materialise parts or change condition;
operation causes no wear. Validate non-critical seeded condition ranges against their
minimums so the authored critical-failure set remains exhaustive. Derive maintenance
unavailability from the piece's service job, not a separately saved module flag.
`packages/engine/src/core/lights.ts`, `chargeOf` and `toggleLight`, provide a fitted
resource precedent, not a general condition gate; charge and condition stay distinct.
Housing requirements must be explicit content dependencies, not averages. A heat-source
ceiling is outside this slice pending its later ruling, not implicitly rejected.

Extend `packages/deadvox/test/sitePower.test.ts` and `packages/deadvox/test/power.test.ts`
with fixture modules: failing one requirement disables only dependent production;
several sources supply the shared bus within their capacities; omitted and authored
minimums use the same condition gate without read-side writes or running wear; reload
and split-at-repair advancement agree. Check that service suppresses only the serviced
module and settles power at maintenance boundaries. Do not duplicate existing bus-priority
cases. Mutation proof: change a gate before settling the previous interval and demonstrate
the boundary test fails.

BR fixture: extend the same start with independently repairable modules and an ordinary
visible powered consumer, plus spares at hand. The check is failed module versus working
module, then additional supply after fitting, then reload; no waves or waiting for loot.

### Slice C: destruction preserves parts

After A and B, extend `packages/engine/src/core/furnitureMove.ts`, `planRuin` and
`commitRuin`, beneath `ruinFurniture`, so lazy slot contents participate in the existing
whole-plan pile admission. Reuse `packages/engine/src/core/inventory.ts`, `Inventory`,
for real-item lookup and landing; materialise surviving baseline parts only after an
admitted destruction event. Include them in the same reservations as pockets, escrow
and debris, not a second post-destruction drop pass. Extend
`packages/engine/src/core/sitePower.ts`, `SitePower.beforeRemove`, and the existing
relocation hook in `packages/engine/src/game/session.ts`, `createSession`, for power
settlement. A housing retained by blocked drops is still failed, not a live source.

Extend `packages/deadvox/test/furnitureRuin.test.ts`: admitted destruction conserves
part identity and condition in piles across reload; blocked destruction preserves the
standing failed housing and its slots without allocating baseline items. Existing
pocket/debris cases remain the owners of their coverage. Mutation proof: materialise
before admission and show the blocked-destruction case detects the write.

BR fixture: adjacent open and fully blocked drop arrangements, containing healthy
internals in damaged housings, with the means to deliver the final hit. The look checks
recoverable piles versus a retained full-damage piece and no continued generation.
Do not require manual construction of the blocked arrangement.

### Slice D: authored restoration loop

After A–C and the UI exploration, author the required failure,
spares and recipes through content; compose the plant and reachable supply destination
through `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.
Use `packages/engine/src/core/craftCommands.ts`, `CraftCommands`, and its
`takeApartEntity` boundary for a parts-path job in the piece's work slot, not a separate
plant repair command or item exchange. Extend the shared review and explicit Start,
pause and ring-based continue flow; zero-time work follows it too. Content authors time
and tool/skill requirements per part. Connect job lifecycle to Slice B's maintenance
unavailability and timestamp settlement. UI integration must follow the exploration's
owner/spec rather than be designed here. Do not implement a full-map viability solver or guaranteed
random loot result to strengthen the authored-route ruling.

Validate blueprint references, compatible spares, recipe inputs and power definitions
through `packages/engine/src/core/content.ts`, `referenceIssues`, including rejection of
non-critical seeded condition ranges that can cross their requirement's minimum. One
focused integration test must traverse the fixture's obtain/review/Start/fit/power/reload
loop through public command owners, including paused service and ring-based continue.
Cover zero-time service through the same review/Start contract, not an exchange shortcut.
Extend an existing browser smoke flow for the approved interaction, rather than adding
a stage for each slot. Whole-world route sweeps remain on demand under the
repository test policy; do not assert production counts or exact layouts.

BR fixture: build on `tools/jsonnet/lib/start-kit.libsonnet`, `fixture`, with the player
beside the failed module, the nearby supply route ready, crafting inputs/tools available,
and a visible consumer wired. Include timed and zero-time service parts, so BR can check
review/Start, pause/continue and the maintenance outage without setup. Provide both the
short mechanical check and the authored supply-route check without waiting for random drops. Final P1 acceptance requires
the playable route and save/reload, not just a debug power toggle.

## Content ownership

Placement, site mix, loot, repair requirements, power and equipment values, wave pacing
and enemy capabilities belong in content. Code supplies the validated mechanisms rather
than selecting behaviour by Holdout-specific IDs; see `PILLARS.md`, "Content forward compatibility".
For the scenario and wave authoring boundaries, see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`, and
`mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
