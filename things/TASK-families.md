---
read_if:
  - you continue phase 4 of the things suite or decide whether it is complete
  - you migrate a hand-made Deadvox item model to the thing tool
  - you move a handling datum out of Deadvox content into the thing tool
---

# Remaining families

Phase 4 of `things/WORK.md`, "Phases". Delete this task file when phase 4 merges.

## Completion criteria

Phase 4 is complete when all of these hold:

- Every Deadvox item model that is not a gun part, an ammunition piece or a deliberate
  exception has a thing-tool row, so no hand-made item GLB remains.
- For every tool row the model Deadvox loads is the one the recipe exports, with no
  Deadvox override of the exported grip, hold, roll or anchors.
- A tool row a player holds authors its handling datum against a named solid.

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

## Open for BR

Whether a carried tool row may take Deadvox's default hold instead of authoring a datum.
Until BR rules, a carried row without a datum is not counted as complete.
