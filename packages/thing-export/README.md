---
read_if:
  - you change GLB or model-entry export, physical derivation or export identity
  - you add an authoring tool that exports neutral models
  - you change physical inputs or interpret exported mass and centres of mass
  - you share export recipes or file writing between authoring tools
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

## Recipe ownership

Tools own separate consumption recipes so retiring one cannot delete another tool's inputs.
The row contract, dispatch validation and output identity are shared to keep unsupported
selections from becoming silent omissions; see `src/recipe.ts`, `loadRecipe`. Node-only
file writing is separate from browser-safe geometry and preview code; see `src/files.ts`,
`writeRecipeExports`. Credits derive their file set from the same recipes through
`tools/jsonnet/lib/export-files.libsonnet`. The recipe-derived registration index avoids a
second list of models when content adds an export; see `src/files.ts`, `writeRecipeExports`.
A caller asks for the index only where a consumer reads it, so no unread generated file is
tracked; see `tools/refresh-deadvox.mjs`, `jobs`.
Consumer-authored projections can still select gameplay-specific physical boundaries; see
`packages/deadvox/src/content/base/models-items.jsonnet`, `authored`.

## Physical model

Atoms have authored mass because mixed materials and hidden internal shapes make a drawn
envelope an unreliable mass source. The tool supplies each body part's mass rather than a
density or fill. This package places geometric centres without changing those authored
values; see `src/physical.ts`, `PhysicalInputs`, `partProperties` and `modelParts`.

Geometric centres are volume-centroid estimates, not claims about internal material
layout. Hollows remain voids rather than becoming collision hulls, and empty geometry uses
the part origin as its reference point. Assembly centres weight the placed part centres
by authored mass, so a light part cannot pull the centre as much as a heavy one. See
`src/physical.ts`, `assemblyProperties`. Exported centres use the model-file frame in
metres; authored masses use kilograms.

Replaceable geometry belongs to the child item rather than the body's mass table. Its
item weight stays authoritative, so neither a host-specific mount envelope nor a shared
visual proxy can change an atom's mass. The gun table is
`gungen/src/gun/physical.jsonnet`, `partMasses`; its adapter is
`gungen/src/gun/physical.ts`, `gunModelParts`. Export refuses a body part without exactly
one matching row instead of guessing a mass.
