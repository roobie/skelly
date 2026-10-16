---
read_if:
  - you tune attachment mass from published product comparisons
  - you decide when attachment mass figures can become pinned assertions
  - you review geometry snapshots or exact seeded outputs in generator tests
---

# Deferred assertions

Attachment masses are class estimates, not fixed product replicas. Keep exact outputs unpinned until BR approves the material-density and fill assumptions; otherwise a geometry choice would be presented as a measured product weight. Recompute with `src/gun/attachmentMass.ts`, `attachmentMassKg`, and compare against its cited specifications.

The exported flashlight is only a mount, so it cannot be compared with a complete weapon light until a flashlight-body export exists. This is a boundary on the comparison, not a reason to infer the missing mass.

## Geometry decomposition and seeded output

Receiver-solid names, exact port dimensions and random-number sequences are not persisted-format contracts. Pinning them would freeze implementation and tuning rather than protect a usable export. Only an approved stable export or generation contract justifies exact-output assertions.

Fit, source-derived bounds, coupled clearance and same-seed determinism remain the acceptance properties; see `test/boltCarrier.test.ts`, `test/boltExport.test.ts`, and `test/generate.test.ts`. These checks protect feasibility and repeatability without requiring a particular mesh decomposition or a particular sequence of generated designs.
