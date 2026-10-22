---
read_if:
  - you change GLB or model-entry export, physical derivation or export identity
  - you add an authoring tool that exports neutral models
  - you change physical inputs or interpret exported mass and centres of mass
  - you share export recipes or file writing between authoring tools
  - you change or judge voxelized export
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

## Voxelized export

A recipe row may opt into `voxelGrain`, which replaces its smooth meshes with a greedy
voxel mesh sampled at that grain. Rows without the option export as before, so only the
rows whose look is being judged change. The sampler lives here because this package may
not import deadvox's mesher; see `src/voxelize.ts`, `voxelize`, and `src/glb.ts`,
`voxelPrimitivesFor`. Which rows opt in is still being judged on screen, so the
selection stays an explicit list in each recipe.

Two grains, both content values: a coarse one for vehicles, furniture and the parts made
to attach to them, and 1 cm for every other item or component. A vehicle part must match
the grain of the vehicle it sits on, while a tool, a can or a rifle drawn at that grain
collapses to a few voxels. A row picks its class, never a number, so one tuning moves a
whole class. See `tools/jsonnet/lib/voxel-grains.libsonnet`, and the recipes
`packages/thing-authoring-tool/exports/deadvox.jsonnet` and `gungen/exports/deadvox.jsonnet`.

Every part's voxels sit on one lattice shared by the whole model, not on a lattice of the
part's own. Parts are placed at fractions of a voxel, and voxels from different lattices
leave steps and gaps where parts meet, so a receiver, a handguard and a magazine well stop
reading as one body. A part turned by a quarter turn shares the lattice too; one turned by
any other angle keeps its own. See `src/glb.ts`, `latticeOrigin`, and `src/voxelize.ts`,
`voxelize`.

A solid thinner than the grain keeps one voxel of thickness instead of vanishing, because
glass, blades and sheet parts are thin by design and losing them breaks the item; the cost
is that they draw thicker than authored.

A voxelized model replaces the smooth one in place rather than shipping beside it: two
files per model would need a selector and a second registration for no consumer that
wants the smooth one.

Per-voxel wear on these meshes is open: a greedy-merged mesh no longer has the grid that
wear edits.

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

Baked collision is one placed bounding box per solid, opted into per recipe row. Boxes
are conservative, so a consumer may collide early but never passes through a solid, and
they stay cheap for a solver to test. Only an export with part masses can carry them,
because collision belongs to the parts whose mass it moves. See `src/physical.ts`,
`collisionBoxes` and `modelParts`.

Replaceable geometry belongs to the child item rather than the body's mass table. Its
item weight stays authoritative, so neither a host-specific mount envelope nor a shared
visual proxy can change an atom's mass. The gun table is
`gungen/src/gun/physical.jsonnet`, `partMasses`; its adapter is
`gungen/src/gun/physical.ts`, `gunModelParts`. Export refuses a body part without exactly
one matching row instead of guessing a mass.
