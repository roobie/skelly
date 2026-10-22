---
read_if:
  - you change GLB or model-entry export, physical derivation or export identity
  - you add an authoring tool that exports neutral models
  - you change physical inputs or interpret exported mass and centres of mass
  - you share export recipes or file writing between authoring tools
  - you change or judge voxelized export
  - you give an item, attachment or round its own voxel grain
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

Every model exports as a greedy voxel mesh, and the recipe loader refuses a row that
names no voxel class. One export path means no model stays smooth beside voxel ones, and
no flag or list decides which models are drawn which way. The sampler lives here because
this package may not import deadvox's mesher; see `src/recipe.ts`, `RowSchema`,
`src/voxelize.ts`, `voxelize`, and `src/glb.ts`, `voxelPrimitivesFor`.

Four grains, all content values: a coarse one for vehicles, furniture and the parts made
to attach to them; a fine one for firearms and their magazines; a middle one for every
other item or component; and a finest one for fine-detail parts. A vehicle part must match
the grain of the vehicle it sits on, while a tool or a can drawn at that grain collapses to
a few voxels. A gun needs its own because its small controls are detail at a few
millimetres that the item grain cannot hold, and a magazine shares its gun's grain so a
seated magazine matches the receiver's voxels. A sight notch or post is only a few
millimetres wide, so the gun grain fills a notch and a post hides behind its neighbours;
the finest grain gives those parts voxels small enough to keep them.

Each class gives the default grain, and an item may name a finer or coarser one. One grain
per class cannot fit every item: an attachment mounts beside a finer receiver, and a round
is smaller than a few item voxels. The item's own definition names it, beside a one-line
reason, because that definition is where the item's look is authored; a recipe holds no
list of exceptions. The recipe compiles the resolved grain into each row, so the exporter
and the contract tests read one explicit value. See `tools/jsonnet/lib/voxel-grains.libsonnet`,
`of`, and the recipes `packages/thing-authoring-tool/exports/deadvox.jsonnet` and
`gungen/exports/deadvox.jsonnet`.

A part asks for the finest grain by carrying a tag in its definition, so the choice sits
with the part's content and the exporter holds no list of part names. See `src/glb.ts`,
`VOXEL_DETAIL`, and `gungen/src/gun/parts.ts`, where the sight parts carry it. Every
grain, an item's own included, must be a whole multiple of the finest, because every lattice is anchored at the
same world origin and the grains then nest: each coarse voxel face lies on a fine voxel
face, so a sight still meets the receiver and the gas tube without steps or gaps. The
exporter refuses grains that do not nest; see `src/glb.ts`, `checkNesting`.

Every part's voxels sit on one lattice shared by the whole model, not on a lattice of the
part's own. Parts are placed at fractions of a voxel, and voxels from different lattices
leave steps and gaps where parts meet, so a receiver, a handguard and a magazine well stop
reading as one body. A part turned by a quarter turn shares the lattice too; one turned by
any other angle keeps its own. See `src/glb.ts`, `latticeOrigin`, and `src/voxelize.ts`,
`voxelize`.

An iron sight line runs between the voxel tops the file draws, and the muzzle sits on the
drawn front of the barrel, not on the smooth design, because voxels move the points the
player lines up and the shot leaves from. The up vector is made perpendicular to that
line, since the game aligns the model's up to the camera's. An optic keeps its optical
axis, which no drawn top defines. See `gungen/src/gun/exportGlb.ts`, `sightMetadata` and
`drawnMuzzle`.

Grip, flame and other anchors, collision boxes and centres of mass stay on the authored
solids. They feed simulation rather than the eye, and a box snapped outward to the
lattice no longer fits the cargo spaces it was authored to fill, so a drawn surface may
stand up to one voxel off them.

No solid or stretch of a solid vanishes. Any stretch thinner than the grain, such as a
whole sheet, a guard's bar or a tube's wall, keeps one voxel of thickness, and a solid that
no sample line crosses keeps the cells its surface meets, because glass, blades, sheet
parts and small rounds are thin or small by design and losing them breaks the item; the
cost is that they draw thicker or blockier than authored. A solid's size says nothing about
how thin its stretches are, so every solid is sampled along all three axes. See
`src/voxelize.ts`, `fillSource`.

A voxelized model keeps every part that connects to another part connected, because a
model whose joining parts drop out reads as floating pieces, not as one object. Voxels
touch only face to face, so pieces whose solids meet can still come out touching only at an
edge or a corner, or a cell apart. Those pieces are joined through the cells their surfaces
meet, inside a part and across to the parts beside it; solids that do not meet stay apart.
See `src/voxelize.ts`, `bridge`, and `src/glb.ts`, `neighboursOf`.

A voxelized model replaces the smooth one in place rather than shipping beside it: two
files per model would need a selector and a second registration for no consumer that
wants the smooth one.

Voxelized parts show no wear until g89 lands. Wear recolours or removes faces at runtime,
and a greedy-merged mesh no longer has the grid it edits. g89 adds a second meshing mode
that gives wear one quad per exposed voxel face, and deadvox's face-to-voxel wear to act on
it; wear then works at any export grain without extra data. The price is heavier files and
more triangles.

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
