---
read_if:
  - you're reviewing why the default Deadvox unit suite was reduced
  - you're changing the solver behind corpse or severed-limb coverage
  - you're revisiting a cut after a budget overrun or related defect
  - you're measuring suite growth between milestones
  - you're changing content-scaling route, start-phase admission or chunk-order test work
  - you're changing base-registry or bundled-startup fixture construction or its isolation
  - you're writing a test that admits base content, overlays it or reads authored Jsonnet definitions
---

# Default Deadvox unit-suite reductions

The suite keeps its worker policy and timeout rules; reductions target repeated or incidental work while preserving an assertion for each protected property. Absolute wall time depends on host capacity, so this document tracks milestone growth rather than a host-specific budget.

## Retained coverage

- Narrower mesher samples retain `test/mesher.test.ts`, "draws the same faces as plain face culling (random mixed-density chunk)"; narrower occlusion samples retain `test/occlusion.test.ts`, "gives every merged-quad corner the per-vertex value (random terrain)".
- Idle/stroll timing needs a sustained sample rather than an exhaustive horizon; see `test/zombies.test.ts`, "uses seeded idle and straight stroll intervals during a sustained sample". Dismemberment needs both impulse-ordered flight and bounded launch energy: monotonic but unbounded motion would still throw limbs implausibly far. See `test/zombies.test.ts`, "scales launch distance monotonically through fixture impulses", and `test/severedEnergy.test.ts`, "clamps application points and spin for region, random-roll, head-cut and off-ray debris".
- Content admission is guarded by `test/content.test.ts`, "base content has no issues". Save continuation is covered by `test/snapshot-continuation.test.ts`, "deeply matches N steps with K/save/load/N−K (active rest)"; `test/snapshot-continuation.test.ts`, "preserves an active-sleep interruption emitted between frames across save/load"; `test/snapshot-continuation.test.ts`, "preserves a pending sleep interruption across a paused snapshot and load". Edited-world format coverage remains in `test/snapshot-format.test.ts`, "round-trips an edited fixture column byte-exactly and continues deterministically from restored bytes".
- Save/scheduler fixture reductions also retain `test/snapshot-continuation.test.ts`, "detects omission of simulation, world, scheduler, inventory, and audio state". These named tests protect the properties for which incidental full-world fixture coverage was removed.

Revisit a cut only when an issue reports a related defect or suite overrun; restore the case that protects that property and link the trigger. Do not broaden fixtures or assert drifting content to compensate.

## Content-scaling route checks

Isolate city route alternatives so content additions do not accumulate into one timing failure and failures identify the affected alternative. See `test/cityKitRoutes.test.ts`, `cityAlternatives`.

For production chunk-order checks, native deep equality avoids matcher traversal dominating generation and stamping without weakening full-data comparisons. See `test/scenarioCertificate.test.ts`, `stampProbeCells`.

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
authored plan makes a service-cell and turn sweep irrelevant, and each lab level is
authored whole, with no furnishing alternatives to substitute. Focused obstruction cases
use the same start-proof owner. A shared read-only compiled plan is safe only
when each obstruction probe owns fresh route-space and entity state; a clear probe
must not reuse an obstructed probe's memoized geometry. See `test/scenarioStart.test.ts`,
`certificate`; and `src/core/scenarioCertificate.ts`, `scenarioStartCertificate` and
`scenarioCertificate`.

Queued lock operations exercise runtime placement and key ownership, not whole-pack
admission. Their fixture patches an admitted registry so unrelated scenario certification
cannot consume the test's deadline; content admission stays at its own boundary. See
`test/locks.test.ts`, "carries independent locks through explicit bedroom and cellar placements into native queued door operations".
Origin-map equality uses native deep comparison so diagnostic matcher traversal does not
dominate a rejected-mod check. See `test/browserMods.test.ts`,
"refuses a missing mod id without admitting its definitions".

A test that needs which authored definitions a Jsonnet source contributes reads them
from the base registry by id rather than manifesting the source again: the base build
already admitted them, and a full manifest of a large source can outweigh the test's
own work. Because Jsonnet is lazy, a witness that names only ids and the values the
test needs skips the rest. See `test/fixtures/jsonnet/lab-witness.jsonnet` and
`test/scenarioCertificate.test.ts`, `witness`.

## Base-registry fixtures

Save and replay fixtures own a small authored world so a playable route's removal or redesign cannot erase persistence coverage. Foliage and adjacent spawn/furniture columns belong to that fixture, not to a sandbox entry point. See `test/fixtures/snapshotSite.ts`, `SnapshotSite`, and `test/snapshotTestSupport.ts`, `createRuntime`.

Gameplay tests and their shared helpers need validated content, not repeated admission of the same base pack during every file's import. Use the run's snapshots for unchanged base inputs, including helpers that select a single tuning row; keep independent builds where admission or an overlay is the behavior under test. Otherwise a small helper can silently multiply full-pack validation across its importers. Deserialize a fresh object graph for each caller; do not share mutable registries or disable file isolation. See `test/baseRegistrySetup.ts`, `setup`; `test/baseRegistry.ts`, `baseRegistry`; and `test/senseFixture.ts`, `BASE_SENSE_TUNING`. Run-owned temporary storage prevents concurrent runs from replacing each other's content or interrupting a snapshot read.

A file that only reads base content does not assert the base build's issues; global setup refuses a base pack with issues, and `test/content.test.ts`, "base content has no issues", is the guard. An overlay that changes only definitions the game reads at run time, such as a skill's practice amount, patches a copy of the snapshot rather than admitting the pack again. See `test/meleeTraining.test.ts` and `test/unpacking.test.ts`, `fixture`.

Content-admission and overlay tests still build their own inputs. Gameplay and configuration tests also need the bundled startup result's winning origins, not another admission pass during import. Preserve that result in a separate snapshot because bundled source paths differ from the base-registry fixture's source paths. See `test/baseRegistrySetup.ts`, `writeBaseRegistry` and `test/baseRegistry.ts`, `startupContent`. Both fixtures deserialize per caller so mutating a map, nested definition or admission result cannot leak between callers.

Fixture fidelity and nested mutation isolation are checked separately in `test/baseRegistry.test.ts`; no gameplay assertion is removed when a file switches fixture construction. Compare the complete startup graph with a boolean deep comparison: constructing an assertion error containing both full registries can stall failure reporting, hiding an isolation defect behind a hung test.

## Milestone growth

Compare the previous milestone's merge commit with the new head using three interleaved default-suite runs per head, each in its own isolated run. Treat median growth beyond the run-to-run spread as an overrun, and record the per-file deltas. Absolute duration may move with host load; it is not evidence of milestone regression by itself.

A registry check admits the smallest source that exercises its assertion: a full base admission costs the same whatever the check reads, so a case that re-admits the pack for one file's rows multiplies that cost by its cases. A check that looks for one issue must still fail to find it without the mutation. Preserve full base/overlay builds where the assertion needs integration behavior. See `test/content.test.ts`, `baseBuild`, `baseRegistry` and `withBase`. Neither whole-tree scan guard fits under one test timeout: parsing is spread across per-file cases, and mutation checks reuse the collected graph instead of re-collecting it. See `test/inputLiterals.test.ts` and `test/simulationFingerprint.test.ts`, `mutateSimulationSource`.

Import-time work is spread across the graph. Avoid runtime-import splits or prefilters because expected savings are small against bundle and coverage risk. Revisit either only if BR asks for it.
