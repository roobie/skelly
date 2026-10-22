---
read_if:
  - you're implementing or reviewing the Slice 6 feasibility candidates or their shared harness
  - you're deciding Rapier numeric eligibility or promoting feasibility code into simulation identity
  - you're building or evaluating the project-owned double-precision Rapier bindings
---

# Vehicle feasibility admission

The experiment is not a production solver selection. Keep candidate-specific initialization behind adapters so rejecting a candidate removes its dependency without changing game saves. The common seam is `src/vehicles/feasibility/contract.ts`, `Candidate`; the deliberately collision-free moving body proves the harness, not road safety. `src/config/vehicleFeasibility.jsonnet` fixes round 2's working budget envelope; final production acceptance needs measurements. A wrong working target costs one re-run while production budgets and reference-class hardware remain open.

## Numeric eligibility

Build project-owned double-precision WASM from the official Rapier bindings and the double-precision Rust crate. The world must compute in doubles under `docs/decisions/0008-deterministic-world.md`, "Decision", and upstream publishes no double-precision WASM package; its npm build computes in f32, which is production-ineligible. A single-precision production exception is not the selected path. Rapier remains diagnostic until complete cross-engine, save and replay evidence admits the candidate; double arithmetic alone does not establish agreement or road safety. Dependency age exemption does not imply numeric exemption.

The reproducible build owner is `tools/rapier-f64/build.py`, `main`. Its precision transformation widens physical scalars and buffers while retaining integer handles, indices and byte snapshots; debug colors remain upstream presentation floats. Keeping the upstream solver unchanged avoids owning a solver fork. The comparison build isolates precision from upstream-version changes rather than treating a different npm kernel as a precision control.

Commit the f64 WASM and its generated bindings and load them from the repository. This is the simplest supply path without CI-build or package infrastructure to own; a later shipping card may replace it. `tools/rapier-f64/build.py`, `main`, owns regeneration, provenance recording and local rebuild verification; `test/rapierBuild.test.ts` checks the committed supply without requiring Rust in CI.

`tools/rapier-f64/local.mjs`, `runLocal`, exercises the committed module and optionally a locally built single-precision control; `tools/rapier-f64/candidate.ts`, `rapierCandidate`, deliberately preserves its collision-free fixture and marks hidden solver work unmeasured. Zero wrapper counters are not evidence of bounded internal work. Do not infer agreement from the library name or a simulation source hash.

## Harness boundaries

Schedule partitioning, compression and restoration must not alter the experiment's continuation; see `src/vehicles/feasibility/runner.ts`, `TickDispatch`. Wall-time conversion remains a caller concern, so this experiment does not supply a production wall-time clock.

Agreement evidence must expose distinctions that a digest can conceal and must preserve the information needed to continue safely; see `src/vehicles/feasibility/trace.ts`, `trace`. Unsafe edges have invariants only, so the spike chooses no boundary behaviour.

Cross-engine evidence needs the same module and inspectable artifacts in Node and each supported browser; see `test/browser/vehicle-feasibility.mjs`, `engines`. Timings are evidence, not reference-class performance acceptance. The moving body cannot establish either road candidate's collision bound; candidate adapters must instrument their hidden work.

## Missing production seams

The deterministic math module required by `docs/decisions/0008-deterministic-world.md`, "Decision", is a missing core seam, not supplied by the moving body. The owned-road implementer must own its narrow needed operations, exact-rounding implementation and agreement proof before using transcendental math; the wider call-site migration needs a separate lead-assigned owner.

`tools/simulationFingerprint.ts`, `FEASIBILITY_ENTRIES`, explicitly classifies the experiment in a separate source graph. It is neither production identity nor debug-excluded code. `tools/simulationFingerprint.ts`, `collectSimulationSourceGraph`, still rejects WASM. Before a library adapter becomes production-authoritative, the fingerprint owner must add byte-aware binary dependency discovery and hashing, including bindings, package/build configuration and authoritative continuation bytes. The browser runner's artifact digest is diagnostic identity, not that missing integration.

Slice-start consolidation is reused from #159; the lead retains finding assignments and revisit dates. The vehicle seam must not import debris sleep or expiry. `test/vehicleFeasibility.test.ts` protects caller partitioning and continued unforced momentum without changing debris's presentation contract.
