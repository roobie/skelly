---
read_if:
  - "you scope or review the gun-tool retirement gate of issue #509"
  - you transfer issue ownership to the gun tool after the package move
---

# Gun tool and retirement

This is the retirement gate for `things/WORK.md`, "Phases", under #509.
Delete this task file when retirement merges; lasting reasons belong in the owning
package docs rather than a completed task sequence.

## Phase 5: complete

The gun implementation, authored sources, tests and still-valid docs have one owner: the
asset submodule's
`packages/skelly-assets/tools/packages/gun-authoring-tool`,
with no skelly copy, forwarding package or second recipe authority
(`docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "Decision"). The retained
old names are the exporter metadata and the consumer output directory, both written by the
asset release, so skelly's readers keep them until a pin bump renames them. Phase 6 also
retires the dead old-name support in the submodule's
`packages/skelly-assets/tools/packages/construct/test/constructImportBoundary.test.ts`,
`rootsUnder`, `importTarget` and its canary fixtures, and the gun tool's
`GUNGEN_SWEEPS`. None is a second authoring implementation or an old source-path alias.

The consumption boundary is the gun tool's
`packages/skelly-assets/tools/packages/gun-authoring-tool/exports/deadvox.jsonnet`,
interpreted by its
`packages/skelly-assets/tools/packages/gun-authoring-tool/src/cli/exportRecipe.ts`,
`loadExportRecipe`. Reproduction means refreshing consumer assets and records from those
authored inputs, not byte identity.

Recipe designs reference closed part items; placement does not create identity. The editor
requires item-backed body parts before export; see the gun tool's
`packages/skelly-assets/tools/packages/gun-authoring-tool/src/viewer/designExport.ts`,
`exportEditorDesign`. File and recipe export still use the matching mass row for a body
part that names no item, until its design is converted (#509); see its
`packages/skelly-assets/tools/packages/gun-authoring-tool/src/gun/physical.ts`,
`gunModelParts`. Retirement does not depend on converting the remaining corpus because
the consumption recipe's designs name items. See its
`packages/skelly-assets/tools/packages/gun-authoring-tool/src/gun/catalogue.ts`,
`loadPartCatalogue`.
Gameplay disassembly remains deferred to #1040. Shared camera and parameter mechanisms belong in tool-ui;
gun selection and presentation remain caller policy.

CARRY_ALL on #509 transfers ownership without implementing or closing the backlog.
The open issues #333, #362, #414, #447 and #649 belong to the gun tool under their own numbers.
Deferred geometry reasons travel with the gun tool's
`packages/skelly-assets/tools/packages/gun-authoring-tool/src/gun/parts.ts`,
`magazineGeometryFor`, and
`packages/skelly-assets/tools/packages/gun-authoring-tool/docs/decisions/0001-calibre-driven-sizing.md`.
Construct motion remains construct work and separately carded work stays separate.

## Invariants

`test/guns-deadvox-contract.test.mjs` is the gun tool's consumption contract. Its population is the pinned gun rows the
bundled packs consume from the external root, read through the pack reader, not a copied
inventory. The comparison with each pinned manifest row (path, part nodes, credits),
registry validation and GLTF loading remain alongside the specialised motion checks;
see `test/model-export-sync.mjs`, `readCutOver` and `assertPinnedRow`.
Preserve `test/things-deadvox-contract.test.mjs` independently.

Neither tool imports its peer; lower packages and Deadvox cannot import the gun tool.
See the submodule's
`packages/skelly-assets/tools/packages/construct/test/constructImportBoundary.test.ts`,
`packageEdges`. Shared construct
shapes are not shared authored parts: an actual cross-tool authored part needs BR's
ownership decision rather than duplication or promotion into the neutral core.

## Phase 6: retirement gate

**Depends on:** the complete phase 5 reproduction exit.

Retire residual names only after the replacement proves the entire consumption boundary.
Do not delete useful tests or pending feature reasons merely because they use an old name.

**Exit:** the asset release renames the retained old names and a pin bump moves skelly's
readers with them. Audit active scripts, workflows, Jsonnet imports, credits, docs and package metadata for old ownership.
Run root CI and site checks plus the recipe load/validation contract; the thing-tool
contract stays green. Resolve touched plan cues, delete this task file, and leave phase
7's lasting-decision transfer and prefix question explicitly open in `things/WORK.md`,
"Phases". No compatibility shim survives retirement.
