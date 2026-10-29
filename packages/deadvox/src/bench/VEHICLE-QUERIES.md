---
read_if:
  - evaluating the parked vehicle Rapier query spike
  - adopting fine vehicle collision in gameplay
---

# Parked vehicle query spike

This is an isolated feasibility experiment, not an adoption decision. The bench
boundary keeps the shipped collision rule unchanged while comparing query costs;
see `vehicleRapier.ts`, `VehicleRapierQueries`, and `vehicle-queries-cpu.mjs`.
The baseline source is exported fitted collision boxes. Keeping separate convex
pieces avoids filling empty space with a whole-vehicle hull.

## Collider tiers

`ColliderTier` in `vehicleRapier.ts` prices richer shapes per part: fitted boxes,
a compound of convex hulls, or one static triangle mesh. The hull and mesh tiers
read each part's drawn triangles from its model file (`vehicleShapes.ts`,
`readGlbMesh`), because the export carries only boxes; adoption would bake pieces
into the export instead. `convexPieces` splits shells and cuts concave ones, and
pieces still concave at its depth cap close their hollow. A static triangle mesh
answers only on its surface, so a body fully inside it overlaps nothing.

The decomposition tunables are fidelity, collider count and cost, so a run takes
them as an explicit configuration (`vehicleShapes.config.json`, parsed by
`parseConvexConfig`) and the bench prints the one it measured. Each tier prepares
only the geometry it consumes (`vehicleRapier.ts`, `ShapeSource`), so build and
detach prices carry no other tier's placement or decomposition.

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
amalgam traversal, sight or channel policy. The single-step rows start a fresh
actor or probe on every repetition and advance it once, so they price a query's
first answer and never sustained contact or sliding, where a convex or triangle
narrow phase works hardest. Only the contact rows (shared world-space inputs
derived from each car's fitted-box bounds) price rays that hit and miss and a
body that walks into a car and slides along it; the bench prints their hit and
contact counts and refuses to report a workload that never touches. Serialized world size is a storage
proxy, not resident WASM memory; process deltas include allocator growth and garbage.
Fixture agreement across runtimes is a necessary gate, not proof of integrated
simulation determinism; see `packages/deadvox/test/browser/vehicle-rapier.mjs`.
Its fixture probes Rapier with oblique off-grid rays (distance and normal), queries
straddling faces and edges, and a body sliding along a panel, for every tier; see
`packages/deadvox/test/fixtures/vehicleRapierReplay.ts`, `probe`.
These gaps must remain visible so query feasibility is not mistaken for gameplay
readiness.
