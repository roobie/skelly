---
read_if:
  - you change the vehicle authoring page or its Deadvox content loading
  - you change vehicle blueprint export or validation
  - you change how the page edits, saves or exports a blueprint
---

# Vehicle authoring tool

This browser page loads the vehicle blueprints from Deadvox base content and
edits one as a table, a row per fitting. The editing operations are plain
functions over the blueprint, apart from the page; see
`packages/vehicle-authoring-tool/src/editor.ts`, `createMirroredPair`. The export contract is in
`packages/deadvox/docs/vehicle-spike.md`, "Export contract".

## Table first, 3D next

The first editor is a table because BR picked it as the first iteration, with a
3D view to follow. The 3D view reuses the same operations.

## Save is a download to hand-merge

Authored vehicle source stays Jsonnet (`docs/jsonnet.md`, "Jsonnet authoring"),
so the page cannot write back into it. Save downloads the edited blueprint as
JSON (`packages/vehicle-authoring-tool/src/editor.ts`, `saveBlueprint`), and the
author merges the changed values into the Jsonnet by hand. A flat download
diverges from the source that made it wherever the source shares a value or
builds a mirrored pair, so the merge stays a manual step. Where the output lands
in the repository is a separate decision.

Export (`packages/vehicle-authoring-tool/src/editor.ts`, `checkedExport`)
downloads the content shape and is refused while Deadvox reports issues for the
edited blueprint.

## Mirror and pair

Toggling mirror on a fitting reflects its geometry about its own position and
changes nothing else. Moving a fitting to the other side of the vehicle is the
pair operation, which follows `pair` in
`packages/deadvox/src/content/base/vehicles.jsonnet`. The author chooses every
support, side and service name; the editor infers none of them from ids.
