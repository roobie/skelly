---
read_if:
  - you're designing or implementing Holdout's world, encounters or progression
  - you're changing Holdout's power plant, wave attention or high-ground threats
  - you're authoring Holdout PoIs or deciding what varies between runs
  - you're selecting Holdout phase questions or designing modular plant repair
  - you're implementing a P1 build slice or preparing its fixture start
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

Author the required initial failure and a reachable spare or crafting route. Parts
should be abundant across supply destinations, with recipes broad enough that ordinary
loot-table items probably always permit repair. This is not a guarantee about every
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
screen to call P1 playable. Resolve the questions below before their dependent slice.

### Slice A: lazy housing slots and transfer ownership

Extend `packages/engine/src/core/schema/furniture.ts`, `FurnitureSchema`, at its
parts-blueprint boundary, and `packages/engine/src/core/content.ts`, `referenceIssues`,
for validated blueprint, slot compatibility and initial-state content. The schema's
parts route is not an existing runtime. Extend `packages/engine/src/core/blockEntities.ts`,
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
check through the approved interaction surface once available; until then record core
evidence without claiming a playable look. See `docs/PROCESS.md`, "Reviews by eye and by play".

### Slice B: part-gated module sources

After Slice A and the function-gate answer, extend
`packages/engine/src/core/powerContent.ts`, `PowerDeviceSchema`, with an inexhaustible
source whose capacity is content, not fictitious generator fuel. Extend
`packages/engine/src/core/power.ts`, `PowerNetwork` and `production`, rather than adding
a plant solver. Bind each module's requirements through
`packages/engine/src/core/sitePower.ts`, `SitePower`, including `control` admission.
Keep switch intent separate from derived availability: an enabled broken module need
not produce. Settle power at the action timestamp before changing parts or housing
availability, so a repair cannot supply an earlier interval. Do not save a second
readiness or plant-condition field.

Use a pure required-part predicate over Slice A's readonly view. Its failure causes
must distinguish absent, incompatible and insufficient-condition parts.
`packages/engine/src/core/lights.ts`, `chargeOf` and `toggleLight`, provide a fitted
resource precedent, not a general condition gate; charge and condition stay distinct.
Housing requirements must be explicit content dependencies, not averages. A heat-source
ceiling is outside this slice pending its later ruling, not implicitly rejected.

Extend `packages/deadvox/test/sitePower.test.ts` and `packages/deadvox/test/power.test.ts`
with fixture modules: failing one requirement disables only dependent production;
several sources supply the shared bus within their capacities; reload and split-at-repair
advancement agree. Do not duplicate existing bus-priority cases. Mutation proof: change
a gate before settling the previous interval and demonstrate the boundary test fails.

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

After A–C, the service-work answer and the UI exploration, author the required failure,
spares and recipes through content; compose the plant and reachable supply destination
through `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.
Use `packages/engine/src/core/craftCommands.ts`, `CraftCommands`, and its
`takeApartEntity` boundary for part work according to the answer below, not a separate
plant repair command. UI integration must follow the exploration's owner/spec rather
than be designed here. Do not implement a full-map viability solver or guaranteed
random loot result to strengthen the authored-route ruling.

Validate blueprint references, compatible spares, recipe inputs and power definitions
through `packages/engine/src/core/content.ts`, `referenceIssues`. One focused integration
test must traverse the fixture's obtain/fit/power/reload loop through public command
owners. Extend an existing browser smoke flow for the approved interaction, rather than
adding a stage for each slot. Whole-world route sweeps remain on demand under the
repository test policy; do not assert production counts or exact layouts.

BR fixture: build on `tools/jsonnet/lib/start-kit.libsonnet`, `fixture`, with the player
beside the failed module, the nearby supply route ready, crafting inputs/tools available,
and a visible consumer wired. Provide both the short mechanical check and the authored
supply-route check without making BR wait for random drops. Final P1 acceptance requires
the playable route and save/reload, not just a debug power toggle.

### Remaining P1 questions

These are questions, not authorisation to choose an option. Grades use
`GLOSSARY.md`, "Tech debt": future maintenance from a shortcut, not build effort.
Negative space names omitted behaviour; WTF grades player and maintainer surprise
separately. Tunable values stay in content after the behavioural choice.

**Function gate — when does a present, damaged required part stop its module?**
Owner check: `BlockEntities.conditionOf` supplies housing condition; `chargeOf` checks
a fitted energy resource; neither chooses a generic functional condition threshold.

- **A: only at ruin/absence**, with compatibility also required. Debt: low if intended,
  high if hard-coded as a temporary substitute for authored gates. Negative space:
  no early functional failure from wear. WTF: player low for simple survival, medium
  for a nearly broken controller working perfectly; maintainer low with explicit content.
- **B: content-authored minimum condition per requirement**, including housing requirements.
  Debt: low with the shared pure predicate. Negative space: no continuous efficiency
  or stochastic failure. WTF: player medium unless instruments explain the threshold;
  maintainer low because each requirement declares its own gate.

This question selects the gate, not the rejected condition-average output model.
It blocks B's gameplay contract, not A's storage work.

**Service work — what does fitting/removing a plant internal demand?**
Owner check: `packages/engine/src/core/lights.ts`, `swapBattery`, owns an immediate
item exchange precedent; `CraftCommands.takeApartEntity` and
`packages/engine/src/core/longAction.ts`, `LongActions`, own world work, but the furniture
parts-blueprint route has no runtime. `DESIGN.md`, "World repair selection", already
requires a part job and a shared review; neither option may bypass those boundaries.

- **A: a part job with no tool/skill prerequisite and immediate completion.** Debt: low
  if a supported job mode, high if a one-off inventory shortcut bypasses world work.
  Negative space: no service-time exposure or tool progression. WTF: player low for a
  plug-in controller, medium for heavy internals; maintainer low through the shared owner.
- **B: content-authored time and tool/skill requirements through world work.** Debt: low;
  building the missing adapter is effort, not debt. Negative space: no bespoke wiring
  minigame. WTF: player low for mechanical work, medium if every trivial swap is lengthy;
  maintainer low with existing cancellation and target revalidation.

This blocks D's service contract. It does not reopen the UI hold or mandate new UI cards.
The shared heat-source ceiling remains a later question; P1 must not settle it by
inventing a cap or claiming unlimited combined capacity as a permanent rule.

## Content ownership

Placement, site mix, loot, repair requirements, power and equipment values, wave pacing
and enemy capabilities belong in content. Code supplies the validated mechanisms rather
than selecting behaviour by Holdout-specific IDs; see `PILLARS.md`, "Content forward compatibility".
For the scenario and wave authoring boundaries, see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`, and
`mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
