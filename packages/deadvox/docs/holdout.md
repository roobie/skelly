---
read_if:
  - you're designing or implementing Holdout's world, encounters or progression
  - you're changing Holdout's power plant, wave attention or high-ground threats
  - you're authoring Holdout PoIs or deciding what varies between runs
  - you're selecting Holdout phase questions or designing modular plant repair
  - you're implementing a P1 build slice or preparing its fixture start
  - you're authoring part condition gates, seeded failures or plant service jobs
  - you're building or authoring plant instruments, such as the RUN lamp, module dial, slot fault flags or fault labels
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
caps their combined output remains open; any such ceiling belongs in content. Temperature will become part of the plant's simulation, so no mechanism may assume it never will: the heat source stays a quantity a later phase can model, not a constant built into code.

Each requirement has a content-authored minimum condition; omitting it means the part
stops working only at ruin. Ruin is the lowest threshold of the same predicate, not a
second gate mode, so content can choose simple survival behaviour without a hard-coded
substitute for authored gates. The gate reads stored or computed condition through
`packages/engine/src/math.ts` and writes nothing, preserving lazy part state. A part's
condition does not drop while its module runs: there is no wear by use. The plant's
instruments show a part below working condition by reading this gate, not by owning it;
see `holdout.md`, "Plant instruments".

Plant service takes the parts path in `DESIGN.md`, "World repair selection": one job
removes or fits one part, lives in the piece's work slot, requires a review and explicit
Start, and supports pause and continue from the ring. Time and tool/skill requirements
are authored per part. Instant service is that same job with zero time and no tool or
skill, still with review and Start; there is no item-exchange path or separate instant
mode, and it is done at Start, so it never shows a running job its review called
instant. Reusing the piece's work owner avoids two paths for fitting a part. Service time
is Holdout's core tension: work exposes the player during a lull before the next wave,
while per-part times keep trivial swaps from inheriting heavy maintenance costs. While
a service job is under way, its module does not run: service is a maintenance window.

A fit's review lists each fitting spare the player can reach as its own row, with its
condition and where it is, and the picked spare is the one the job escrows and fits.
An automatically chosen spare hid which part went in, so a part just removed to the feet
stayed there while another went in, and looked duplicated. See
`packages/engine/src/core/craftCommands.ts`, `CraftCommands.partServiceOptions`.

The spare a fit takes may be held in hand at Start, which takes it from the hand; any
other held item still refuses the job for full hands. A player naturally picks up the
spare and then works on the piece, so refusing because the hand holds the very part to
be fitted is a false refusal. See `packages/engine/src/core/inventory.ts`,
`Inventory.handsFreeBut`.

Each blueprint slot carries its own name, while position and socket art belong to
optional slot anchors on the housing, so a modded housing without anchors still
lists named slots. Anchors are all or nothing: a set that misses, repeats or
invents a slot is a content error, not a quiet list-only fallback. Socket art
reuses furniture shape boxes, so art keyed to the part kind and uniform art are
both content choices with no code. Socket art is optional: an anchored slot
without it gets a default marking of its pick region, because an empty vehicle
site has no part and no authored art, so the default must work with no content
and keyed art is optional content on top. See
`packages/presentation/src/render/slotSockets.ts`, `siteMarks`. On an anchored housing each slot's fault flag
stands on its anchor's mount. The Work on picture shows the world's own
instruments with the piece, because a second dial drawn only for the UI would
be debt. See `packages/engine/src/core/housing.ts`, `housingContentIssues`, and
`packages/presentation/src/render/plantInstruments.ts`, `PlantInstruments.depicted`.

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
ranges lets distant activity draw attention without revealing an exact target.

Hordes hear a list of world sources, the player's own sound among them, through the one
set of perception tiers. A plant that sounds all the time has no place in a model where
hordes hear only the player's latest one-off noise, and a second hearing path would let
the two disagree. See `packages/engine/src/core/agentPerception.ts`, `soundTier` and
`farBearingTarget`.

Each producing module makes its own authored loudness, a synthesized hum, whatever its
output, so the plant's noise follows the modules the player runs: more modules, more
sources, and a module that stops producing falls silent at once. A running module's
output never varies, so deriving loudness from it would compute one constant from
another; authoring it on the module is the honest model with one value. See
`packages/engine/src/core/sitePower.ts`, `SitePower.sounds`.

Only hearing gives a wave a plant target. A heard target is kept through silence until
the group reaches it, and hearing the same source near again refines it; at the target
with nothing new, the group roams as usual. This fits the horde's existing target and
mode. A target that outlived the hearing would need a hearing owner from before release,
which does not exist, and a separate uncertainty state is not needed yet. Far hearing
does not point at the plant: it sets a waypoint a fixed distance along a noisy bearing,
so a far wave walks that stretch and must hear the plant again to close in. A quiet
plant therefore loses distant waves and a running one pulls them in step by step, which
is how going quiet matters without an extra rule.

A wave keeps its target unless a surer sound arrives: a near sound replaces a far
target, and another far sound does not divert it. So a far gunshot on a supply run does
not pull a wave already committed to the plant. Surer means the near or far tier, so the
rule needs no loudness strength the tiers do not produce. A group following nothing
picks among what it hears by the same rule. See
`packages/engine/src/core/agentHorde.ts`, `AgentHorde.updateHordes`; and
`packages/engine/src/core/agentPerception.ts`, `surerHearing`.

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

Plant instruments reflect real simulated state rather than constrain that state to an
invented display; see `holdout.md`, "Plant instruments".

## P1 build specification

This is implementation intent, not implemented behaviour. The playable exit is:
discover the broken plant, obtain a required spare through loot or crafting, fit it,
power an ordinary bus consumer, and reload with the repair intact. Waves, noise,
automated weapons, gun/vehicle conversion and difference-only column supplies are out.
The plant's instruments follow `holdout.md`, "Plant instruments"; no coder may invent a
temporary plant screen to call P1 playable. Gates and service follow the settled rules in
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

A ruined housing's parts fall with it: `packages/engine/src/core/furnitureMove.ts`,
`planRuin` and `commitRuin`, beneath `ruinFurniture`, admit its slot contents in the same
whole-plan pile reservations as pockets, escrow and debris, not a second
post-destruction drop pass, so a ruin either keeps every part or stands. Fitted parts keep
their items; untouched baseline parts materialise only once the destruction is admitted,
so a refused ruin allocates nothing. The blow that ruins a housing settles power before it,
like any parts change (`packages/engine/src/core/sitePower.ts`, `SitePower.aroundChange`),
and a housing retained by blocked drops is failed, not a live source. Lifting, setting down,
sliding, dropping, removing or destroying a module housing is a parts change too: power
settles before it and rebalances at its timestamp, so a housing off its placement stops
producing at once while its switch intent stays as it was; see
`packages/engine/src/core/sitePower.ts`, `SitePower.beforeRemove`.

Extend `packages/deadvox/test/furnitureRuin.test.ts`: admitted destruction conserves
part identity and condition in piles across reload; blocked destruction preserves the
standing failed housing and its slots without allocating baseline items. Existing
pocket/debris cases remain the owners of their coverage. Mutation proof: materialise
before admission and show the blocked-destruction case detects the write.

BR fixture: adjacent open and fully blocked drop arrangements, containing healthy
internals in damaged housings, with the means to deliver the final hit. The look checks
recoverable piles versus a retained full-damage piece and no continued generation.
Do not require manual construction of the blocked arrangement.

### Plant instruments

World-mounted instruments make plant state discoverable without a temporary plant screen.
Each housing needs its own reading because a fault in one module is not a fault in every
source on the pooled bus. The period industrial look makes the housing read as maintainable
machinery; its enamel, brass, ivory and incandescent treatment belongs in
`packages/mods/skelly.electric-power/plant-instruments.libsonnet`, `panel` and `run`.

RUN and the dial's stopped position deliberately repeat one production truth: the emitting
lens works in darkness and at distance, while the incident-lit dial serves close inspection.
A renderer must not rebuild that truth from switches, fuel or parts, because a second
predicate could disagree with the simulation. See `packages/engine/src/core/power.ts`,
`production`, and `packages/engine/src/core/sitePower.ts`, `SitePower.instruments`.

Condition margin is useful where per-module delivered power is not: supply is pooled, sources
do not follow load, and condition does not derate output. The weakest required part matters;
averaging could hide it behind a pristine casing. Sharing `packages/engine/src/core/items.ts`,
`conditionBand`, with the item blips avoids a second damage vocabulary. The power owner supplies
the reduction so inspection stays lazy and the renderer owns no part policy. Replacements
better than the repair ceiling remain valuable; see `packages/engine/src/core/items.ts`,
`repairCeiling`.

Calibration and mounting must remain content choices, not renderer constants. Shared band
colours connect the dial to item blips, while tick position carries the reading without colour.
Decorative sway supplies the period feel without claiming fluctuating output or wear; crossing
a detent would falsely report a different condition. An empty required set has no weakest
part, so admission rejects it instead of inventing a producing reading. See
`packages/engine/src/core/schema/plantInstruments.ts`, `PlantInstrumentsSchema`, and
`packages/engine/src/core/plantInstruments.ts`, `plantInstrumentIssues`.

Mechanical flags remain meaningful on a dead bus. A powered fault lamp would go dark exactly
when diagnosis matters; a self-powered fault lens would introduce another emission rule.
Flags therefore need incident light and report slot failures, not shell damage. A retained
ruined housing may contain healthy parts. See `packages/engine/src/core/housing.ts`,
`requirementFailures`, and `packages/engine/src/core/sitePower.ts`, `SitePower.lights`.

A housing whose instruments carry a power switch is switched only at that switch, never by a
use anywhere on its body. The control is diegetic: the switch is the thing the player operates,
so aiming at it is the act of switching, and its lever pose shows the switch intent the player
set, which RUN alone cannot show when the source stops for parts. Housings without a switch keep
their use-anywhere control. The switch is picked by its own boxes as windows and doors pick
their panels, and only where the housing's drawn casing does not hide it. A switch can stand
inside the housing's own cells, so its cells cannot tell a use at the switch's face from one
through the housing, and a hidden switch must not be worked through its casing. See
`packages/engine/src/core/furniturePick.ts`, `switchDistance`, and
`packages/engine/src/core/sitePower.ts`, `SitePower.controlAt`.

Fault wording names the operational consequence rather than an invented damage threshold.
Unsuitability must not imply that a successfully fitted part could not fit its slot. Detail
exposes an authored minimum through hover or keyboard focus; omission must not turn the
comparison fallback into a claimed content value. Text belongs in
`packages/mods/skelly.ui/ui-screen-text.libsonnet`, `housingFault`, and its projection in
`packages/presentation/src/ui/housingFaults.ts`, `housingFaults`, under `INTERFACE.md`, "Text".
Service review must not repeat condition words already seen on the selected card; its
accessible blip follows `INTERFACE.md`, "Condition".

A bus load-versus-production instrument remains separate polish, not an upgrade that replaces
the module's condition dial. Visual acceptance uses the isolated starts in
`mods/skelly.deadvox.scenario.test-house.plant-instruments-look/README.md`, "Plant-instrument look",
so BR judges mounting and readability without completing the restoration loop.

### Slice D: authored restoration loop

After A–C, author the required failure,
spares and recipes through content; compose the plant and reachable supply destination
through `mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`.
Use `packages/engine/src/core/craftCommands.ts`, `CraftCommands`, and its
`takeApartEntity` boundary for a parts-path job in the piece's work slot, not a separate
plant repair command or item exchange. Extend the shared review and explicit Start,
pause and ring-based continue flow; zero-time work follows it too. Content authors time
and tool/skill requirements per part. Connect job lifecycle to Slice B's maintenance
unavailability and timestamp settlement.
Instruments follow `holdout.md`, "Plant instruments". Do not implement a full-map viability solver or guaranteed
random loot result to strengthen the authored-route ruling.

The Holdout start grants the skill the plant's part service asks for; see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `start`. Without it the
player could neither service the governor nor learn its spare's recipe, so a governor
failure would leave the plant unrepairable from the start.

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
and a visible consumer wired. Include timed service parts, so BR can check review/Start,
pause/continue and the maintenance outage without setup. Provide both the
short mechanical check and the authored supply-route check without waiting for random drops. Final P1 acceptance requires
the playable route and save/reload, not just a debug power toggle.

## Content ownership

Placement, site mix, loot, repair requirements, power and equipment values, wave pacing
and enemy capabilities belong in content. Code supplies the validated mechanisms rather
than selecting behaviour by Holdout-specific IDs; see `PILLARS.md`, "Content forward compatibility".
For the scenario and wave authoring boundaries, see
`mods/skelly.deadvox.scenario.holdout/holdout-site.libsonnet`, `scenario`, and
`mods/skelly.deadvox.scenario.holdout/waves.libsonnet`, `rules`.
