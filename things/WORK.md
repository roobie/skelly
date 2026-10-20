---
read_if:
  - you plan or pick up work on the things suite or on retiring gungen
  - you wonder what remains before `gungen/` can be deleted
  - you decide where a shared concept, schema field or tool UI part belongs
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
  `packageEdges`. Deadvox must not import the engine, so the game's dependency graph stays free
  of the engine's geometry (see `things/WORK.md`, "Decisions").
- Deadvox's model schema mixes neutral and firearm fields, which is why the neutral envelope
  moves into `thing-core`: `packages/deadvox/src/core/schema.ts`, `ModelSchema`.
- Gungen's output must keep validating against deadvox's schema: `test/gungen-deadvox-contract.test.mjs`,
  "gungen exports satisfy deadvox model validation".

## To check before relying on it

- Whether gun vocabulary hides in the engine's neutral names, such as the palette's
  archetype finishes and the appearance context's variant.
- Which parts of gungen's viewer are generic and which are gun-specific; settled when phase 4
  moves gun code onto the shared packages.
- Whether `PartFamily` and `ParamSpec` already work as family builders for non-gun things.
- Whether single-part things fit the assembly framework or need a lighter path.
- How validation, collision and the viewer rebuild scale with part count; no benchmark exists,
  so measure before optimising.
- The smallest benchmark set to add before the thing tool adds load.

## Aim

One neutral, shared model schema. `thing-core` owns it as neutral interfaces: file,
transform, grip and hold, anchors, slots, attachments, emissive material, materials and
physical properties. Deadvox consumes it and the tools produce it; domain packs extend it
with their own fields (a gun's calibre and magazine, for example) without the core knowing.

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
- The model schema is one neutral schema owned by `thing-core`; domain packs extend it.
- The directory structure is fixed before any new feature work.
- Packages live in the top-level `packages/` directory, each a workspace of the root
  package. Gungen stays at the root until the gun tool phase, so it moves once, under its
  new name.
- At pre-pre-alpha no old format is kept alive; only deadvox validating and loading every
  export is owed.
- Work is tracked in this file and GitHub issues, with no work-item prefix until open
  question 6 is answered. Each phase may keep a short-lived task
  file in `things/`, deleted when the phase merges.

Proposed, not settled: the target structure below, the layer split inside the engine, and
every answer to an open question. Move an item up here once it is decided.

## Target structure (proposed)

| Area | Home |
|---|---|
| Math, conventions, RNG | `packages/engine/foundation` |
| Solids, mesh, volume, collision | `packages/engine/shapes` |
| Parts, ports, templates, resolving, validation, generation | `packages/engine/assembly` |
| Materials, mass and center of mass, anchors, neutral model envelope | `thing-core` |
| GLB and model-entry serialization | with the package that owns the format's inputs |
| Scene, camera, parameter panel, URL state | `packages/tool-ui` |
| Generic parts and rules | `thing-authoring-tool` |
| Gun parts, rules, cycling, ammo UI | `gun-authoring-tool` |
| Gameplay and content fields | `deadvox` |

Imports run one way: foundation, shapes, assembly, thing-core, tools. Deadvox depends on
`thing-core` for the schema and on nothing above it.

## Open questions

1. Where appearance lives. The GLB writer needs colors, `thing-core` owns materials, and
   the engine cannot import upward; so either colors stay low and materials reference them,
   or the writer takes resolved colors only.
2. How domain packs extend the schema (composition, or an extension block), and which of
   the attachment and compatibility fields in deadvox's model schema are mechanism and which are gun content.
3. Whether single-part things use the assembly framework or only shapes, materials and export.
4. Whether to add an export package now or keep each format with its inputs until a second
   format exists.
5. Where parts shared by both tools live (a turned stock, for instance).
6. Which work-item prefix the things packages use, beside `g`, `d`, `m` and `r` in
   `AGENTS.md`, "Work item IDs"; the close-out phase writes the answer into `AGENTS.md`.

## Phases

1. **Neutral schema and physical model.** Define the envelope in `thing-core`, make
   deadvox's model schema build on it, move material densities and mass derivation out of
   gungen, and point the contract test at the shared schema. Exit: one definition of each
   neutral field.
2. **Thing tool, first slice.** One non-gun family end to end: source, build, GLB, model
   entry, validation and load in deadvox, viewed in the tool. Exit: those models replace
   their committed binaries.
3. **Thing tool, remaining families.** Family by family, each with source, GLB, entry and
   load test together. The compass keeps its dedicated display renderer.
4. **Gun tool.** Move gungen's gun and ammo logic onto the shared packages. Exit: every
   gungen export deadvox consumes is reproduced by the gun tool and validates.
5. **Retire gungen.** Switch CI, scripts and docs, then delete `gungen/` and its contract test.
6. **Close out.** Run the closing docs pass, delete this file, and update `AGENTS.md` for the
   new layout and work-item prefix.

## Checks that run throughout

- Deadvox validates and loads every export; this contract is the only compatibility owed.
- Each phase lands as reviewed PRs, with docs trimmed to the current rule.
