---
read_if:
  - you plan or pick up work on the things suite or on retiring gungen
  - you wonder which gungen names remain to retire
  - you decide where a shared concept, schema field or tool UI part belongs
  - you move the engine's export layer, the material data or mass out of gungen or the engine
  - you change the recipe defining the gun tool's reproduction exit
  - you turn gun parts into Deadvox items
  - you continue the non-gun slice or migrate shared visuals and handling datums
---

# WORK

The plan to reach the goal in `things/README.md`: a shared core, a thing authoring tool and
a gun authoring tool that together replace gungen. Delete this file at close-out.

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
- Neither authoring tool imports its peer, and lower packages and Deadvox cannot import
  the gun tool, so content ownership cannot reverse the shared dependency layers.
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
- Gun part masses live in one gun-tool catalogue whose items carry their full construction;
  a design's part names an item and sets only its placement. A part of a design not yet
  converted takes its mass from the row its params match, until the gun tool phase gives
  every row an item (`packages/gun-authoring-tool/PROJECT.md`, "Attachments and export"; `things/WORK.md`,
  "Phases").
- Gun parts are items only: each exports and registers in Deadvox as a loose item, but the
  player cannot take a gun apart or assemble one yet. Dis/assembly comes later with its own
  design and tests (#1040), so item identity lands without player mechanics.
- Where gun part shapes differ, each shape is its own item, such as a plain and a threaded
  barrel, sharing build helpers but not identity, each with its own weight. A part then
  looks and weighs the same loose and fitted, and its mass is authored once.
- A different finish of the same gun part shape is also its own item. Each item fixes one
  look and one mass, so it looks and weighs the same loose and fitted, and one item per
  finish needs no new mechanism. The accepted cost is that each new finish of an existing
  shape adds a catalogue item and a loose model.
- A fitted part's item reference travels on the assembly's physical part, so there is no
  separate composition record to keep in step with the parts. Deadvox checks that the
  named item exists and weighs what the part does. See
  `packages/thing-core/src/schema.ts`, `ModelPartSchema`, and
  `packages/deadvox/src/core/content.ts`, `checkModelPartItems`.
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
- A carried item may leave its datum out and take Deadvox's default hold; the tool authors a
  datum only where the default looks wrong at a look in game. A datum that reproduces the
  default adds work and a second value to keep in step without changing what the player sees.
- Engine family and parameter types serve non-gun parts, so the thing tool needs no
  parallel assembly schema. See `packages/thing-authoring-tool/src/catalogue.ts`, `buildItem`.
- The engine ends at assembly; export belongs above the neutral core so material and model
  contracts cannot pull dependencies back into geometry (`packages/engine/README.md`, "Layers").
- The thing authoring tool owns non-gun family policy above the shared packages, so
  neither the engine nor the core knows its item kinds. Its home is
  `packages/thing-authoring-tool/README.md`.
- The directory structure is fixed before any new feature work.
- Packages live in the top-level `packages/` directory, each a workspace of the root
  package. The gun tool has one implementation and one recipe authority, with no forwarding
  package or old-path alias.
- At pre-pre-alpha no old format is kept alive; only deadvox validating and loading every
  export is owed.
- Work is tracked in this file and GitHub issues, with no work-item prefix until open
  question 2 is answered. Each phase may keep a short-lived task
  file in `things/`, deleted when the phase merges.

The open questions below remain unsettled.

## Target structure

The package homes follow `things/WORK.md`, "Decisions". The single gun-tool move keeps
one implementation and one authored-source owner.

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
   part masses and fitted child items keep their own weight. See
   `packages/thing-export/README.md`, "Physical model";
   `packages/gun-authoring-tool/src/gun/catalogue.jsonnet`, `parts`; and
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
5. **Gun tool — complete.** Gun and ammo policy, authored sources, tests and lasting
   reasons have one home in `packages/gun-authoring-tool`. Recipe designs use closed part
   items with standalone geometry, consumer records and assembly references; a mass row
   alone is not item identity. Other designs convert from mass rows when needed, because
   converting the whole corpus is not required to reproduce the consumer boundary.
   The recipe, not the design files, is the boundary because designs omit companions;
   see `packages/gun-authoring-tool/exports/deadvox.jsonnet`,
   `packages/gun-authoring-tool/src/cli/exportRecipe.ts`, `loadExportRecipe`, and
   `test/gungen-deadvox-contract.test.mjs`, "registers every recipe export in the full base and keeps each gun companion inside the recipe".
   No root gungen directory remains. Phase 6 retains only names: the root contract and
   gun workflow, launcher presentation and controls, exporter metadata and consumer output
   directory, plus dead old-name support in the engine boundary test and zero-drift scanner,
   boundary/scanner fixtures and `GUNGEN_SWEEPS`. These do not preserve a second
   implementation. The retirement audit and deferred ownership transfer follow
   `things/TASK-gun-tool.md`, "Phase 5: complete".
6. **Retire gungen.** Retire residual names and references after the single phase 5 move;
   rename the retained consumption contract atomically with its CI invocation so the gate
   never disappears.
7. **Close out.**
   - Add the standalone part view; it is not a phase 5 reproduction requirement.
   - Run the closing docs pass.
   - Move every decision here that outlives the plan into `things/README.md` or the owning
     package's README, because a lasting rule must survive this file's deletion.
   - Then delete this file and every cue that points to it, and update `AGENTS.md` for the
     new layout and work-item prefix.

## Checks that run throughout

- Deadvox validates and loads every export; this contract is the only compatibility owed.
- Each phase lands as reviewed PRs, with docs trimmed to the current rule.
