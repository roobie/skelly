---
read_if:
  - "you scope or review the gun-tool retirement gate of issue #509"
  - you transfer gungen issue ownership after the package move
---

# Gun tool and retirement

This is the retirement gate for `things/WORK.md`, "Phases", under #509.
Delete this task file when retirement merges; lasting reasons belong in the owning
package docs rather than a completed task sequence.

## Phase 5: complete

The gun implementation, authored sources, tests and still-valid docs have one owner in
`packages/gun-authoring-tool`. The single move preserves history without a forwarding
package or a second recipe authority. No root gungen directory remains. The retained
names are the root consumption contract, the gun CI workflow, the launcher control and
presentation names, exporter metadata and the consumer output directory. Phase 6 also
retires the dead old-name support in `packages/engine/test/engineImportBoundary.test.ts`,
`rootsUnder`, `importTarget` and its canary fixtures; `tools/zero-drift-check.mjs`,
`SUBPROJECTS`; the zero-drift and Deadvox import-boundary fixtures; and `GUNGEN_SWEEPS`.
None is a second authoring implementation or an old source-path alias.

The consumption boundary is `packages/gun-authoring-tool/exports/deadvox.jsonnet`,
interpreted by `packages/gun-authoring-tool/src/cli/exportRecipe.ts`, `loadExportRecipe`.
Reproduction means refreshing consumer assets and records from those authored inputs,
not byte identity. Compiler, workspace, refresh, CI and Pages paths follow the package.
See `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`; `tools/refresh-deadvox.mjs`; and
`.github/workflows/pages.yml`.

Recipe designs reference closed part items; placement does not create identity. The editor
requires item-backed body parts before export; see
`packages/gun-authoring-tool/src/viewer/designExport.ts`, `exportEditorDesign`.
File and recipe export still use the matching mass row for a body part that names no
item, until its design is converted (#509); see
`packages/gun-authoring-tool/src/gun/physical.ts`, `gunModelParts`. Retirement does not
depend on converting the remaining corpus because the consumption recipe's designs name
items. See `packages/gun-authoring-tool/src/gun/catalogue.ts`, `loadPartCatalogue`.
Gameplay disassembly remains deferred to #1040. Shared camera and parameter mechanisms belong in tool-ui;
gun selection and presentation remain caller policy.

CARRY_ALL on #509 transfers ownership without implementing or closing the backlog.
The lead re-points #135, #333, #362, #364, #414, #447 and #649 without renumbering.
Deferred geometry reasons travel with `packages/gun-authoring-tool/src/gun/parts.ts`,
`magazineGeometryFor`, and
`packages/gun-authoring-tool/docs/decisions/0001-calibre-driven-sizing.md`.
Engine motion remains engine work and separately carded work stays separate.

## Invariants

Keep `test/gungen-deadvox-contract.test.mjs` under its retained name until retirement
renames it atomically with its CI invocation. Its population comes from the recipe,
including companions and parts, not a copied inventory. Credits, orphan detection,
registry validation and GLTF loading remain alongside the specialised motion checks;
see `test/model-export-sync.mjs`, `assertExportSynced` and `assertRecipeCredits`.
Preserve `test/things-deadvox-contract.test.mjs` independently.

Neither tool imports its peer; lower packages and Deadvox cannot import the gun tool.
See `packages/engine/test/engineImportBoundary.test.ts`, `packageEdges`. Shared engine
shapes are not shared authored parts: an actual cross-tool authored part needs BR's
ownership decision rather than duplication or promotion into the neutral core.

## Phase 6: retirement gate

**Depends on:** the complete phase 5 reproduction exit.

Retire residual names only after the replacement proves the entire consumption boundary.
Do not delete useful tests or pending feature reasons merely because they mention gungen.

**Exit:** rename the retained contract and update root CI atomically. Audit active
scripts, workflows, Jsonnet imports, credits, docs and package metadata for old ownership.
Run root CI and site checks plus the recipe load/validation contract; the thing-tool
contract stays green. Resolve touched plan cues, delete this task file, and leave phase
7's lasting-decision transfer and prefix question explicitly open in `things/WORK.md`,
"Phases". No compatibility shim survives retirement.
