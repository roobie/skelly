---
read_if:
  - you're implementing or reviewing the Slice 6 feasibility candidates or their shared harness
  - you're deciding Rapier numeric eligibility or promoting feasibility code into simulation identity
  - you're building or evaluating the project-owned double-precision Rapier bindings
  - you're comparing the driving probes or preparing BR's handling judgment
---

# Vehicle feasibility admission

The experiment is not a production solver selection. Keep candidate-specific initialization behind adapters so rejecting a candidate removes its dependency without changing game saves. The continuation seam is `src/vehicles/feasibility/contract.ts`, `Candidate`; the deliberately collision-free moving body proves the harness, not road safety. The separate collision seam is `src/vehicles/feasibility/driving.ts`, `Driver`. `src/config/vehicleFeasibility.jsonnet` owns the working budget envelope; final production acceptance needs measurements. A wrong working target costs one re-run while production budgets and reference-class hardware remain open.

## Numeric eligibility

Build project-owned double-precision WASM from the official Rapier bindings and the double-precision Rust crate. The world must compute in doubles under `docs/decisions/0008-deterministic-world.md`, "Decision", and upstream publishes no double-precision WASM package; its npm build computes in f32, which is production-ineligible. A single-precision production exception is not the selected path. Rapier remains diagnostic until complete cross-engine, save and replay evidence admits the candidate; double arithmetic alone does not establish agreement or road safety. Dependency age exemption does not imply numeric exemption.

The reproducible build owner is `tools/rapier-f64/build.py`, `main`. Its precision transformation widens physical scalars and buffers while retaining integer handles, indices and byte snapshots; debug colors remain upstream presentation floats. The f64 crate's wider voxel integers cross the JS grid boundary through checked conversions so an unrepresentable grid coordinate fails rather than wrapping. Keeping the upstream solver unchanged avoids owning a solver fork. Pin a non-yanked binding-generator pair so a clean build can resolve the same supply without depending on a registry cache. The comparison build isolates precision from upstream-version changes rather than treating a different npm kernel as a precision control.

Commit the f64 WASM and its generated bindings and load them from the repository. This is the simplest supply path without CI-build or package infrastructure to own; a later shipping card may replace it. `tools/rapier-f64/build.py`, `main`, owns regeneration, provenance recording and local rebuild verification; `test/rapierBuild.test.ts` checks the committed supply without requiring Rust in CI.

`tools/rapier-f64/local.mjs`, `runLocal`, exercises the committed module and optionally a locally built single-precision control; `tools/rapier-f64/candidate.ts`, `rapierCandidate`, deliberately preserves its collision-free fixture and marks hidden solver work unmeasured. Zero wrapper counters are not evidence of bounded internal work. Do not infer agreement from the library name or a simulation source hash.

## Harness boundaries

Schedule partitioning, compression and restoration must not alter the experiment's continuation; see `src/vehicles/feasibility/runner.ts`, `TickDispatch`. Wall-time conversion remains a caller concern, so this experiment does not supply a production wall-time clock.

Agreement evidence must expose distinctions that a digest can conceal and must preserve the information needed to continue safely; see `src/vehicles/feasibility/trace.ts`, `trace`. Unsafe edges have invariants only, so the spike chooses no boundary behaviour.

Cross-engine evidence needs the same module and inspectable artifacts in Node and each supported browser; see `test/browser/vehicle-feasibility.mjs`, `engines`. Timings are evidence, not reference-class performance acceptance. The moving body cannot establish either road candidate's collision bound. The road probes distinguish measured owned sweeps from unmeasured Rapier internal work rather than reporting missing counters as zero.

## Driving comparison

Use shared geometry and inputs to isolate collision behaviour before adding suspension and control tuning. See `src/vehicles/feasibility/driving.ts`, `ownedDriver`, `rapierDriver` and `runDriving`, and `src/config/vehicleFeasibility.jsonnet`, `driving`. A rotation-locked sphere proxy deliberately excludes mass-placement response, wheels, driven axles, steering and rollover. These probes cannot establish vehicle handling quality or loaded-hoist feasibility. BR's play judgment selects neither by default.

The owned candidate sweeps a point through radius-expanded oriented boxes, removes inward normal velocity and retains tangential velocity. Its square corner envelope is conservative rather than a rounded sphere sweep: it can stop short of a physical corner and delay departure from an edge. Admission refuses a start inside that conservative envelope, even if the sphere itself would be clear, because an inside start invalidates the sweep. Dropping unchecked remaining movement at the impact cap bounds collision work but is not a production response to an unsafe situation. Rapier uses physical sphere-box collision with continuous collision detection, not that conservative envelope.

### Diagnostic results

These results describe the supplied deterministic f64 build, identified by `vendor/rapier-f64/provenance.json`, `revision`, and `tools/rapier-f64/Cargo.toml`, `rapier3d`. Its reproducible build follows the deterministic release line under `AGENTS.md`, "Dependency age". Source identity belongs to the recorded artifacts rather than a parallel version label in this document.

| Trajectory property | Owned bounded sweep | Committed deterministic f64 Rapier |
| --- | --- | --- |
| Slope | Climbs, loses forward speed and slides back; maximum observed penetration zero | Same qualitative reversal; maximum observed penetration about 0.0677 mm |
| Edge drop | Leaves support and falls outside the probe envelope; conservative corners delay release | Leaves support and falls outside the probe envelope earlier |
| Thin obstacle | Stops on the approach side; maximum observed penetration zero | Does not tunnel; transient penetration about 17.8 mm before settling |
| Scrape | Retains forward travel, removes inward lateral velocity; maximum observed penetration zero | Retains forward travel, removes inward lateral velocity; maximum observed penetration about 0.0690 mm |

Both candidates remain within the scenario data's working penetration target on these probes. The separate higher-speed `test/vehicleDrivingFeasibility.test.ts`, `fixture`, produces about 48.6 mm of first-tick Rapier penetration: its test protects no tunnelling, not penetration acceptance. Passing the authored probes is not production collision acceptance or a reason to select a candidate. The edge run exposes the owned envelope's conservative bias, not a safe airborne controller. Both candidates leave their declared supported envelope; neither proves an acceptable drop or recovery policy.

`test/browser/vehicle-driving.mjs`, `runDrivingComparison`, records readable trajectories, every numeric field's binary64 representation, source/scenario/WASM digests and engine versions. The diagnostic run agrees bit-for-bit between Node, Chromium, Firefox and WebKit for each candidate separately, including signed zero and continuation-independent trajectory fields. Agreement between candidates is neither expected nor asserted. The emitted summary carries exact trajectory measurements and penetration findings; a successful check means agreement and finite bounded-scene execution, not physics acceptance. The default feasibility browser stage includes this comparison.

### Collision work and play boundary

The owned loop has an admitted collider cap and an impact cap; each impact scans the admitted colliders once. The trace exposes actual sweeps and saturation. Rapier admits the same finite scene with one moving body, so the possible moving-static pairs are bounded by admitted static geometry, and solver iterations and CCD substeps are capped in `src/vehicles/feasibility/driving.ts`, `rapierDriver`. Rapier's internal narrowphase, allocation and CCD work is not exposed by these bindings; its trace uses null rather than invented operation counts. This is a bounded scene and configured iteration envelope, not a measured internal-work or production CPU bound. Instrumentation remains required for admission under #322.

For BR's diagnostic play, run Deadvox's Vite development server and open `/src/vehicles/feasibility/driving.html`. The page is deliberately outside the shipped game and build entry points. Select a scenario, reset, then run or single-step both candidates with the same drive-acceleration slider. The neutral slider reproduces the recorded probe. The development view shows the same fixture and both trajectories; it is not a driving game or a handling approval surface.

### Still open

The obligations in `SLICE-6.md`, "Driving and unattended motion" remain open: unattended coasting after regional departure, including budget and deterministic coarse-transition proof; loaded hoist; and exit from a moving vehicle together with unattended motion. The road probes implement no regional departure, bystander damage, occupant exit, suspended load, save/replay continuation or production residency seam. Neither candidate is selected. BR's handling judgment and production collision-work evidence remain required before #322 selects physics.

## Missing production seams

The deterministic math module required by `docs/decisions/0008-deterministic-world.md`, "Decision", is a missing core seam, not supplied by the moving body. The owned-road implementer must own its narrow needed operations, exact-rounding implementation and agreement proof before using transcendental math; the wider call-site migration needs a separate lead-assigned owner.

`tools/simulationFingerprint.ts`, `FEASIBILITY_ENTRIES`, explicitly classifies the experiment in a separate source graph. It is neither production identity nor debug-excluded code. `tools/simulationFingerprint.ts`, `collectSimulationSourceGraph`, still rejects WASM. Before a library adapter becomes production-authoritative, the fingerprint owner must add byte-aware binary dependency discovery and hashing, including bindings, package/build configuration and authoritative continuation bytes. The browser runner's artifact digest is diagnostic identity, not that missing integration.

Slice-start consolidation is reused from #159; the lead retains finding assignments and revisit dates. The vehicle seam must not import debris sleep or expiry. `test/vehicleFeasibility.test.ts` protects caller partitioning and continued unforced momentum without changing debris's presentation contract.
