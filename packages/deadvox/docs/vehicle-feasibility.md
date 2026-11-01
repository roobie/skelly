---
read_if:
  - you're implementing or reviewing the vehicle feasibility harness or Rapier driving probes
  - you're building or evaluating the project-owned double-precision Rapier bindings
  - you're promoting physics into simulation identity, saves or residency
  - you're checking the driving spike's findings and remaining integration obligations
---

# Vehicle feasibility admission

The selected physics build is project-owned deterministic Rapier f64 for driving, parked collision and ragdolls; see `docs/decisions/0009-rapier-f64-build.md`, "Decision". Engine selection is settled, while production integration and handling acceptance still need evidence. The spike is not that integration. Keep library initialization behind adapters so the harness does not define game saves: the collision-free continuation seam is `src/vehicles/feasibility/contract.ts`, `Candidate`, and the driving seam is `src/vehicles/feasibility/driving.ts`, `Driver`.

## Numeric eligibility and supply

The world computes in doubles under `docs/decisions/0008-deterministic-world.md`, "Decision". The upstream npm build computes in f32, so the game uses project-owned double-precision WASM from the official bindings and Rust crate. Ragdolls must migrate to this same build and npm Rapier must then be removed; the migration is not implemented by these probes. Pin the supply and upgrade only on demand under `AGENTS.md`, "Dependency age". Double arithmetic alone proves neither agreement nor road safety.

The reproducible build owner is `tools/rapier-f64/build.py`, `main`. Its precision transformation widens physical scalars and buffers while retaining integer handles, indices and byte snapshots; debug colors remain upstream presentation floats. Checked conversions at the voxel-grid boundary fail on unrepresentable coordinates instead of wrapping. Keeping the upstream solver unchanged avoids owning a solver fork. Pin a non-yanked binding-generator pair so a clean build can resolve the same supply without depending on a registry cache.

Commit the f64 WASM and its generated bindings and load them from the repository. This avoids package or CI-build infrastructure solely to supply physics. The builder owns regeneration, provenance and rebuild verification; `test/rapierBuild.test.ts` checks the committed supply without requiring Rust in CI. The optional local f32 control isolates precision from upstream-version differences; it is not a second game build.

`tools/rapier-f64/local.mjs`, `runLocal`, exercises that supply; `tools/rapier-f64/candidate.ts`, `rapierCandidate`, preserves its collision-free fixture. Missing internal-work instrumentation is not evidence of bounded cost. Do not infer agreement from a library name or a source hash.

## Harness boundaries

Schedule partitioning, compression and restoration must not alter the experiment's continuation; see `src/vehicles/feasibility/runner.ts`, `TickDispatch`. Wall-time conversion remains a caller concern, so this experiment does not supply a production clock.

Agreement evidence must expose distinctions a digest can conceal and preserve the information needed to continue safely; see `src/vehicles/feasibility/trace.ts`, `trace`. Unsafe edges still need defined production invariants; falling in a probe does not decide the game's drop or recovery policy.

Cross-runtime evidence uses the same module in Node and each supported browser; see `test/browser/vehicle-feasibility.mjs`, `engines`. Timings cannot establish reference-class performance acceptance, and the collision-free moving body cannot establish road collision-work bounds.

## Driving probes

The f64 0.36 build agreed bit for bit across Node, Chromium, Firefox and WebKit. The slope probe climbed and reversed; the edge probe lost support and kept falling; the thin obstacle stopped forward travel without tunnelling; the scrape retained forward travel while removing inward lateral motion. These are narrow findings, not complete vehicle handling evidence.

`src/vehicles/feasibility/driving.ts`, `rapierDriver` and `runDriving`, uses a rotation-locked sphere against authored boxes. The proxy provides no wheels, steering, rollover or evidence about mass- and load-dependent handling. `src/config/vehicleFeasibility.jsonnet`, `driving`, owns probe geometry, inputs, expected behaviours and working bounds so tuning does not require another solver mechanism.

The authored probes stay within their working penetration target. The separate higher-speed `test/vehicleDrivingFeasibility.test.ts`, `fixture`, exceeds that target while still stopping on the approach side: its assertion protects no tunnelling, not universal penetration acceptance. Edge departure leaves the supported envelope. Neither result proves an acceptable drop, recovery or speed policy.

`test/browser/vehicle-driving.mjs`, `runDrivingProbes`, records readable trajectories, every numeric field's binary64 representation, source/scenario/WASM digests and runtime versions. It checks Node repeat and browser agreement, preserving signed zero, alongside the authored behaviour checks. A passing run means agreement and those probe properties, not save/replay or production acceptance. The existing feasibility browser stage includes these probes.

### Collision work and development view

Rapier admits finite geometry with one moving body, and the adapter configures solver iterations and CCD substeps. These constrain the scene and iteration envelope, not internal narrowphase, allocation or CCD work. The trace labels internal work unmeasured rather than inventing operation counts. Instrumentation remains required for production admission under #322.

For a diagnostic look, run Deadvox's Vite development server and open `/src/vehicles/feasibility/driving.html`. The page is outside the shipped game and build entry points. Select a scenario, reset, then run or single-step Rapier; neutral drive input reproduces the recorded probe. It is not a handling approval surface.

### Still open

The obligations in `SLICE-6.md`, "Driving and unattended motion" remain open: unattended coasting after regional departure, including budget and deterministic coarse-transition proof; loaded hoist; and exit from a moving vehicle together with unattended motion. The probes implement no regional departure, bystander damage, occupant exit, suspended load, save/replay continuation or production residency seam. Engine selection does not waive these obligations.

## Missing production seams

The deterministic math module required by `docs/decisions/0008-deterministic-world.md`, "Decision", is a missing core seam, not supplied by the moving body. Authoritative project code needs its exact-rounding implementation and agreement proof before using transcendental math; the wider call-site migration needs a separate owner.

`tools/simulationFingerprint.ts`, `FEASIBILITY_ENTRIES`, classifies the experiment in a separate source graph, not production identity or debug-excluded code. `tools/simulationFingerprint.ts`, `collectSimulationSourceGraph`, still rejects WASM. Before physics becomes production-authoritative, the fingerprint owner must add byte-aware binary dependency discovery and hashing, including bindings, package/build configuration and authoritative continuation bytes. The browser artifact digest is diagnostic identity, not that integration.

The vehicle seam must not import debris sleep or expiry. `test/vehicleFeasibility.test.ts` protects caller partitioning and continued unforced momentum without changing debris's presentation contract.
