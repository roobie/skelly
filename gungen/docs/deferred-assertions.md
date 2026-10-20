---
read_if:
  - you tune attachment physical inputs from published product comparisons
  - you decide when attachment mass figures can become pinned assertions
  - you review geometry snapshots or exact seeded outputs in generator tests
---

# Deferred assertions

Attachment masses are class estimates, not fixed product replicas. Exact outputs stay
unpinned until BR approves the physical assumptions, because geometry choices must not be
presented as measured product weights. Recompute through `src/gun/physical.ts`,
`gunModelParts`, and compare against the sources beside `src/gun/physical.jsonnet`, `roles`.
The density relation is protected with fixture materials in
`packages/thing-export/test/physical.test.ts`, "uses material density as a mass relation for identical geometry".

The exported flashlight is only a mount, so it cannot be compared with a complete weapon light until a flashlight-body export exists. This is a boundary on the comparison, not a reason to infer the missing mass.

## Geometry decomposition and seeded output

Receiver-solid names, exact port dimensions and random-number sequences are not persisted-format contracts. Pinning them would freeze implementation and tuning rather than protect a usable export. Only an approved stable export or generation contract justifies exact-output assertions.

Fit, source-derived bounds, coupled clearance and same-seed determinism remain the acceptance properties; see `test/boltCarrier.test.ts`, `test/boltExport.test.ts`, and `test/generate.test.ts`. These checks protect feasibility and repeatability without requiring a particular mesh decomposition or a particular sequence of generated designs.
