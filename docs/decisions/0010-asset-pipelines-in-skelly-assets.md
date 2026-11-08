---
read_if:
  - you move asset producers, authoring tools or their shared libraries between repositories
  - you consume shared models or rigs, choose pack homes or change clip representation
  - you update the asset submodule pin or admit its outputs into a product
  - you change shared model licensing, turned-piece defaults or copied-model provenance
---

# 10. Asset pipelines in skelly-assets

## Decision

Asset producers and their authoring tools belong in skelly-assets, while product
content, pack ownership and admission stay in skelly. Export recipes are pipeline
inputs and move with their exporters. This gives deadvox and arpg1 one shared asset
database and pipeline for a vast library of models and rigs, rather than separate
copies that drift. The asset move precedes further framework extraction so the
runtime is not extracted around tool dependencies that are about to disappear; see
`docs/decisions/0009-content-defined-products.md`, "Refactor gate".

Use a git submodule, not a second tracked copy, so each product revision selects an
explicit asset revision. Copy pipeline sources from the refactor tree, recording the
source commit per package in the submodule's [tools/README.md](https://github.com/roobie/skelly-assets/blob/main/tools/README.md); git history stays in
skelly rather than being rewritten into another repository. Shared thing-core has
one workspace instance and one root lockfile so tools and consumers resolve the same
contracts and materials.

Vehicle authoring moves with the other pipelines. Its schema checks stay with the
tool; skelly retains the blueprint admission contract test because admission belongs
to the game, not the exporter. Mobgen becomes a pipeline, not a Deadvox runtime
import: generated bodies, GLBs and clips cross the boundary as data, while per-tick
composition, injury, ragdolls and rendering remain runtime mechanisms. The viewer's
ragdoll stage is removed rather than carrying a game-runtime dependency into the
pipeline. Fused-mass carving operates on the loaded GLB, without generated hole walls,
so consuming a baked body does not require runtime voxel remeshing.

## Shared production and content homes

A model either product uses has one source row, one builder and one output at
`built/<packId>/<logical path>` in the submodule. Keep no hand copy beside a
producer. A consumer that wants a model bundles its pack and reads the same bytes
as every other consumer; no product must bundle the entire library. This makes the
same models usable homogeneously by deadvox and arpg1, rather than merely keeping
similar-looking copies in a shared repository. The notebook gets a producer too:
a copied GLB with no producing row is not part of a shared build pipeline.

Every directory under the external built root names the content pack that declares
its files, never a product that reads them. A product-named directory forces another
reader to bundle that product's name and makes the model shared in name only. See the submodule's [tools/layout.mjs](https://github.com/roobie/skelly-assets/blob/main/tools/layout.mjs), `outputPath`,
and [models/recipes/](https://github.com/roobie/skelly-assets/tree/main/models/recipes),
[models/export.json](https://github.com/roobie/skelly-assets/blob/main/models/export.json) and
[models/mobs.json](https://github.com/roobie/skelly-assets/blob/main/models/mobs.json).

A pack groups one coherent kind of content. The roster's `skelly.bolt-guns` and
`skelly.armour` stay separate from `skelly.firearms` and `skelly.wearables`: a sci-fi
bolt gun and a modern carbine are different content even if both are guns, so one
id would mislabel both. The creature roster belongs in `skelly.bestiary`, not in
the pack of Deadvox enemy types, whose identities can overlap it.

Port the copied catalogue rows and their helpers into the shared producers rather
than retaining producerless copies or dropping the looks arpg1 uses. Place the
ported rows by kind: head wear and worn garments in `skelly.wearables`, hand tools
in `skelly.hand-tools`, arms in `skelly.melee`, the torch in `skelly.light-sources`,
cookware in `skelly.containers` and the oven door in `skelly.structures`. Keep
`binder_top`, `crystal_butt_wand`, `crystal_socket_wand` and `rune_clay_tablet`
together in `skelly.arcana`, including the top despite its garment form. The submodule's
[models/recipes/](https://github.com/roobie/skelly-assets/tree/main/models/recipes)
files own the selection; these are model
homes, not a requirement to author playable items. A model may be admitted without
an item that places it.

## One format, pose

Bake a rig once into the `pose` representation, with root translations and local
quaternion rotations and composable action clips. Every consumer composes the same
clips the same way; coordinate-facing adjustments belong to the consumer's scene,
not a second bake. Two representations of one source are two outputs that cannot
be read alike, defeating the one-output rule. See the submodule's
[tools/actorBake.mjs](https://github.com/roobie/skelly-assets/blob/main/tools/actorBake.mjs),
`bakeActor`, and [tools/actorCompose.mjs](https://github.com/roobie/skelly-assets/blob/main/tools/actorCompose.mjs).

## Shared appearance and replacement

Adopt produced exports instead of holding differing tool-model copies beside them.
Turned pieces share a library-wide eight-flat default, with authored side counts
taking precedence and `sides: null` opting into round geometry. This replaces a
look determined by a model's origin with a consistent library look while preserving
authoring control. See
[tools/packages/thing-authoring-tool/items.jsonnet](https://github.com/roobie/skelly-assets/blob/main/tools/packages/thing-authoring-tool/items.jsonnet),
`turnedSides`, and
[tools/packages/thing-authoring-tool/src/families/compound.ts](https://github.com/roobie/skelly-assets/blob/main/tools/packages/thing-authoring-tool/src/families/compound.ts),
`compound`.

Delete a copy as duplicate elimination only when its producer equals it. A differing
copy may instead leave as an approved replacement, with its byte difference and
side-by-side render reported. Retain that render evidence with the asset PR because
consumer cutovers need a comparator after the copies are deleted. This distinguishes
an intentional shared-export look from an unnoticed change.

## Staged admission

The initial submodule pin contains model exports but no actor entries under its
built root. Keep that pin until the PR that admits actor data also declares those
files: a later asset revision can otherwise expose unclaimed files to the external
root's orphan check. Consumer cutovers change declarations, metadata and bytes
together, so a model is never admitted without its files or exposed without a claim.
See `docs/git-workflow.md`, "Shared asset pin bumps".

The shared worn family fits the shared player body, not generated mob bodies;
fitting it over generated bodies requires its own development round. The paper-sheet
and folded-note models still have no producer, and no closure is decided for that
gap. These limits are not proof that the entire shared-library goal is met.

## Licence scopes

Models and built assets remain CC-BY-NC-SA-4.0; pipeline tools, the showcase and
workflow code remain EUPL-1.2. Keeping those scopes separate preserves the models'
non-commercial terms without relicensing the tools. See `REUSE.toml` and
the submodule's [REUSE.toml](https://github.com/roobie/skelly-assets/blob/main/REUSE.toml).
