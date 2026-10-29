---
read_if:
  - evaluating the parked vehicle Rapier query spike
  - adopting fine vehicle collision in gameplay
---

# Parked vehicle query spike

This is an isolated feasibility experiment, not an adoption decision. The bench
boundary keeps the shipped collision rule unchanged while comparing query costs;
see `vehicleRapier.ts`, `VehicleRapierQueries`, and `vehicle-queries-cpu.mjs`.
The source is exported fitted collision boxes, not rendered triangles. Keeping
separate convex pieces avoids filling empty space with a whole-vehicle hull.

## Temporary shortcuts

The box-body adapter deliberately does not replace zombie amalgam geometry. Doing
so would change what gaps an actor fits through; adoption must compose the actor's
exact shape with the vehicle query rather than substitute its bounding box. See
`vehicleQuerySeam.ts`, `VehicleQuerySeam`, and `packages/deadvox/src/core/zombies.ts`,
`ZombieSystem.shapeOf`.

Endpoint overlap tests reuse the existing movement contact search. Fine thin
surfaces need swept movement before adoption, because a substep can cross a
surface without ending inside it. See `packages/deadvox/src/core/physics.ts`,
`stepBody`. This shortcut needs rework, not a larger collision margin that closes
the gaps being evaluated.

Explicit snapshot synchronization makes the experiment testable without a second
authoritative vehicle owner. Adoption must bind synchronization to the collection
revision at the session boundary; callers must not maintain independent geometry.
Full projection and signature comparison on each revision is a temporary update
strategy that needs per-instance dirty tracking if update cost proves material.
See `vehicleRapier.ts`, `vehicleSnapshot` and `VehicleRapierQueries.sync`.

Flight can use fine point samples, but landing still returns a cell. Adoption needs
a rule for a flight ending in fine empty space inside a coarsely occupied vehicle
cell: neither silently falling through a panel nor teleporting to a cell top is
implied by the query experiment. See `packages/deadvox/src/core/itemThrow.ts`,
`steppedItemFlight` and `settleOnWorld`.

## Evidence boundary

Box zombie/probe bodies in the benchmark measure the movement seam, not zombie AI,
amalgam traversal, sight or channel policy. Serialized world size is a storage
proxy, not resident WASM memory; process deltas include allocator growth and garbage.
A replay within one runtime does not prove cross-browser determinism. These gaps
must remain visible so query feasibility is not mistaken for gameplay readiness.
