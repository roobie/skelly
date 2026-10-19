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

- **Foundation:** `math`, `conventions`, `random`, and the `Issue` type from `issue`.
- **Shapes:** `solid`, `shapeTypes`, `geometry`, `revolve`, `mesh`, `display`.
- **Assembly:** `schema`, plus `template`, `resolve`, `rules`, `validate`,
  `generate`, `parseAssembly`, `motion`, `anchors`, `design`, `designLoader`.
- **Above the engine:** `glb` and `appearance` need a resolved assembly, so they are
  exporters; `engine/src/viewer/scene.ts` moves to the tool UI package.

## Known obstacles

- `design` mixes persistence, anchors, palette and export types, so it has to be split,
  not moved.

## Verifying no behavior change

Run from the repository root unless noted.

- Engine: its `typecheck` script, from `engine/`.
- Gungen: its `typecheck`, `test`, `validate` and `check:designs` scripts, from `gungen/`.
  The suite is the behavior check, since the engine has no tests of its own.
- Contract with deadvox: `test/gungen-deadvox-contract.test.mjs`, which the root `ci`
  script runs with the alias loader that `ci` names.
- Docs: `npm run check:zero-drift`.
- Cycles: no tool reports them yet; trace imports between the modules named above until
  the upward-import check lands, then rely on it.

Before the first move, run all of these once on a clean tree so later failures are known
to be new.

## Next, in order

- [x] Break the shapes cycle: `engine/src/core/shapeTypes.ts`, `TriangleMesh`, holds the result types that
  `geometry`, `revolve` and `mesh` shared.
- [x] Break the schema and resolve cycle: `engine/src/core/schema.ts`, `Resolved`, now holds
  the resolved-assembly types, because a `Rule` checks a `Resolved` and a `Resolved` holds its
  `Domain`; `resolve` imports them and `schema` imports nothing from `resolve`.
- [x] Split the solid types out of `schema`: `engine/src/core/solid.ts`, `Solid`, holds them
  and `DomainUnits`; `schema` imports from it, never the reverse.
- [ ] Split `design` along the layers above: persistence and suggest types stay in `design`,
  the anchor types go to `anchors`, and the palette and GLB export types go to a new
  `exportTypes` module above the engine.
- [ ] Move the files into layer folders and repoint every import, including gungen's.
- [ ] Add the check that fails an upward import, and run it in CI.
- [ ] Run gungen's typecheck, unit suite and `validate`; they must pass unchanged.
- [ ] Move the viewer to its own package once the root layout in #962 is decided.
