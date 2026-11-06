---
read_if:
  - you model a one-off prop, weapon or other held thing quickly, outside a catalogue batch
  - you add a worn armour or clothing set with its own worn shells, or a helmet or hat
  - you check a worn set on the player figure
---

# Quick models and worn sets

How to get a new held thing or a worn set from an idea to the screen in few rounds. Each trap below cost a round
when it was not known.

## A held thing

Build the thing from compound pieces in one rows file, with the helpers in `compound.libsonnet`. Iterate on its
look with `tools/model-look.mjs` and that rows file: it draws front, side, top and three-quarter tiles in about a
second, with no export and no dev server, so settle the proportions there first. A first pass at a heavy weapon
tends to come out long and slim; judge it from the three-quarter tile, not the side view alone.

Keep an experiment in `experiments/`. Nothing imports that folder, so the build and the game skip it until a row
moves into a catalogue batch.

## A worn set

Each worn piece comes from a template in `worn-fit.libsonnet`. A template returns the worn shells, the figure's
placements and a `ground` piece list; `h.lifted` in `compound.libsonnet` brings the worn shells onto the floor, so
the ground model and the worn look are one shape. Then:

- add the entry to `catalogue/worn.libsonnet`, wrapping the template in `suit` when the ground model is built from
  the worn shells;
- add the Deadvox item in `packages/deadvox/src/content/base/items-wearables.libsonnet`, taking its figure
  placements from the fitted entry;
- add a look to `packages/deadvox/src/debug/wardrobe.ts`, `looks`, to see the set on the figure.

A helmet or hat is a rigid model on the head: see `worn-fit.libsonnet`, `head`. Author its face towards +z and
set its base against the top of the neck. A model too short to cover the hair takes a taller `fit`, not a higher
base, which only bares the neck.

## Traps

- A compound prism must be convex. Split a chevron, a U-shaped collar or any notched outline into convex pieces.
- Each prism axis reads its outline in its own coordinate order: see `compound.libsonnet`, `prism`.
- Jsonnet has no `local` between the `for` clauses of a comprehension; index the loop value instead.
- Use only existing finishes. The palette is shared by every batch, so a new finish collides on merge.
- A measure in `bust-measures.libsonnet` that no body part takes is a hidden field, because the bust family's
  parameters are checked strictly.

## Checking a worn set

Export with `npm run export:deadvox`, then run `validate` in `packages/deadvox`. The export cache keeps a warm run
short, but any change to the export code rebuilds every model.

Look at the set in the wardrobe page from the front, three-quarter, side and back, and zoom in on crops. Always
check the front: a model turned the wrong way or seated too high shows there first. Restart the dev server before
screenshots after an export, because it works through a page reload per written file and a scripted page load
times out meanwhile.

## Designs from an existing setting

Make original designs in the spirit of a setting, with names of our own. Do not recreate its named troops,
factions, weapons or emblems.
