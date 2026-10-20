---
read_if:
  - you change GLB or model-entry export, physical derivation or export identity
  - you add an authoring tool that exports neutral models
  - you change physical inputs or interpret exported mass and centres of mass
---

# thing-export

Exports sit above the engine and `thing-core` so model formats can use geometry and the
neutral contract without making either depend on authoring tools. This package may import
those packages, but never a tool. Deadvox reads the neutral contract, not this package or
engine geometry. See `packages/engine/test/engineImportBoundary.test.ts`, `packageEdges`.

Generator identity and metadata namespaces stay caller-owned so tools do not inherit each
other's identity. See `src/exportTypes.ts`, `GlbExportInput`. Construction choices and
appearance profiles remain independent: changing a finish must not change an assembly.
See `packages/engine/src/assembly/template.ts`, `Template.variantParams`, and
`src/exportTypes.ts`, `AppearanceContext`.

## Physical model

Shape-derived mass and centres of mass belong here rather than in a domain adapter or the
game. Tools supply physical geometry, material assignments and fill assumptions; appearance
profiles are not physical inputs. See `src/physical.ts`, `PhysicalInputs` and `modelParts`.
Geometric integration uses the engine's shapes and math; material densities come from
`packages/thing-core/src/materials.ts`, `MATERIALS`.

Exported physical centres use the model-file frame in metres, after assembly placement; masses use
kilograms. Deriving both from the same material-weighted volume prevents a compound part's
centre from becoming an unweighted average. Hollows remain voids rather than becoming
collision hulls. Empty physical geometry contributes no mass, with its reference point at
the part origin. See `src/physical.ts`, `partProperties`.

A material density or fill is a modeling assumption, not proof of a measured product mass.
Keep sources with the domain's physical inputs and keep exact outputs unpinned until their
accuracy is approved. The gun policy is `gungen/src/gun/physical.jsonnet`, `roles`; its adapter is
`gungen/src/gun/physical.ts`, `gunModelParts`. Canonical attachment geometry preserves an
item's physical identity when a host-specific mount envelope changes its presentation.
