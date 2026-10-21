---
read_if:
  - you plan or pick up work on the things suite or on retiring gungen
  - you wonder what remains before `gungen/` can be deleted
  - you decide where a shared concept, schema field or tool UI part belongs
  - you move the engine's export layer, the material data or mass out of gungen or the engine
  - you change the recipe defining the gun tool's reproduction exit
  - you continue the non-gun slice or migrate shared visuals and handling datums
---

# WORK

The plan to reach the goal in `things/README.md`: a shared core, a thing authoring tool and
a gun authoring tool that together replace `gungen/`. Delete this file when gungen is gone.

## Starting facts

Why each boundary matters, and where it is checked:

- The engine stays domain-neutral so that each consumer can change its own data and rules
  without the engine knowing; the neutral-name check is `packages/engine/test/engineImportBoundary.test.ts`,
  `forbiddenDomainIdentifiers`.
- Import edges between packages are enforced by `packages/engine/test/engineImportBoundary.test.ts`,
  `packageEdges`. Deadvox must not import the engine or export package, so the game's
  dependency graph stays free of authoring geometry (see `things/WORK.md`, "Decisions").
- Neutral fields have one definition in `packages/thing-core/src/schema.ts`,
  `NeutralModelSchema`. Deadvox composes them with the gun pack's named block in
  `packages/deadvox/src/core/schema.ts`, `ModelSchema`; `GunModelSchema` owns the
  firearm and attachment contract.
- Gungen's output must keep validating against deadvox's schema: `test/gungen-deadvox-contract.test.mjs`,
  "gungen exports satisfy deadvox model validation".

## To check before relying on it

- Which parts of gungen's viewer are generic and which are gun-specific; settled when the gun
  tool phase moves gun code onto the shared packages.
- How validation, collision and the viewer rebuild scale with part count; no benchmark exists,
  so measure before optimising.
- The smallest benchmark set to add before the thing tool adds load.

## Aim

One neutral, shared model envelope lets Deadvox consume every tool's output without
making the core know which kind of thing it describes. See
`packages/thing-core/src/schema.ts`, `NeutralModelSchema`, and
`packages/deadvox/src/core/schema.ts`, `ModelSchema`. Domain packs own their extensions;
sharing a field requires an intentional promotion rather than leaking one pack's vocabulary
into another.

## Decisions

Settled:

- A shared core serves two tools, a thing authoring tool and a gun authoring tool; the gun
  tool succeeds gungen, and gungen is deleted at the end.
- No package under `packages/` imports from gungen, because gungen is deleted at the end.
- `thing-core` imports no package but the engine, so the core stays free of gun modules and
  of the tools above it. Domain packs extend the schema without the core knowing.
- Deadvox imports nothing from the engine. The game reads exported per-part mass and
  centre-of-mass numbers and never loads the engine's shapes, so the engine's geometry stays
  out of the game's dependency graph.
- The model schema is one neutral schema owned by `thing-core`; domain packs extend it, each
  in a named block of its own (`packages/thing-core/README.md`, "Contract").
- Materials are one table of content in `thing-core` (`packages/thing-core/README.md`,
  "Contract").
- Atoms have authored mass and assemblies sum their parts; the tools author a closed set of
  items rather than generate them (`things/README.md`, "Rules").
- Until gun parts become items in the gun tool phase, their authored masses come from one
  gungen table keyed by part family and variant
  (`gungen/PROJECT.md`, "Attachments and export"). A shared part then has one value, and the
  table already has the shape of the closed item set, so the gun tool phase turns its keys
  into item ids.
- An assembly's export carries each part's mass and centre of mass, and an export package
  above `thing-core` writes them with the GLB and the model entry (`things/README.md`,
  "Rules"; `things/README.md`, "Packages").
- Every thing is an assembly; `thing-core` gives a single-part thing a short helper that
  wraps its one part. Export, mass and preview then have one path, the setup is written
  once, and a single-part thing can gain parts later without a rewrite. See
  `packages/thing-core/src/singlePart.ts`, `singlePart`.
- Each thing-tool item has its own row and model entry, even when several items reuse a
  family builder and geometry. Its authored mass then has one home, with no exception for
  shared visuals, and a later independent look needs no migration. See
  `packages/thing-authoring-tool/src/catalogue.ts`, `ToolItem`.
- The thing tool authors grip, hold and roll against its geometry so reshaping a handle
  also moves its hand datum; Deadvox keeps gameplay fields rather than a second geometry
  authority. This governs families with handling datums in the remaining-families phase.
- Engine family and parameter types serve non-gun parts, so the thing tool needs no
  parallel assembly schema. See `packages/thing-authoring-tool/src/catalogue.ts`, `buildItem`.
- The engine ends at assembly; export belongs above the neutral core so material and model
  contracts cannot pull dependencies back into geometry (`packages/engine/README.md`, "Layers").
- The thing authoring tool owns non-gun family policy above the shared packages, so
  neither the engine nor the core knows its item kinds. Its home is
  `packages/thing-authoring-tool/README.md`.
- The directory structure is fixed before any new feature work.
- Packages live in the top-level `packages/` directory, each a workspace of the root
  package. Gungen stays at the root until the gun tool phase, so it moves once, under its
  new name.
- At pre-pre-alpha no old format is kept alive; only deadvox validating and loading every
  export is owed.
- Work is tracked in this file and GitHub issues, with no work-item prefix until open
  question 2 is answered. Each phase may keep a short-lived task
  file in `things/`, deleted when the phase merges.

The open questions below remain unsettled.

## Target structure

The package homes follow `things/WORK.md`, "Decisions". The gun tool is refactored in
place and moves once at the phase 5 exit, avoiding two live implementations and keeping
packages from importing gungen.

| Area | Home |
|---|---|
| Math, conventions, RNG | `packages/engine/foundation` |
| Solids, mesh, volume, collision | `packages/engine/shapes` |
| Parts, ports, templates, resolving, validation, generation | `packages/engine/assembly` |
| Material table, anchors, neutral model envelope | `thing-core` |
| GLB and model-entry writing, per-part mass and centre of mass | the export package |
| Scene, camera, parameter panel, URL state | `packages/tool-ui` |
| Generic parts and rules | `packages/thing-authoring-tool` |
| Gun parts, rules, cycling, ammo UI | `packages/gun-authoring-tool` |
| Gameplay and content fields | `deadvox` |

Imports run one way: foundation, shapes, assembly, thing-core, the export package, tools.
Deadvox depends on `thing-core` for the schema and on nothing above it.

## Open questions

1. Where parts shared by both tools live (a turned stock, for instance).
2. Which work-item prefix the things packages use, beside `g`, `d`, `m` and `r` in
   `AGENTS.md`, "Work item IDs"; the close-out phase writes the answer into `AGENTS.md`.

## Phases

1. **Neutral schema and material table — complete.**
   A shared envelope and content-owned materials keep tools and the game from defining
   competing contracts. See `packages/thing-core/src/schema.ts`, `NeutralModelSchema`;
   `packages/thing-core/src/materials.ts`, `MATERIALS`; and
   `test/gungen-deadvox-contract.test.mjs`, "gungen exports satisfy deadvox model validation".
2. **Export package and physical model — complete.**
   The engine ends at assembly so the game can consume authored mass and placed centres
   without loading authoring geometry. Atoms read their item weight; gun bodies sum authored
   part-table masses and fitted child items keep their own weight. See
   `packages/thing-export/README.md`, "Physical model";
   `gungen/src/gun/physical.jsonnet`, `partMasses`; and
   `packages/deadvox/src/core/items.ts`, `typeWeightGrams`.
3. **Thing tool, first slice — complete.** Tape, thread, cord and fuse atoms plus a
   multi-part desk lamp share the source-to-preview and export path. The lamp proves that the single-part helper's users
   can gain parts, and that non-gun parts carry summed mass and a weighted centre without
   a competing item weight. The remaining-families phase then starts on an exercised path.
   Reproducible source ownership keeps the shipped binaries from silently diverging; see
   `packages/thing-authoring-tool/exports/deadvox.jsonnet` and
   `test/things-deadvox-contract.test.mjs`.
4. **Thing tool, remaining families.** Family by family, each with source, GLB, entry and
   load test together. The compass keeps its dedicated display renderer.
5. **Gun tool.** Move gungen's gun and ammo logic onto the shared packages as an authoring
   tool: its parts become a closed set of deadvox items, each atom with an authored mass, and
   a gun is an assembly of them. The gungen part mass table's rows become those items.
   Exit: the gun tool reproduces and validates the consumption boundary authored in
   `gungen/exports/deadvox.jsonnet`. An explicit recipe keeps retirement from overlooking
   exports that are not guns; see `gungen/src/cli/exportRecipe.ts`, `loadExportRecipe`.
6. **Retire gungen.** Retire residual names and references after the single phase 5 move;
   rename the retained consumption contract atomically with its CI invocation so the gate
   never disappears.
7. **Close out.**
   - Run the closing docs pass.
   - Move every decision here that outlives the plan into `things/README.md` or the owning
     package's README, because a lasting rule must survive this file's deletion.
   - Then delete this file and every cue that points to it, and update `AGENTS.md` for the
     new layout and work-item prefix.

## Checks that run throughout

- Deadvox validates and loads every export; this contract is the only compatibility owed.
- Each phase lands as reviewed PRs, with docs trimmed to the current rule.
