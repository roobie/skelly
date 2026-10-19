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

What the engine is, from reading its module headers and exports:

- `engine/` is a domain-agnostic parametric assembly framework. A `Domain` supplies part
  families, units, palette and rules as data, and the engine supplies the rest: solids and
  collision geometry, meshing and revolve, parts, ports and templates, resolving, rules and
  validation, seeded generation, design persistence and GLB export. Its three.js scene lives
  above it, in `packages/tool-ui`.
- Only gungen imports it; deadvox and mobgen do not. It has no tests of its own, so gungen's
  suite is what exercises it.
- Its package exports each layer folder (`foundation`, `shapes`, `assembly`, `export`), and
  consumers deep-import individual files; nothing marks a public API. Each layer imports only
  itself and the ones before it, which `gungen/test/engineImportBoundary.test.ts`,
  `engineLayers`, enforces.
- A search for gun vocabulary in it finds none.
- Material in it is appearance only: a material id maps to a color. Density and mass are
  computed inside gungen (`gungen/src/gun/attachmentMass.ts`, with sourced density tables),
  and deadvox item weights are typed by hand in content JSON.
- Deadvox's model schema (`deadvox/src/core/schema.ts`, `ModelSchema`) mixes neutral fields
  with firearm ones, and gungen's output is tied to it by one root contract test
  (`test/gungen-deadvox-contract.test.mjs`) rather than a shared schema.
- Gungen's viewer mixes generic parts (parameter panel, camera and URL state, design editor)
  with gun-specific ones (ammo, cycle and magazine views); the split is judged from file
  names and has not been read through.

## To check before relying on it

- Whether gun vocabulary hides in the engine's neutral names, such as the palette's
  archetype finishes and the appearance context's variant.
- Whether `PartFamily` and `ParamSpec` already work as family builders for non-gun things.
- Whether single-part things fit the assembly framework or need a lighter path.
- How validation, collision and the viewer rebuild scale with part count; no benchmark exists,
  so measure before optimising.
- What the engine needs tested on its own, and the smallest benchmark set to add before the
  thing tool adds load.
- Whether the layer check should cover the packages above the engine. It covers the engine's
  own layers and rejects an engine import of `packages/tool-ui`; nothing yet stops
  `thing-core` or a tool from importing a gun module, or a package from importing against
  the order below.

## Aim

One neutral, shared model schema. `thing-core` owns it as neutral interfaces: file,
transform, grip and hold, anchors, slots, attachments, emissive material, materials and
physical properties. Deadvox consumes it and the tools produce it; domain packs extend it
with their own fields (a gun's calibre and magazine, for example) without the core knowing.

## Decisions

Settled:

- A shared core serves two tools, a thing authoring tool and a gun authoring tool; the gun
  tool succeeds gungen, and gungen is deleted at the end.
- The model schema is one neutral schema owned by `thing-core`; domain packs extend it.
- The directory structure is fixed before any new feature work.
- New packages live in the top-level `packages/` directory, each a workspace of the root
  package. The four existing projects stay where they are; #962 tracks moving them under
  `packages/` too, in a repo-wide move on its own branch once few PRs are open.
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
| Math, conventions, RNG | `engine/foundation` |
| Solids, mesh, volume, collision | `engine/shapes` |
| Parts, ports, templates, resolving, validation, generation | `engine/assembly` |
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
