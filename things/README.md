---
read_if:
  - you work in `things/`
  - you wonder why gungen is being replaced, or where a modeling primitive belongs
  - you decide which tool or package a new model-authoring feature goes in
  - you decide where mass, export or model-entry writing code goes
  - you decide whether an item's mass is authored or summed from its parts
---

# things

Authoring tools for every model deadvox draws, built on one shared core.

## Packages

The suite's packages live in the repository's top-level `packages/` directory, as workspaces
of the root package.

- `packages/thing-core`: the shared modeling core, with no knowledge of any kind of thing.
- `packages/thing-authoring-tool`: authors and curates the non-gun things (tools, containers,
  food, the compass and so on) on top of the core.
- `packages/gun-authoring-tool`: authors and curates guns on top of the core; the successor
  to `gungen/`.
- An export package above the core: writes the GLB, the model entry and each part's mass
  and centre of mass for both tools. Placing a centre of mass needs the engine's shapes, and
  deadvox loads the core, so this code needs a home deadvox doesn't load. With one writer,
  every tool's exports load the same way, and a second format has an obvious home.

Both tools depend on the core and the export package, and never on each other.
`WORK.md`, "Phases" orders the work that creates and integrates them.

## Why

`gungen/` bundles general modeling (geometry, revolve, mesh, assembly, appearance, GLB
export, validation) with gun rules, so a thing that is not a gun has nowhere to be
authored and ends up as an unreproducible binary or a fallback box. Separating the general
part into a core lets every thing have a source that can be regenerated, and keeps gun
rules out of the tools that do not need them.

The end state is that `gungen/` is deleted and deadvox's models all come from these tools.
Removal waits on the gun-authoring tool reproducing every gungen export; `things/WORK.md` tracks the steps.

## Rules

- Gun-specific logic (archetypes, bore, sights, action, attachment fit, firearm model-entry
  fields) lives in the gun tool, never in the core.
- The core stays free of rendering libraries so either tool, and tests, can use it headless.
- An atom, an item not made up of other items, has an authored mass. An assembly's mass is
  the sum of its parts' masses. Deriving mass from shape volume and material density gave
  implausible weights: not every part is one material, and real shapes are more complex than
  the authored solids. Summing still gives any assembly a total and a centre of mass, so
  removing or swapping a part is a subtraction.
- The tools are authoring tools, not generators: each exports a closed set of items, so
  every atom it draws has a mass someone authored. The gun tool's parts (barrels, receivers
  and so on) are such items.
- An assembly's model entry carries each part's mass and centre of mass. The tools place each
  centre from the part's shapes, and deadvox sums the entries and never loads shapes, so the
  engine stays out of the game.
- Every export must validate and load in deadvox; `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility" names the contract.
