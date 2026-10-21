---
read_if:
  - you're planning vehicle implementation, authoring or the Wheels playtest
  - you're resolving the vehicle choices on issue 322
  - you're integrating vehicle state with items, saves, collision or region simulation
---

# Slice 6 — Wheels

**Status: proposed.** This is a decision-ready plan, not approval to implement its
open choices. #322 owns those choices. The approved goal remains
`DESIGN.md`, "Vehicles"; the slice sequence remains `EPIC.md`, "How each slice runs".
Accepting this document does not answer the questions below.

## The smallest useful loop

The proposed first playable loop is to find an incomplete vehicle, inspect why it
cannot run, salvage a compatible part from another wreck, fit it with tools, fuel
and start it, carry loot to another stop, suffer a consequential collision, and
choose between repair, stripping weight and abandoning the vehicle. Save and return
to the same build. This tests whether mobility and carrying capacity justify the
noise, supplies and exposed work, rather than merely whether a car can move.

Use the hatchback and pickup for the first complete loop, with genuinely shared
service parts and one freely placed capability-matched add-on. Two hosts expose
accidental blueprint-specific restrictions; the add-on exposes a disguised fixed
socket system. Factory structures remain the starting points pending #322 Q1–Q2.
The proposed content scope needs BR's approval before authoring begins.

The world needs salvageable wrecks and a convoy remnant, fuel and tools within
reach of the loop, a workshop for heavy work, cargo worth transporting, enemies
that respond to engine noise, and a route with a meaningful dismount. Wrecks are
vehicle instances with missing and damaged parts, not searchable furniture with a
second future identity. Loose loot beside a wreck stays loose. Cargo belongs to
fitted storage parts, never to an invisible vehicle-wide inventory.

A bounded authored route can prove the loop before regional integration, but does
not complete the slice. Slice 4b's drivable surfaces and region map remain release
dependencies. A route must be traversable by the actual vehicle footprint and
clearance, not merely connected on a road graph. A blockage passable on foot but
not by car makes parking and dismounting meaningful without sealing the whole map.

## Playtest questions and exit

Can players diagnose a non-running build, find a compatible part and finish the
repair without outside instructions? Does altered mass placement change a driving
choice rather than just a statistic? Does cargo capacity justify a noisy arrival?
Does an impact create a repair, stripping or abandonment decision rather than a
routine reset? Can players recognise when a route requires leaving the car?

The slice is complete only when the loop works in the region, persistence and
cross-browser replay hold, the declared performance budget holds, the playtest in
`EPIC.md`, "How each slice runs", is evaluated, and BR accepts handling, access and
interior visibility. A passing debug route or export tool is not that exit.

## Boundaries worth keeping

### Things, not a second item universe

A removed vehicle part remains the same item: condition, finish, charge, liquid and
contents must survive fitting and removal. Fitting adds placement, supports and
joint state; it must not create another independently mutable copy of the item.
Vehicle membership and ordinary inventory ownership are exclusive. A failed or
interrupted transfer must not duplicate the part or consume it without a destination.

VAT assembles things; the thing tool authors their shapes. Do not revive a second
vehicle material or mass authority. The neutral export boundary is
`packages/thing-core/src/schema.ts`, `NeutralModelSchema`; the reasons for keeping
geometry out of Deadvox are in `things/WORK.md`, "Decisions". Vehicle-specific
capabilities and gameplay requirements belong to validated game content, not the
neutral core. The proposed VAT export carries baked collision geometry beside
render geometry so simulation never reconstructs authoring shapes. #322 Q6 must
settle this remaining export decision before more parts are authored.

The spike's `src/vehicles/model.ts`, `PartType`, `Fitting` and `VehicleInstance`,
are useful concepts, not a production schema to preserve. In particular, do not
carry the spike's mass field and geometric-centroid calculation forward as a
competing authority to exported per-part mass and centre of mass. Attached cargo,
fuel and occupants also contribute to the moving assembly's mass distribution.

### Fitting is not just geometry

Keep attachment legality, structural support, work requirements and functional
capability separate. Contact can suggest supports but cannot choose the structural
contract: touching two surfaces does not mean both hold the part up. See
`src/vehicles/model.ts`, `supportProblems`, `addFitting` and `removeFitting`.

Install, remove and repair are distinct activities. Cutting a weld is not welding
in reverse. Use the existing long-action and crafting ownership boundaries rather
than building a vehicle job scheduler; see `src/core/craftWork.ts`,
`craftActionHooks`. Vehicle jobs need a world-target adapter because an installed
part is not an ordinary inventory repair target. Revalidate reach, supports,
resources and destination on completion. Do not call the spike mutators directly
from a UI or let cancellation create a second fitting.

Structural completeness and ability to run are different questions. Inspection
must distinguish missing support, unusable drive, steering, fuel and charge without
pretending that a finished silhouette means a running car. Player-visible details
belong on the opened inspection surface under `INTERFACE.md`, "Text"; exact words
and control bindings are not settled here.

### One build, several consumers

Fitted parts and their poses own both appearance and obstruction. Keep parked
world collision and picking derived, not hand-authored per wreck. See
`src/vehicles/solid.ts`, `solidBlocks`, and `src/core/blockEntities.ts`,
`BlockEntities.hasPartAt`. The existing filled-column approach is an exterior
obstruction approximation, not an enterable-cabin or transparent-window model.
Doors and glass must not inherit that approximation accidentally.

A moving body needs swept collision and a defined handoff to parked occupancy.
Both representations must derive from the same build and pose; neither may leave
stale blocking cells or permit parking through a wall or actor. Changes must reach
movement, navigation, picking, sight, sound and light together. #322's access and
glass decisions gate this integration. #1016 gates a usable interior view; fixing
building lighting does not satisfy it.

The driving proposal is arcade handling with meaningful mass placement, steering
and driven-axle choices, not identical handling behind different meshes. Fuel and
electricity retain the approved pools rather than gaining cable and pipe graphs.
Rapier remains a candidate, not a selected dependency. Compare it with a bounded
project-owned solver before selecting an implementation; the existing
`src/core/rigidBody.ts`, `RigidBody` and `stepRigidBody`, is a contact/impulse seam,
not evidence that car suspension, tunnelling or deterministic replay is solved.

Do not import the external research's always-real-time policy: Deadvox owns pause
and compression. Driving uses simulation time and bounded steps, not render frame
time. A physics choice must satisfy
`docs/decisions/0008-deterministic-world.md`, "Decision", including cross-browser
agreement and position-driven residency. A WASM physics library does not establish
that contract by itself. A failed deterministic prototype stops physics selection;
it does not silently weaken the contract.

## What must survive a save

Persist authoritative instance identity, build membership and placement, supports
and joint state, part condition and appearance, door state, storage contents,
resource amounts, vehicle pose and motion, occupants, and any resumable work.
These are intended state obligations, not a parallel field schema. Extend the
owning types and `src/core/saveState.ts`, `SaveSnapshot`, as each obligation lands.
Derived mass, capabilities, geometry caches and world occupancy are rebuilt from
that truth, never restored as independent editable totals.

Saving in motion and during work must be equivalent to continuing without a load;
parking is not permission to erase momentum at save time. Settled parked vehicles
need no continuous rigid-body work. Region departure cannot freeze a coasting or
running vehicle merely because a render column unloaded: its canonical coarse
behaviour must be decided and tested before regional release. No new save migration
promise is introduced; see `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility".

## Decisions before dependent work

Each question has a separate decision card in d541-1's report. Recommendations are
proposals only. Record BR's chosen rule and reason in the owner before building it.

- **Scope:** approve the two-host salvage/drive/repair loop and delay the bike, or
  require the full vehicle roster before the first Wheels playtest.
- **#322 Q1:** compatible-part building first or scratch-built structures immediately.
- **#322 Q2:** welded assemblies as player-facing units or individually removable
  structure; do not confuse player interaction grain with simulation grain.
- **#322 Q3:** separate appearance weathering from functional condition; independently
  decide whether functional wear is event-driven only.
- **#322 Q4:** one condition vocabulary for fitted and loose items or distinct displays.
- **#322 Q5:** unhanded parts or separately authored left/right items.
- **#322 Q6:** confirm the VAT/thing-tool export boundary for runtime part shapes.
- **#322 Q7:** which lifting and transport affordances make heavy salvage possible.
- **Driving:** constrain the first handling envelope to road-going arcade vehicles or
  require full rollover, flight and recovery in the first playable loop.
- **Damage:** keep broken structure attached initially or permit impact detachment and
  structural cascades immediately. Whole-part damage versus voxel erosion is separate.
- **Access:** seated driving with animated entry doors or freely walking through cabins.
- **Glass:** material-specific sight/light transmission or opaque cabin simulation.
- **Cargo:** start with a useful cargo fitting or require the whole compartment vocabulary.
- **Unattended vehicles:** require safe stopping before the player leaves the vehicle,
  or include unattended movement and its coarse regional consequences in the first loop.

## Reviewable build order

These are dependency-ordered work packages, not minted work-item IDs. The lead mints
implementation rounds only after the relevant decisions. Each round includes its
state, validation, focused proof and reason-doc update rather than leaving saves to
an integration finale.

1. **Decision closure and feasibility.** Resolve the questions above; run the
   slice-start consolidation in `EPIC.md`, "How each slice runs". Compare driving
   candidates on a route containing slopes, terrain edges, a thin obstacle and a
   shallow wall scrape. Require cross-browser replay agreement, bounded collision
   work and no tunnelling. BR judges the drive and the mass-placement difference.
   Select neither a library nor its version without this evidence and the repository
   dependency-age check. A local route proves feasibility, not region completion.
2. **Authoring-to-game contract.** A shared part exported as a thing must validate and
   load on two different hosts; a mod-authored compatible part must need no code edit.
   Refuse broken references, invalid supports and unsupported capabilities. Keep the
   VAT editor's production deployment and launcher work in #323 rather than making a
   full editor a prerequisite for a minimal reproducible export path.
3. **Persistent parked instances.** Replace the selected wreck placements with
   vehicle-owned state and inspectable fittings. Prove independent instances, saved
   removals and contents, deterministic placement and cache invalidation. Keep the
   exterior collision and picking guarantees while the access model is added.
4. **Salvage and workshop.** Install, remove and repair through the chosen work and
   heavy-handling rules. Prove cancellation, changed supports, lost reach and absent
   output space preserve single ownership. Show the shared part moving between hosts
   and the capability-matched add-on at a player-chosen legal location. Heavy parts
   must have a reachable workflow, not just a weight that prevents every action.
5. **Cabin and cargo.** Add the chosen access, animated door and glazing behaviour,
   fitted storage, charge and fuel handling. Prove blocked entry/exit and swing
   refusal cannot place bodies through solids; test door/light changes in one browser
   flow. BR checks interior visibility for #1016. Resources and storage survive
   detach/refit without duplication or loss.
6. **Driving and impact.** Integrate the selected solver, controls, engine noise,
   resource use and local part damage. Prove moving-to-parked handoff, an immediate
   save/load while moving, lost propulsion, braking and collision with terrain,
   people and other vehicles. Apply BR's attachment decision rather than bypassing
   support invariants on impact. Compare mass-placement variants while holding total
   mass, power and external silhouette fixed; do not pin tuned trajectories.
7. **Region and playtest.** Join Slice 4b's routes, wreck/convoy placement and residency
   contract. Prove driving across a streaming boundary neither resets the vehicle nor
   changes outcomes with load timing. Cover offscreen running/coasting behaviour,
   fuel exhaustion and return to a parked modified build. Measure a street of parked
   vehicles and moving contacts against the owning performance budget. Extend a
   smoke flow rather than multiplying browser stages. BR plays the complete loop;
   completion needs their verdict, not only green tests. Run the slice-exit
   consolidation and deep docs pass, trimming this plan into lasting reasons and
   code cues rather than keeping an implementation diary.

## Deferred work and its trigger

These deferrals are proposed under #322 unless an existing issue is named.

- **Scratch-built frames:** #322 Q1's first scratch-build work package, after the
  cross-host fitting loop is accepted. Keep capability matching; do not prebuild a
  general fabrication editor to claim future freedom.
- **Motorbike driving and stand/lean behaviour:** the motorbike content round under
  #322, after four-wheel handling is accepted. Bike balance is not car tuning.
- **Pickup reference refinement:** its content first-look under #322; measure the bed
  then rather than canonising the spike's estimate. Wear appearance is also judged
  at that first-look, not by accepting the debug slider's range as a game rule.
- **Voxel erosion and cut-apart structure:** the first destruction expansion under
  #322. Whole-part condition can serve the first loop without promising an editable
  shape or importing authoring geometry into Deadvox.
- **Gas-tightness, shelter, heating and permanent degradation:** dedicated #322
  follow-up decisions before the first consumer. Obstruction and a roof do not prove
  enclosure; a flood over connected space is a different question from ray blocking.
- **Furniture on bonnets and loose objects riding empty cabin cells:** #322's first
  carried-world-object work package. Fitted cargo suffices first; do not infer that
  permission to board grants permission to place arbitrary furniture inside a car.
- **Finer collision grain:** #221, when its partial-block contract is settled. Preserve
  the existing parked guarantee without pretending its rounding is exact geometry.
- **Pipes, wiring topology, trailers, mounted weapons and mobile workshops:** #322
  expansion work only when a player decision needs that topology or interaction.
  Pools and ordinary cargo are not a promise to simulate those systems.
- **Full VAT UI and public launcher:** #323 after the export contract is proven.
  Productionising a tool is separate from declaring its output authoritative.

## Why these boundaries

Mass placement deserves a playable comparison because a build should change driving,
not only acceleration. A contact-count score is a poor proxy: changing the contact
solver can reverse its apparent handling result. Use trajectory properties and
controlled comparisons alongside BR's play judgment; do not freeze another
prototype's constants or grid size.

Structural relationships must remain authored choices because geometric support
inference confuses proximity with fastening. Keeping independent work requirements
also lets cutting, unbolting and repair differ without an explosion of part types.

A sealed interior cannot be inferred from a support graph, and vehicle reach cannot
be inferred from road connectivity. Both are consequences of occupied and empty
space at the consumer's scale. Leaving those distinctions explicit avoids building
an enclosure simulator or regional road generator merely to get the salvage loop
into play.
