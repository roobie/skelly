---
read_if:
  - you continue the directory restructure in phase 1 of `things/WORK.md`
  - you need to know what is done, in flight or next in that restructure
---

# TASK

Tracks phase 1 of `things/WORK.md`: restructure with no behavior change. Delete this file
when the phase is merged, and start a new one for the next effort.

## Goal

The engine is split by layer, each layer importing only the ones below it. Gungen's
typecheck and suite pass unchanged, and a check fails any import that runs upward.

## Layers and where each engine module falls

Each layer is a folder under `engine/src`, imported as `@skelly/engine/<folder>/<module>.ts`.

- **`foundation`:** `math`, `conventions`, `random`, and the `Issue` type from `issue`.
- **`shapes`:** `solid`, `shapeTypes`, `geometry`, `revolve`, `mesh`, `display`.
- **`assembly`:** `schema`, plus `template`, `resolve`, `rules`, `validate`,
  `generate`, `parseAssembly`, `motion`, `anchors`, `design`, `designLoader`.
- **`export`, above the engine:** `glb`, `appearance` and `exportTypes` need a resolved
  assembly, so they are exporters; `engine/src/viewer/scene.ts` moves to the tool UI package.

## Known obstacles

- Files that mix layers must be split before they move; none remain after the `design` split.

## Verifying no behavior change

Run from the repository root unless noted.

- Engine: its `typecheck` script, from `engine/`.
- Gungen: its `typecheck`, `test`, `validate` and `check:designs` scripts, from `gungen/`.
  The suite is the behavior check, since the engine has no tests of its own.
- Contract with deadvox: `test/gungen-deadvox-contract.test.mjs`, which the root `ci`
  script runs with the alias loader that `ci` names.
- Docs: `npm run check:zero-drift`.
- Layers: the upward-import check in `gungen/test/engineImportBoundary.test.ts`,
  `engineLayers`. It does not report cycles inside one layer.

Before the first move, run all of these once on a clean tree so later failures are known
to be new.

## Next, in order

- [x] Break the shapes cycle: `engine/src/shapes/shapeTypes.ts`, `TriangleMesh`, holds the result types that
  `geometry`, `revolve` and `mesh` shared.
- [x] Break the schema and resolve cycle: `engine/src/assembly/schema.ts`, `Resolved`, now holds
  the resolved-assembly types, because a `Rule` checks a `Resolved` and a `Resolved` holds its
  `Domain`; `resolve` imports them and `schema` imports nothing from `resolve`.
- [x] Split the solid types out of `schema`: `engine/src/shapes/solid.ts`, `BoxSolid`, holds them
  and `DomainUnits`; `schema` imports from it, never the reverse.
- [x] Split `design` along the layers above: persistence and suggest types stay in `design`,
  the anchor types live in `anchors`, and the palette and GLB export types live in
  `engine/src/export/exportTypes.ts`, `GlbExportInput`, above the engine.
- [x] Move the files into layer folders and repoint every import, including gungen's.
- [x] Add the check that fails an upward import, and run it in CI: it lives in
  `gungen/test/engineImportBoundary.test.ts`, `engineLayers`, so gungen's unit suite runs it.
- [x] Run gungen's typecheck, unit suite and `validate`; they must pass unchanged.
- [ ] Move the viewer to its own package once the root layout in #962 is decided.
