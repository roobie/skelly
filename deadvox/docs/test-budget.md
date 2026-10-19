---
read_if:
  - you're reviewing why the default Deadvox unit suite was reduced
  - you're revisiting a cut after a budget overrun or related defect
  - you're measuring suite growth between milestones
  - you're changing content-scaling route, start-phase admission or chunk-order test work
  - you're changing base-registry or bundled-startup fixture construction or its isolation
---

# Default Deadvox unit-suite reductions

The suite keeps its worker policy and timeout rules; reductions target repeated or incidental work while preserving an assertion for each protected property. Absolute wall time depends on host capacity, so this document tracks milestone growth rather than a host-specific budget.

## Retained coverage

- Narrower mesher samples retain `test/mesher.test.ts`, "draws the same faces as plain face culling (random mixed-density chunk)"; narrower occlusion samples retain `test/occlusion.test.ts`, "gives every merged-quad corner the per-vertex value (random terrain)".
- Fewer Hamlet order cases retain `test/hamlet.test.ts`, "generates a hamlet sample the same in opposite chunk orders (seed ${seed})". The shorter idle/stroll horizon retains `test/zombies.test.ts`, "uses seeded idle and straight stroll intervals during a sustained sample". Reduced dismemberment cases retain `test/zombies.test.ts`, "scales launch distance monotonically through 40 N·s and keeps weapon distances bounded", and `test/severedEnergy.test.ts`, "caps a bat launch and dissipates each bounce for seed %i".
- No content behavior was removed; `test/content.test.ts`, "base content has no issues", remains the guard. The removed deep non-rest continuation comparison is covered by `test/snapshot-continuation.test.ts`, "deeply matches N steps with K/save/load/N−K (active rest)"; `test/snapshot-continuation.test.ts`, "preserves an active-sleep interruption emitted between frames across save/load"; `test/snapshot-continuation.test.ts`, "preserves a pending sleep interruption across a paused snapshot and load". Edited-world format coverage remains in `test/snapshot-format.test.ts`, "round-trips an edited hamlet column byte-exactly and continues deterministically from restored bytes".
- Save/scheduler fixture reductions also retain `test/snapshot-continuation.test.ts`, "detects omission of simulation, world, scheduler, inventory, and audio state". These named tests protect the properties for which incidental full-world fixture coverage was removed.

Revisit a cut only when an issue reports a related defect or suite overrun; restore the case that protects that property and link the trigger. Do not broaden fixtures or assert drifting content to compensate.

## Content-scaling route checks

Isolate city route alternatives so content additions do not accumulate into one timing failure and failures identify the affected alternative. See `test/cityKitRoutes.test.ts`, `cityAlternatives`.

For production chunk-order checks, native deep equality avoids matcher traversal dominating generation and stamping without weakening full-data comparisons. A workload-scaled deadline avoids coupling content growth to a fixed allowance. See `test/scenarioCertificate.test.ts`, `stampProbeCells`.

Skyline admission needs the compiler's grounded envelopes, not fully expanded voxel
maps: selected choices cannot exceed their declared envelope. Quota admission likewise
needs fitting references, not another compilation of every building in the city. Routes
sharing a roof origin share one static flood rather than repeating the same search for
each exit. These avoid multiplying validation work by content size without caching
mutable registries. See `src/core/templates.ts`, `templateEnvelope`;
`src/core/cityLots.ts`, `cityLotQuotaIssues`; `src/core/scenarioStart.ts`,
`skylineIssues`; and `src/core/templateSpatial.ts`, `templateWalkingRoutes`.

Start-only admission and obstruction cases must not repeatedly certify unrelated lab
routes. Keep full-composition coverage at the integration boundary: valid exits alone
cannot prove the designed civic buildings and public leads remain reachable. The fixed
authored plan makes a service-cell and turn sweep irrelevant; room substitution still
protects composition against furnishing alternatives. Focused obstruction cases use the
same start-proof owner. A shared read-only
compiled plan is safe only
when each obstruction probe owns fresh route-space and entity state; a clear probe
must not reuse an obstructed probe's memoized geometry. See `test/scenarioStart.test.ts`,
`certificate`; and `src/core/scenarioCertificate.ts`, `scenarioStartCertificate` and
`scenarioCertificate`.

## Base-registry fixtures

Gameplay tests and their shared helpers need validated content, not repeated admission of the same base pack during every file's import. Use the run's snapshots for unchanged base inputs, including helpers that select a single tuning row; keep independent builds where admission or an overlay is the behavior under test. Otherwise a small helper can silently multiply full-pack validation across its importers. Deserialize a fresh object graph for each caller; do not share mutable registries or disable file isolation. See `test/baseRegistrySetup.ts`, `setup`; `test/baseRegistry.ts`, `baseRegistry`; and `test/senseFixture.ts`, `BASE_SENSE_TUNING`. Run-owned temporary storage prevents concurrent runs from replacing each other's content or interrupting a snapshot read.

Content-admission and overlay tests still build their own inputs. Gameplay and configuration tests also need the bundled startup result's winning origins, not another admission pass during import. Preserve that result in a separate snapshot because bundled source paths differ from the base-registry fixture's source paths. See `test/baseRegistrySetup.ts`, `writeBaseRegistry` and `test/baseRegistry.ts`, `startupContent`. Both fixtures deserialize per caller so mutating a map, nested definition or admission result cannot leak between callers.

Fixture fidelity and nested mutation isolation are checked separately in `test/baseRegistry.test.ts`; no gameplay assertion is removed when a file switches fixture construction. Compare the complete startup graph with a boolean deep comparison: constructing an assertion error containing both full registries can stall failure reporting, hiding an isolation defect behind a hung test.

## Milestone growth

Compare the previous milestone's merge commit with the new head using three interleaved default-suite runs per head, each in its own isolated run. Treat median growth beyond the run-to-run spread as an overrun, and record the per-file deltas. Absolute duration may move with host load; it is not evidence of milestone regression by itself.

When a registry check approaches the test timeout, use the smallest registry source that exercises its assertion. Preserve full base/overlay builds where the assertion needs integration behavior. See `test/content.test.ts`, `baseBuild`, `baseRegistry` and `withBase`. For #318, neither whole-tree scan guard fits under one test timeout: parsing is spread across per-file cases, and mutation checks reuse the collected graph instead of re-collecting it. See `test/inputLiterals.test.ts` and `test/simulationFingerprint.test.ts`, `mutateSimulationSource`.

Import-time work is spread across the graph. Avoid runtime-import splits or prefilters because expected savings are small against bundle and coverage risk. Revisit either only if BR asks for it.
