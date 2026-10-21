---
read_if:
  - you're implementing or reviewing the Slice 6 feasibility candidates or their shared harness
  - you're deciding Rapier numeric eligibility or promoting feasibility code into simulation identity
---

# Vehicle feasibility admission

The experiment is not a production solver selection. Keep candidate-specific initialization behind adapters so rejecting a candidate removes its dependency without changing game saves. The common seam is `src/vehicles/feasibility/contract.ts`, `Candidate`; the deliberately collision-free moving body proves the harness, not road safety. Fixture proposals live in `src/config/vehicleFeasibility.jsonnet`; BR must approve their workload allocation before any performance acceptance.

## Numeric eligibility

Rapier remains a diagnostic candidate. Its deterministic build uses single-precision arithmetic, conflicting with “compute with doubles” in `docs/decisions/0008-deterministic-world.md`, "Decision". That ADR's reason is cross-engine agreement, including lockstep and replay, not merely the width of a JavaScript wrapper. Agreement must therefore be measured independently of precision; a passing diagnostic run does not grant a precision exception. BR owns production eligibility under the unchanged ADR. Dependency age exemption does not imply numeric exemption.

The package artifact is pinned by `package-lock.json`, `packages`. Its upstream build provenance and precision evidence belong in the admission report; cross-engine agreement of that artifact remains a candidate-round gate. Do not infer agreement from the library name or a simulation source hash.

## Harness boundaries

`src/vehicles/feasibility/runner.ts`, `TickDispatch`, accepts integer simulated-time quanta, retains pending work and snapshots its sub-tick phase. Compression changes dispatch throughput only. A caller converting wall time owns the conversion; this experiment does not provide a production wall-time clock.

`src/vehicles/feasibility/trace.ts`, `trace`, encodes numeric bits little-endian and covers opaque adapter continuation bytes as well as visible state and ordered events. Raw fields decide agreement even if hashes collide. Unsafe edges have invariants only: finite state, no ground crossing and identical continuation across engines and saves; the spike chooses no boundary behaviour.

`test/browser/vehicle-feasibility.mjs` runs the same module under Node and the supported browser engines and preserves raw traces, identities, work and timing artifacts. Timings are evidence, not reference-class performance acceptance. The moving body has no collision work; zero collision counters cannot establish a bound for either road candidate. Candidate adapters must instrument hidden work rather than inherit those zeros.

## Missing production seams

The deterministic math module required by `docs/decisions/0008-deterministic-world.md`, "Decision", is a missing core seam, not supplied by the moving body. The owned-road implementer must own its narrow needed operations, exact-rounding implementation and agreement proof before using transcendental math; the wider call-site migration needs a separate lead-assigned owner.

`tools/simulationFingerprint.ts`, `FEASIBILITY_ENTRIES`, explicitly classifies the experiment in a separate source graph. It is neither production identity nor debug-excluded code. `tools/simulationFingerprint.ts`, `collectSimulationSourceGraph`, still rejects WASM. Before a library adapter becomes production-authoritative, the fingerprint owner must add byte-aware binary dependency discovery and hashing, including bindings, package/build configuration and authoritative continuation bytes. The browser runner's artifact digest is diagnostic identity, not that missing integration.

Slice-start consolidation is reused from #159; the lead retains finding assignments and revisit dates. The vehicle seam must not import debris sleep or expiry. `test/vehicleFeasibility.test.ts` protects caller partitioning and continued unforced momentum without changing debris's presentation contract.
