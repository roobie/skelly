---
read_if:
  - you continue phase 4 of the things suite or decide whether it is complete
  - you migrate a hand-made Deadvox item model to the thing tool
  - you move a handling datum out of Deadvox content into the thing tool
  - you decide whether a carried item needs an authored handling datum
---

# Remaining families

Phase 4 of `things/WORK.md`, "Phases". Delete this task file when phase 4 merges.

## Completion criteria

Phase 4 is complete when all of these hold:

- Every Deadvox item model that is not a gun part, an ammunition piece or a deliberate
  exception has a thing-tool row, so no hand-made item GLB remains.
- For every tool row the model Deadvox loads is the one the recipe exports, with no
  Deadvox override of the exported grip, hold, roll or anchors.
- A tool row a player holds either authors its handling datum against a named solid or takes
  Deadvox's default hold; a default judged wrong at a look in game gets an authored datum.

To derive what remains, compare the rows of `packages/thing-authoring-tool/items.jsonnet`,
`items`, with the model registrations in
`packages/deadvox/src/content/base/models-items.jsonnet`, `authored`, and
`packages/deadvox/src/content/base/items-tools.libsonnet`, `models`, and look for datum
overrides in `packages/deadvox/src/content/base/models-melee.jsonnet`, `models`, and in
`authored`. The recipe, `packages/thing-authoring-tool/exports/deadvox.jsonnet`, exports
every row. See `test/things-deadvox-contract.test.mjs`,
"thing tool exports satisfy the Deadvox contract", for the check of each committed export.

## Exceptions

The compass keeps its dedicated held display, so a ground model must not replace it.
`work_in_progress` is a zero-mass crafting placeholder, not a usable item family. Inventory
pictures follow `packages/deadvox/INTERFACE.md`, "Item pictures", and are outside item models.

## Why datums and models migrate

The thing tool owns handling datums and Deadvox consumes exports, so reshaping a handle moves
the hand with it and Deadvox keeps no second geometry authority (`things/WORK.md`,
"Decisions"). A hand-made GLB has no authored source, mass or datum to change with it, and a
Deadvox override of an exported datum silently diverges from the geometry. Items that share a
GLB, such as two lights drawn by one file, still keep separate item and model identities.

## Carried items and the default hold

A carried item may leave its handling datum out and take Deadvox's default hold. A datum
that reproduces the default adds work and a second value to keep in step without changing
what the player sees. A wrong default shows when someone looks at the item in game, and
only then does the tool author a datum for it.
