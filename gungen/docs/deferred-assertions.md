---
read_if:
  - you tune authored item or gun-part masses
  - you decide whether a mass assertion would freeze gameplay content
  - you review geometry snapshots or exact seeded outputs in generator tests
---

# Deferred assertions

Item and part masses are authored gameplay content, not geometry-derived product
specifications. Exact outputs stay unpinned so tuning does not freeze the closed item set.
Inspect the table in `src/gun/physical.jsonnet`, `partMasses`, and re-export through
`src/gun/physical.ts`, `gunModelParts`. Tests protect authoritative item weight and part
summation with their own fixtures instead of pinning production totals.

The exported flashlight is only a mount, so it cannot be compared with a complete weapon light until a flashlight-body export exists. This is a boundary on the comparison, not a reason to infer the missing mass.

## Geometry decomposition and seeded output

Receiver-solid names, exact port dimensions and random-number sequences are not persisted-format contracts. Pinning them would freeze implementation and tuning rather than protect a usable export. Only an approved stable export or generation contract justifies exact-output assertions.

Fit, source-derived bounds, coupled clearance and same-seed determinism remain the acceptance properties; see `test/boltCarrier.test.ts`, `test/boltExport.test.ts`, and `test/generate.test.ts`. These checks protect feasibility and repeatability without requiring a particular mesh decomposition or a particular sequence of generated designs.
