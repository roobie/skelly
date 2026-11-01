---
read_if:
  - you're choosing or upgrading the physics build for driving, parked collision or ragdolls
  - you're migrating ragdolls off npm Rapier or changing physics initialization and binary identity
  - you're checking which physics evidence remains necessary after engine selection
---

# 9. One pinned Rapier f64 build

**Status:** accepted.

## Context

The simulation computes in doubles and must agree across browsers under [ADR 0008](0008-deterministic-world.md). The npm Rapier build computes in single precision. Maintaining different physics builds for driving, parked collision and ragdolls would give the game separate binary identities, initialization paths and API versions.

## Decision

Use the project-owned deterministic Rapier f64 WASM build for driving, parked collision and ragdolls. There is one Rapier build in the game, not a separate engine or precision for each consumer. Parked collision uses Rapier alongside driving so both share the same engine and double-precision build.

Migrate ragdolls to that build and remove npm Rapier when they move. This is a migration obligation, not a claim that the existing ragdoll consumer has already moved. Sharing the build does not turn presentation-only corpse motion into authoritative simulation or require parked vehicles to pay continuous driving cost.

Pin the f64 supply. Upgrade only on maintainer demand, under `AGENTS.md`, "Dependency age"; do not automatically follow upstream releases. The reproducible supply owner is `tools/rapier-f64/build.py`, `main`, with dependency pins in `tools/rapier-f64/Cargo.toml`. The age rule limits exposure to fresh releases, and explicit demand keeps a physics upgrade from silently changing results and binary identity.

## Consequences

One binary identity, one initialization path and one API version serve the physics consumers. Project ownership covers the double-precision bindings and reproducible supply rather than a fork of the upstream solver.

Engine selection does not prove a complete driving implementation. Collision-work bounds, save/replay continuation, unattended motion and integration with position-driven residency still require evidence under [ADR 0008](0008-deterministic-world.md). The sphere probes establish only the narrow findings in `docs/vehicle-feasibility.md`, "Driving probes"; they do not establish wheels, steering, rollover or mass-placement handling.
