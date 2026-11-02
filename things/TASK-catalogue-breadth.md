---
read_if:
  - you run, extend or land the catalogue breadth batches
  - you author thing rows from the CDDA reference catalogue
  - you apply the drafted catalogue items to Deadvox content
---

# Catalogue breadth

Deadvox's world has too few ordinary things to find, carry and use, and models are the slow part of
adding one. Agents author them in batches against a reference catalogue of real-world items. Delete
this file when the drafted items are applied to Deadvox content after the framework refactor (#1532).

An orchestrator starts from one command, which prints the procedure, the state read from git and the
next steps, so no separate runbook can drift from the tools. See `tools/catalogue-batch.mjs`, `runbook`.

## The reference stays out of the repository

Cataclysm: DDA carries the broadest catalogue of everyday survival items, with weights, volumes and
materials. Its data is CC BY-SA 3.0 while Skelly is EUPL-1.2, and
`docs/decisions/0004-content-language.md` keeps external content files from loading unchanged. So the
catalogue only informs authors: it is generated into an ignored scratch folder, and authors write
their own geometry, names and descriptions. See `tools/cdda-reference.mjs`.

Variants that differ only in a stat share one model and ride with their root, so a batch spends its
effort on distinct shapes.

A batch number must mean the same items on every host and for the whole run. The catalogue leaves out
things Skelly already has, and landed batches add things, so each host builds it from a pinned CDDA
release and the Skelly commit recorded when batches were prepared, and starting a batch refuses a
catalogue whose hash differs. See `tools/catalogue-batch.mjs`, `catalogue`.

## One worktree and one row file per batch

Compiling Jsonnet rewrites tracked generated JSON, so two authors in one checkout overwrite each
other's output. Each batch gets its own worktree and branch. Every batch row file is created and
imported on the integration branch before batches start, so each batch edits only its own files and
the branches merge without conflicts. The finish palette is shared by every batch for the same
reason, so common material gaps are filled before the run and batches pick the nearest finish. See
`tools/catalogue-batch.mjs`, `prepare`.

## Authors look before review

An authoring agent cannot see what it drew, and a picture alone hides scale because each view is
fitted to its tile. The look step renders the rows and prints their size and mass against the
reference, flagging large departures. The bands are wide because a catalogue volume is a carried
volume, not a measured box. See `tools/model-look.mjs` and `tools/model-sheet.mjs`.

## One export when batches land

The full Deadvox export takes minutes and rewrites shared model registrations, so it runs once on the
integration branch after batches merge, and the reviewer judges the whole contact sheet there. See
`tools/catalogue-batch.mjs`, `land`.

## Item drafts wait for the refactor

Item definitions are content that moves in the framework refactor
(`docs/decisions/0009-content-defined-products.md`, "Refactor gate"), so batches draft them unloaded
and the drafts are applied once the new content layout exists. See `tools/catalogue-batch.mjs`, `DRAFTS`.
