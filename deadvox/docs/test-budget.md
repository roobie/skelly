---
read_if:
  - you're reviewing why a slow Deadvox unit test samples less work while retaining its property
  - you're considering further changes to the default Deadvox unit suite
---

# Default Deadvox test work

The host-specific suite budget and measurement method belong in the host notes. This document records the tradeoffs made when the default suite exceeded that budget: reduce repeated work without changing worker policy or assertions that define the protected property, and keep any timeout proportional to its work.

`test/mesher.test.ts` keeps the complete face-set comparison against its independent culling oracle while sampling fewer incidental layouts. Its focused cases continue to exercise isolated blocks, merging, borders, winding, and ambient occlusion. `test/occlusion.test.ts` likewise keeps the brute-force comparison for every merged-quad corner while sampling fewer random terrains; focused empty-floor, corner, overhang, border, and downward-face cases remain.

`test/hamlet.test.ts` retains shuffled-order generation comparison and the cross-chunk tree check, alongside the stress-city order check. It no longer repeats reverse-order generation or another hamlet seed, so it does not claim broad order or seed coverage. `test/zombies.test.ts` shortens the idle/stroll horizon but still checks replay, independent random streams, leash limits, and both movement modes. Its dismemberment sweep keeps real fist, crowbar, and bat cases plus the synthetic 20 and 40 N·s samples for the top-end ratio check; it drops 2 N·s and synthetic cases stop at first touchdown. Keeping 20 adds one short touchdown simulation, while real weapons still settle and retain launch/rest bounds. `test/severedEnergy.test.ts` continues to cover real-bat impact energy and dissipation.

`test/content.test.ts` shares immutable base-registry results where inputs are identical. File-local schema-error cases no longer rebuild the full base pack; the base-content check and merged-reference cases still validate against it.

`test/snapshotTestSupport.ts` generates fixture columns lazily. Ordinary codec and focused scheduler/interruption tests use a smaller hamlet slice rather than copying the full world into every runtime. The deep active-rest state/audio comparison, state-omission check, edited-hamlet round-trip, and representative long-save workload retain the full fixture. In `test/snapshot-continuation.test.ts`, dedicated interruption cases still verify persistence, while the deep whole-state continuation comparison is limited to active rest. In `test/snapshot-format.test.ts`, the edited-hamlet save still exercises encoding, decoding, restored continuation, key-order canonicalization, and interruption restoration; it avoids a second source fixture and redundant encoding passes. `encodeSave` calls `validateVersion`, which rejects a non-HASH `simulationHash` or `canonicalHash`, and `decodeSave` requires a non-empty `buildRevision`; the ten-hour test exercises these guards through its default encode and decode.

These reductions narrow sampled layouts, repeated setup, and duplicate scenario coverage; they do not change simulation, handling, or save-format behavior. Further reductions should name the coverage relinquished and identify the remaining check that catches the relevant defect before they are made.
