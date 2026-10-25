---
read_if:
  - you work in `things/`
  - you wonder why gungen is being replaced, or where a modeling primitive belongs
  - you decide which tool or package a new model-authoring feature goes in
  - you decide where mass, export or model-entry writing code goes
  - you decide whether an item's mass is authored or summed from its parts
  - you decide whether a gun is a real-gun look-alike, an invented gun or a gungen archetype
---

# things

Authoring tools for every model deadvox draws, built on one shared core.

## Packages

The suite's packages live in the repository's top-level `packages/` directory, as workspaces
of the root package.

- `packages/thing-core`: the shared modeling core, with no knowledge of any kind of thing.
- `packages/thing-authoring-tool`: authors and curates the non-gun things (tools, containers,
  food, the compass and so on) on top of the core.
- `packages/gun-authoring-tool`: authors and curates guns on top of the shared packages.
  It owns the authored firearm sources and consumption recipe.
- An export package above the core: writes the GLB, the model entry and each part's mass
  and centre of mass for both tools. Placing a centre of mass needs the engine's shapes, and
  deadvox loads the core, so this code needs a home deadvox doesn't load. With one writer,
  every tool's exports load the same way, and a second format has an obvious home.

Both tools depend on the core and the export package, and never on each other.
`WORK.md`, "Phases" orders the work that creates and integrates them.

## Why

Every kind of thing needs a reproducible authoring source rather than only a committed
binary or a fallback box. Shared mechanisms let the tools use one model contract while
gun rules stay out of tools that do not need them. Separate authoring tools keep that
domain ownership explicit.

Retiring residual gungen names must not lose a consumer export or a pending feature's
reason. `things/WORK.md`, "Phases" tracks retirement and close-out.

## Rules

- Gun-specific logic (archetypes, bore, sights, action, attachment fit, firearm model-entry
  fields) lives in the gun tool, never in the core.
- The core stays free of rendering libraries so either tool, and tests, can use it headless.
- An atom, an item not made up of other items, has an authored mass. An assembly's mass is
  the sum of its parts' masses. Shape volume and material density are unreliable mass
  sources: not every part is one material, and real shapes are more complex than the
  authored solids. Summing still gives any assembly a total and a centre of mass, so
  removing or swapping a part is a subtraction.
- The gun tool authors guns; it does not generate variants of an archetype. A gun is a
  designed look-alike of a real gun or an invented, sci-fi gun, and the gun tool's author
  is free to draw either. The inherited generic archetypes remain authored sources, not
  a restriction on real-model resemblance. A new gun is authored as an item rather than
  added as another archetype.
- The tools are authoring tools, not generators: each exports a closed set of items, so
  every atom it draws has a mass someone authored. The gun tool's parts (barrels, receivers
  and so on) are such items.
- An assembly's model entry carries each part's mass and centre of mass. The tools place each
  centre from the part's shapes, and deadvox sums the entries and never loads shapes, so the
  engine stays out of the game.
- Every export must validate and load in deadvox; `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility" names the contract.
