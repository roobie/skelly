---
read_if:
  - you're planning vehicle implementation, authoring or the Wheels playtest
  - you're applying the settled vehicle scope and deferred directions from issue 322
  - you're integrating vehicle state with items, saves, collision or region simulation
  - you're building the heavy-part-hoist vehicle or impact detachment
---

# Slice 6 — Wheels

**Status: design settled; implementation and play acceptance remain.** The vehicle
goal is in `DESIGN.md`, "Vehicles"; the slice process is in
`EPIC.md`, "How each slice runs". This plan states implementation intent, not a
claim that the spike already provides the game systems.

## The smallest useful loop

Find an incomplete vehicle, inspect why it cannot run, salvage a compatible part
from another wreck, fit it with tools, fuel and start it, carry loot to another
stop, suffer a consequential collision, and choose between repair, stripping weight
and abandoning the vehicle. Save and return to the same build. This tests whether
mobility and carrying capacity justify the noise, supplies and exposed work, rather
than merely whether a car can move.

The hatchback and pickup are the first transport hosts, with genuinely shared
service parts and a freely placed capability-matched add-on. Two hosts expose
accidental blueprint-specific restrictions; the add-on exposes a disguised fixed
socket system. The motorbike follows after the four-wheel loop, rather than putting
balance and lean on the first playtest's critical path. Each host is authored as
content parts and a content blueprint, the hatchback remade from a real car, so no
vehicle is authored twice; see `docs/vehicle-spike.md`, "The hatchback from content".

Building starts from factory structures with compatible parts and add-ons, not raw
rails and plates. Factory welded structure is one player-facing assembly while
retaining its component fittings for local damage and shape. This keeps routine
work at the grain of a useful salvage action without closing later structural
fabrication or cutting.

Heavy salvage uses a mobile heavy-part-hoist that is itself a vehicle, built and
driven through the same vehicle systems. It is not a separate equipment kind or a
workshop-only transfer exception. Lifting is a capability of its fitted crane parts,
not of a hoist vehicle kind: removing or breaking the crane removes the capability,
and a salvaged crane stays an ordinary part, so no vehicle-wide flag can outlive the
parts that justify it. Field engine recovery therefore has a physical
workflow, with lifting, load ownership and clearance to prove. The hoist is required
utility content alongside the two transport hosts, not a third transport host that
reopens the roster choice.

The world needs salvageable wrecks and a convoy remnant, fuel, tools and lifting
access within reach of the loop, cargo worth transporting, enemies that respond to
engine noise, and a route with a meaningful dismount. Wrecks are vehicle instances
with missing and damaged parts, not searchable furniture with a second future
identity. Loose loot beside a wreck stays loose.

A useful trunk or bed cargo fitting starts the storage corpus. Contents belong to
that fitted item, never to an invisible vehicle-wide inventory. This makes transport
valuable without requiring every glovebox and door pocket before the loop can be
judged; additional compartments use the same ownership mechanism.

A bounded authored route can prove the loop before regional integration, but does
not complete the slice. Slice 4b's drivable surfaces and region map remain release
dependencies. A route must be traversable by the actual vehicle footprint and
clearance, not merely connected on a road graph. A blockage passable on foot but
not by car makes parking and dismounting meaningful without sealing the whole map.

## Playtest questions and exit

Can players diagnose a non-running build, find a compatible part and finish the
repair without outside instructions? Can they recover a heavy part with the hoist
without losing track of what owns it? Does altered mass placement change a driving
choice rather than just a statistic? Does cargo capacity justify a noisy arrival?
Does an impact create a repair, stripping or abandonment decision rather than a
routine reset? Can players recognise when a route requires leaving the car?

The slice is complete only when the loop works in the region, persistence and
cross-browser replay hold, the declared performance budget holds, the playtest in
`EPIC.md`, "How each slice runs", is evaluated, and BR accepts handling, access and
interior visibility. A passing debug route or export tool is not that exit.

## Boundaries worth keeping

### Things, not a second item universe

Vehicle membership and ordinary inventory ownership are exclusive so salvage can
retain the item's condition, resources and contents without reconciling two mutable
copies. The production owner is `src/core/vehicleInstances.ts`, `VehicleInstances`;
its parts join ordinary lookup and UID validation through `src/core/itemTree.ts`,
`itemRoots` and `savedItemTree`. Factory service suggestions remain distinct from
occupied fittings so an absent part does not erase its reinstall location or seal
the build to blueprint sockets. Failed or interrupted transfers must retain the
original owner until a destination has been admitted.

VAT assembles things; the thing tool authors their shapes. The VAT export carries
baked per-part collision geometry beside render geometry so simulation never
reconstructs authoring shapes. Do not revive a second vehicle material or mass
authority. The neutral export boundary is
`packages/thing-core/src/schema.ts`, `NeutralModelSchema`; the reasons for keeping
geometry out of Deadvox are in `things/WORK.md`, "Decisions". Vehicle-specific
capabilities and gameplay requirements belong to validated game content, not the
neutral core. The export contract precedes full VAT editor productionisation.

The spike's `src/vehicles/model.ts`, `PartType`, `Fitting` and `VehicleInstance`,
are useful concepts, not a production schema to preserve. Do not carry its mass
field and geometric-centroid calculation forward as a competing authority to
exported per-part mass and centre of mass. Attached cargo, fuel and occupants also
contribute to the moving assembly's mass distribution.

Parts are unhanded: placement determines the side. Reflection must transform
physical and interaction datums as well as appearance so fitting does not create a
visual-only variant. This keeps salvage reusable and the catalogue small without
closing later separately authored handed parts. Capability and geometry still
decide compatibility; unhanded does not mean universal fit.

### Condition, appearance and attachment

Weathering and functional condition are independent so a rusty working part and a
clean broken one remain possible. Appearance stays with the part, rather than
being replaced by the host's paint on installation. Functional condition changes
through damaging events, not elapsed time or distance: repair follows consequences
of play instead of scheduled maintenance. Fuel and charge consumption are not wear.

Fitted and loose parts use the shared item condition vocabulary so removing a part
does not change what its condition means. This is not a new vehicle ladder or a
new numeric representation; its owner is `src/core/items.ts`, `Item`.

Impact can detach a struck part and cascade through unsupported dependents. Surviving
parts remain recoverable world items; damage does not silently delete ownership.
Condition and attachment stay distinct because broken attached mass still affects
the vehicle while detached mass does not. The cascade needs deterministic ordering,
valid output placement and a defined outcome around occupied cabins. Those are
implementation proof obligations, not permission to leave unsupported fittings or
to stop the cascade at a loaded structural member. Whole-part damage does not imply
voxel erosion or player-operated cutting of welded assemblies.

### Fitting is not just geometry

Keep attachment legality, structural support, work requirements and functional
capability separate. Contact can suggest supports but cannot choose the structural
contract: touching two surfaces does not mean both hold the part up. See
`src/vehicles/model.ts`, `supportProblems`, `addFitting` and `removeFitting`.
The spike's refusal to remove a support is not an impact-detachment implementation.

Install, remove and repair are distinct activities. Cutting a weld is not welding
in reverse. Use the existing long-action and crafting ownership boundaries rather
than building a vehicle job scheduler; see `src/core/craftWork.ts`,
`craftActionHooks`. Vehicle jobs need a world-target adapter because an installed
part is not an ordinary inventory repair target. Revalidate reach, supports,
resources and destination on completion. The hoist's lifted load must participate
in the same single-owner transfer contract, not bypass it.

Structural completeness and ability to run are different questions. Inspection
must distinguish missing support, unusable drive, steering, fuel and charge without
pretending that a finished silhouette means a running car. Player-visible details
belong on the opened inspection surface under `INTERFACE.md`, "Text"; control
labels come from bindings.

### Access, glass and obstruction

The first cabin interaction is seated entry through an animated usable door, not
free walking inside. Entry and exit need reachable free space, and a door's changed
pose must change obstruction; an obstructed swing is refused. This provides a
coherent driver view and access without making moving interior floors a prerequisite.
It does not require the vehicle to stop before exit: leaving it coasting is allowed,
with the exit collision and resulting unattended motion proved together.

Glazing blocks bodies while transmitting sight and light; sound attenuation is
explicit content. This keeps the driver's view, external observers and interior
lighting consistent rather than hiding an opaque cabin behind a transparent mesh.
Bullet interaction uses the combat material rules, not an inference from movement
blocking. Gas sealing is a separate question.

Fitted parts and their poses own both appearance and obstruction. Keep parked
world collision and picking derived, not hand-authored per wreck. See
`src/vehicles/solid.ts`, `solidBlocks`, and `src/core/blockEntities.ts`,
`BlockEntities.hasPartAt`. The filled-column approximation is not an enterable-cabin
or transparent-window model. Extend the consumers without treating that approximation
as the cabin's authoritative empty space.

A moving body needs swept collision and a defined handoff to parked occupancy.
Both representations derive from the same build and pose; neither may leave stale
blocking cells or permit parking through a wall or actor. Changes must reach
movement, navigation, picking, sight, sound and light together.

### Driving and unattended motion

Road-going arcade handling is sufficient for v1 beta, with meaningful mass placement,
steering and driven-axle choices rather than identical handling behind different
meshes. A constrained road controller needs explicit, tested boundaries for unsafe
drops and rollover situations; it must not accidentally promise full airborne
motion and recovery. Greater realism remains the long-term direction, not a reason
to delay the playable loop. Fuel and electricity retain pools rather than cable
and pipe graphs.

Rapier remains a candidate, not a selected dependency. Compare it with a bounded
project-owned solver before selecting an implementation; the existing
`src/core/rigidBody.ts`, `RigidBody` and `stepRigidBody`, is a contact/impulse seam,
not evidence that car suspension, tunnelling or deterministic replay is solved.

Leaving a moving car permits unattended coasting, collision and bystander damage.
Budget and prove its deterministic coarse transition after regional departure;
unloading is never an emergency brake. Do not keep extra regions locally simulated
until a vehicle stops as an unrecorded exception to the residency contract.

Deadvox owns pause and compression. Driving uses simulation time and bounded steps,
not render frame time. A physics choice must satisfy
`docs/decisions/0008-deterministic-world.md`, "Decision", including cross-browser
agreement and position-driven residency. A WASM physics library does not establish
that contract by itself. A failed deterministic prototype stops physics selection;
it does not silently weaken the contract.

## What must survive a save

Persist authoritative instance identity, build membership and placement, supports
and joint state, part condition and appearance, door state, storage contents,
resource amounts, vehicle pose and motion, occupants, lifted loads and any resumable
work. These are intended state obligations, not a parallel field schema. Extend
owning types and `src/core/saveState.ts`, `SaveSnapshot`, as each obligation lands.
Derived mass, capabilities, geometry caches and world occupancy are rebuilt from
that truth, never restored as independent editable totals. The parked owner crosses
the durable boundary through `src/core/saveFormat.ts`, `makeWirePayload` and
`restoreWirePayload`, rather than relying on a snapshot-only copy. Scenario
registration must preserve saved builds instead of regenerating missing parts;
see `src/game/testHouseVehicles.ts`, `registerTestHouseVehicles`.

Saving in motion, during work or across detachment must be equivalent to continuing
without a load; parking is not permission to erase momentum at save time. Settled
parked vehicles need no continuous rigid-body work. Running vehicles continue
consuming resources out of view, and coasting vehicles retain their canonical
consequences. No new save migration promise is introduced; see `AGENTS.md`,
"Project stage: pre-pre-alpha, no backwards compatibility".

## Reviewable build order

These are dependency-ordered work packages, not minted work-item IDs. Each round
includes its state, validation, focused proof and reason-doc update rather than
leaving saves to an integration finale.

1. **Feasibility.** Run the slice-start consolidation in
   `EPIC.md`, "How each slice runs". Compare driving candidates on slopes,
   terrain edges, a thin obstacle and
   a shallow wall scrape. Require cross-browser replay agreement, bounded collision
   work and no tunnelling. Include unattended motion and a loaded hoist in the
   feasibility envelope so neither becomes a late exception. BR judges handling,
   the constrained boundary and the mass-placement difference. Select neither a
   library nor its version without evidence and the dependency-age check.
2. **Authoring-to-game contract.** Settled in
   `docs/vehicle-spike.md`, "Export contract". VAT production deployment stays in
   #323 rather than making a full editor a prerequisite for reproducible exports.
3. **Persistent parked instances and light salvage.** Replace selected wreck
   placements with vehicle-owned state. Prove independent instances, saved removals
   and contents, deterministic placement and cache invalidation. Add install,
   remove and repair for hand-manageable parts; prove cancellation, changed supports,
   lost reach and absent output space preserve single ownership. Show a shared part
   moving between hosts and an add-on at a legal player-chosen placement.
4. **Cabin, cargo and driving.** Add seated access, animated doors, channel-specific
   glazing, fitted storage and resource handling. Integrate the selected solver,
   controls and engine noise. Prove blocked entry/exit and swing refusal, moving-to-
   parked handoff, braking, lost propulsion and save/load in motion. Include safe
   placement when exiting a moving vehicle without arresting the vehicle. BR checks
   interior visibility. Compare mass-placement variants while holding
   total mass, power and silhouette fixed; do not pin tuned trajectories.
5. **Heavy-part-hoist vehicle and heavy salvage.** Build the hoist through the same
   authoring, instance and driving path, then add its lifting operation. Prove field
   recovery, loaded clearance, load mass, release refusal and saved ownership through
   lift, transport and refit. Do not substitute a workshop-only transfer or a new
   equipment lifecycle for the vehicle. This follows driving because the means of
   moving the heavy part is itself drivable.
6. **Impact and support cascades.** Add local condition damage and detachment through
   unsupported dependents. Prove deterministic cascade order, retained item identity
   and contents, output placement, occupied-cabin consequences and collisions while
   shedding parts. Include the loaded hoist; no load disappears when its support is
   damaged. A save across the event must preserve the same result. The implementation
   round must expose any unresolved destructive-placement trade-off before coding it.
7. **Region and playtest.** Join Slice 4b's routes, wreck/convoy placement and residency
   contract. Prove streaming boundaries neither reset vehicles nor change outcomes
   with load timing. Cover unattended collision, canonical coarse motion, offscreen
   fuel exhaustion and return to a modified build. Measure parked streets and moving
   contacts against the owning budget. Extend smoke flows rather than multiplying
   browser stages. BR plays the complete loop; completion needs their verdict, not
   only green tests. Run the slice-exit consolidation and deep docs pass, trimming
   this plan into lasting reasons and code cues rather than an implementation diary.

## Deferred work and its trigger

#322 carries the vehicle follow-up scope; the narrower issues below own their work.

- **Scratch-built frames:** the #322 scratch-build follow-up after cross-host fitting
  is accepted. Keep capability matching without prebuilding a fabrication editor.
- **Walk-in interiors:** the #322 trucks, RVs or free-form-building follow-up. Walking
  inside a plausible interior is an important long-term requirement; seated access
  is a scope limit for the first loop, not a permanent restriction.
- **Greater driving realism:** the #322 post-v1-beta driving follow-up, after the
  arcade loop is accepted. Aim for as much realism as feasible, judged by play and
  the deterministic performance contract rather than detail for its own sake.
- **Handed parts:** the #322 content expansion that first needs physical left/right
  incompatibility. Unhanded salvage leaves that expansion open rather than ruling
  every future part permanently interchangeable across sides.
- **Motorbike driving and stand/lean behaviour:** the motorbike content round under
  #322 after four-wheel handling is accepted. Bike balance is not car tuning.
- **Pickup reference refinement and wear appearance:** the content first-look under
  #322. Do not canonise an estimated bed length or a debug slider as a game rule.
- **Additional storage compartments:** the #322 compartment-content follow-up after
  cargo transport is accepted. Gloveboxes and door pockets extend fitted storage,
  not a second vehicle inventory.
- **Voxel erosion and player-cut structure:** the #322 destruction expansion. Impact
  detachment does not require editable part geometry or authoring shapes in Deadvox.
- **Gas-tightness, shelter, heating and permanent degradation:** #322 follow-up
  decisions before their first consumer. Obstruction and a roof do not prove
  enclosure; a flood over connected space differs from ray blocking.
- **Furniture on bonnets and loose objects riding empty cabin cells:** #322's first
  carried-world-object work package. Boarding and fitted cargo do not grant arbitrary
  furniture placement inside a car.
- **Finer collision grain:** #221 when its partial-block contract is settled. Preserve
  parked guarantees without pretending their rounding is exact geometry.
- **Pipes, wiring topology, trailers, mounted weapons and mobile workshops:** #322
  expansion work when a player decision needs that topology or interaction. The
  mobile hoist is in the first loop; it does not imply a complete mobile workshop.
- **Full VAT UI and public launcher:** #323 after the export contract is proven.
  Productionising a tool is separate from declaring its output authoritative.

## Why these boundaries

Mass placement deserves a playable comparison because a build should change driving,
not only acceleration. A contact-count score is a poor proxy: changing the contact
solver can reverse its apparent handling result. Use trajectory properties and
controlled comparisons alongside BR's play judgment; do not freeze a prototype's
constants or grid size.

Structural relationships remain authored choices because geometric support inference
confuses proximity with fastening. Independent work requirements let cutting,
unbolting and repair differ without multiplying part types.

A sealed interior cannot be inferred from a support graph, and vehicle reach cannot
be inferred from road connectivity. Both depend on occupied and empty space at the
consumer's scale. Keeping those distinctions explicit avoids building an enclosure
simulator or regional road generator merely to get the salvage loop into play.
