---
read_if:
  - you change the vehicle authoring page or its Deadvox content loading
  - you change vehicle blueprint export or validation
  - you change how the page edits, saves or exports a blueprint
---

# Vehicle authoring tool

This browser page edits one Deadvox base-content vehicle blueprint as a table.
The operations live apart from the page in
`packages/vehicle-authoring-tool/src/editor.ts`, `createMirroredPair`.
The export contract is in
`packages/deadvox/docs/vehicle-spike.md`, "Export contract".

## Table first, 3D next

The first editor is a table because BR picked it as the first iteration, with a
3D view to follow. The 3D view reuses the same operations.

## Save is a download to hand-merge

Authored vehicle source stays Jsonnet (`docs/jsonnet.md`, "Jsonnet authoring"),
so the page cannot write back into it. Save
(`packages/vehicle-authoring-tool/src/editor.ts`, `saveBlueprint`) downloads
JSON for the author to merge by hand. A flat download diverges from the source
wherever the source shares a value or builds a mirrored pair, so the merge stays
a manual step.

## Export is checked

`packages/vehicle-authoring-tool/src/editor.ts`, `checkedExport`, refuses a
blueprint that Deadvox's schema or content checks reject, so the page never
downloads content Deadvox would drop.

## Pair choices are the author's

The pair operation follows `pair` in
`packages/deadvox/src/content/base/vehicles.jsonnet`. Deadvox cannot tell which
supports or dependents change sides, so every one is an explicit choice: the
dialog starts with none made and
`packages/vehicle-authoring-tool/src/editor.ts`, `pairChoicesFromForm`, refuses
any control left unset.
