---
read_if:
  - you move asset producers, authoring tools or their shared libraries between repositories
  - you consume shared models or rigs, choose pack homes or change clip representation
  - you change how a baked death clip starts, plays or settles
  - you update the asset release pin or submodule, or admit its outputs into a product
  - you change how admission learns an actor body's dimensions before figure files load
  - you change shared model licensing, turned-piece defaults or copied-model provenance
  - you change declared asset URL imports or Vite dependency scanning
---

# 10. Asset pipelines in skelly-assets

## Decision

Asset producers and their authoring tools belong in skelly-assets, while product
content, pack ownership and admission stay in skelly. Export recipes are pipeline
inputs and move with their exporters. This gives deadvox and arpg1 one shared asset
database and pipeline for a vast library of models and rigs, rather than separate
copies that drift.

Use a git submodule, not a second tracked copy, so each product revision selects an
explicit asset revision. Built output comes from that revision's CI release, not from
files tracked in skelly-assets: binaries in git grow history with every rebuild, cannot
merge and can drift from their source, while a release pins bytes immutably and has one
producer. The gitlink is the commit the pinned release tag points to, so the tool sources
skelly reads from the submodule and the built output it installs cannot drift apart. Setup
installs only the packs one of skelly's mods bundles, because the mods are the one list of
what skelly ships. Setup verifies each release archive's SHA-256 against the pin before
extracting it, downloading again when its archive cache holds missing or corrupted bytes,
so a restored cache can never install unverified content. See `tools/skelly-assets/release.json` and
`tools/skelly-assets/setup.mjs`, `assertGitlinkMatchesRelease`. Pipeline sources are
copies from skelly, with each package's source commit recorded in
`packages/skelly-assets/tools/README.md`; git history stays in skelly rather than being
rewritten into another repository. Shared thing-core has
one workspace instance and one root lockfile so tools and consumers resolve the same
contracts and materials.

Vehicle authoring lives with the other pipelines. Its schema checks stay with the
tool; skelly retains the blueprint admission contract test because admission belongs
to the game, not the exporter. Mobgen is a pipeline, not a Deadvox runtime
import: generated bodies, GLBs and clips cross the boundary as data, while per-tick
composition, injury, ragdolls and rendering remain runtime mechanisms. The viewer's
ragdoll stage is removed rather than carrying a game-runtime dependency into the
pipeline. Fused-mass carving hides cells of the loaded GLB, and deadvox builds flesh
walls for each hole at runtime from the rest grid the actor already holds. The loaded
GLB alone cannot show a hole's inside, so a hole would show the world through it;
walls built from the grid show flesh on every side of the pit with no full remesh and
no mobgen runtime import. See `packages/presentation/src/render/holeWalls.ts`,
`holeWallGeometry`.

## Shared production and content homes

A model either product uses has one source row, one builder and one output at
`built/<packId>/<logical path>`, released in its pack's archive and installed at that
path in the submodule. Keep no hand copy beside a
producer. A consumer that wants a model bundles its pack and reads the same bytes
as every other consumer; no product must bundle the entire library. This makes the
same models usable homogeneously by deadvox and arpg1, rather than merely keeping
similar-looking copies in a shared repository. The notebook gets a producer too:
a copied GLB with no producing row is not part of a shared build pipeline.

Every directory under the external built root names the content pack that declares
its files, never a product that reads them. A product-named directory forces another
reader to bundle that product's name and makes the model shared in name only. See `packages/skelly-assets/tools/layout.mjs`, `outputPath`,
and `packages/skelly-assets/models/recipes/`, `packages/skelly-assets/models/export.json` and
`packages/skelly-assets/models/mobs.json`.

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
together in `skelly.arcana`, including the top despite its garment form. The
`packages/skelly-assets/models/recipes/` files own the selection; these are model
homes, not a requirement to author playable items. A model may be admitted without
an item that places it.

## One format, pose

Bake a rig once into the `pose` representation, with root translations and local
quaternion rotations and composable action clips. Every consumer composes the same
clips the same way; coordinate-facing adjustments belong to the consumer's scene,
not a second bake. Two representations of one source are two outputs that cannot
be read alike, defeating the one-output rule. See
`packages/skelly-assets/tools/actorBake.mjs`, `bakeActor`, and
`packages/skelly-assets/tools/actorCompose.mjs`.

## Canonical baked fall

Deadvox plays baked clips only, because asset pipelines live in skelly-assets, so
an actor's death fall is authored once there. The fall leaves the living pose by
blending onto the baked death clip across the clip's first frame interval, then plays
the clip and holds its last frame, so every corpse of one figure and direction
settles in the same pose. Per-kill variation in the settled corpse is given up for
that. See `packages/presentation/src/render/corpsePose.ts`, `corpseFallPose`.

## Shared appearance and replacement

Adopt produced exports instead of holding differing tool-model copies beside them.
Turned pieces share a library-wide eight-flat default, with authored side counts
taking precedence and `sides: null` opting into round geometry. This replaces a
look determined by a model's origin with a consistent library look while preserving
authoring control. See
`packages/skelly-assets/models/item-settings.libsonnet`, `turnedSides`, and
`packages/skelly-assets/tools/packages/thing-authoring-tool/src/families/compound.ts`, `compound`.

Delete a copy as duplicate elimination only when its producer equals it. A differing
copy may instead leave as an approved replacement, with its byte difference and
side-by-side render reported. Retain that render evidence with the asset PR because
consumer cutovers need a comparator after the copies are deleted. This distinguishes
an intentional shared-export look from an unnoticed change.

## Staged admission

Declare and ship only released files needed by admitted content rows. The rest of
the pinned release may remain installed without declarations; files outside that
release still fail the orphan check. Library growth must not impose hashing, config,
build or deploy work on content that does not consume it. See
`tools/jsonnet/lib/built-pack.libsonnet`, `consumed`,
`packages/deadvox/tools/readBundledPacks.ts`, `readAvailablePacks`, and
`docs/git-workflow.md`, "Shared asset pin bumps".

Narrow eager URL imports before Vite processes assets, because filtering a URL map
at runtime cannot undo emitted files or inlined model payloads. Placeholder globs
must remain valid relative wildcard globs: Vite's dependency scanner reads raw product source
without the asset pre-transform. Keep dependency discovery enabled; scanning does
not need model URLs, but a failed scan interrupts dependency pre-bundling and can
invalidate running browser requests. See
`packages/deadvox/tools/declaredAssetGlobsPlugin.ts`, `declaredAssetGlobsPlugin`, and
`packages/deadvox/test/devDependencyScan.test.ts`.
Consumer cutovers keep declarations, credits and selected bytes together, so a model
is never admitted without its files or shipped without a claim.

Actor figures are admitted by declared pack file path. A figure row holds its key
and the paths of the body and clips files its pack declares from the pinned build
manifest; see `tools/jsonnet/lib/built-pack.libsonnet`, `figures`. The bytes then
have one copy, declared once and changed only by pin bumps, with no tracked compiled
copy and no eager startup bundle, so a changed model reaches the game fast. The
browser registry checks only that every drawn seed has a row; the body, clips and
actor type checks run in Node, in `validate` and the stack actor contract test; see
`packages/engine/src/core/content.ts`, `actorFigureFileIssues`. The cost
accepted: the browser checks no figure bytes at admission, and URL mods cannot add
figures, because they carry content only and cannot declare files.

Figure files load per session start. Before a session is created, the game fetches
and decodes the body and clips of every figure row the selected stack's registry
holds, and the decoded map travels with the registry into the session; see
`packages/presentation/src/presentation/play.ts`, `startPlay`, and
`packages/engine/src/core/actorFigureFiles.ts`. Node reads the same files
synchronously through the pack reader. Fetching what the stack uses keeps load time
scaling with the stack, not with the whole model catalogue, which will grow to
thousands of models. A changed model is fetched fresh at the next session start, so
changing a model and seeing the change stays fast. The simulation never sees fetch
timing, because every figure is resolved before the first tick. The cost accepted: a
session start is asynchronous, and each entry path has a load error path.

A fused mass's spawn envelope lives in content. The browser reads no figure bytes at
content load, yet admission checks that templates, map kits and layouts spawn an
amalgam clear of walls, so admission takes the body's dimensions from the actor type's
`spawnEnvelope`. Node holds that copy to the pinned body's collision box, so the two
cannot drift: a pin bump that changes the box fails `validate` until the content is
updated. See `packages/engine/src/core/spawnClearance.ts`, `actorBodyDimensions`, and
`packages/engine/src/core/content.ts`, `actorFigureFileIssues`. The cost accepted: the
envelope is copied by hand, because the build manifest carries no body bounds.

The shared worn family fits the shared player body, not generated mob bodies;
fitting it over generated bodies requires its own development round. The paper-sheet
and folded-note models still have no producer, and no closure is decided for that
gap. These limits are not proof that the entire shared-library goal is met.

## Licence scopes

Models and built assets remain CC-BY-NC-SA-4.0, released archives included;
pipeline tools, the showcase and workflow code remain EUPL-1.2. Keeping those scopes
separate preserves the models' non-commercial terms without relicensing the tools.
Installing the release at the submodule's built path keeps that path's licence entry
true without a second scope for downloaded files. See `REUSE.toml` and
`packages/skelly-assets/REUSE.toml`.
