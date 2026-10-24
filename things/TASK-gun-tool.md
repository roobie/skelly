---
read_if:
  - "you scope or implement the gun-tool and gungen-retirement phases of issue #509"
  - you review the gun-tool consumption contract or transfer gungen issue ownership
---

# Gun tool and retirement

This is the PR sequence for `things/WORK.md`, "Phases", under #509.
The headings are scheduling labels, not minted work-item IDs. Dispatch mints each item.
Delete this task file when the retirement phase merges; move lasting reasons into the
owning package docs before deletion.

## Gates and limits

Refactor in place and move once at the phase 5 exit to the home in
`things/WORK.md`, "Target structure"; phase 6 retires residual references and the old
contract test name. One move avoids two live implementations, and packages never import
gungen.

The part-item scope is authored part identity, standalone exports and Deadvox item
records, with no new player actions. Gameplay disassembly is deferred to #1040 so the
part rounds stay small and disassembly gets its own design (`things/WORK.md`, "Decisions").
A mass row alone is not an exportable part. Item identity needs a concrete build source,
without making pose or placement create another item; see `gungen/src/gun/catalogue.ts`,
`loadPartCatalogue`.

Open question 1 in `things/WORK.md`, "Open questions", need not block this sequence:
sharing engine shapes is not sharing a domain part. Keep each tool's authored parts local;
no round introduces a cross-tool part import. If an implementation identifies an actual
shared authored part, stop that extraction for BR's ownership decision rather than put
it in the neutral core or duplicate its mass. Open question 2 stays for close-out: this
sequence needs no new work-item prefix.

CARRY_ALL on #509 transfers issue ownership, not implementation scope. At phase 5 exit,
transfer the issues identified by that ruling without renumbering or closing them; re-point
their paths as their owners move. The deferred reasons travel with
`gungen/src/gun/parts.ts`, `magazineGeometryFor`, and
`gungen/docs/decisions/0001-calibre-driven-sizing.md`. Engine motion work remains engine
work; the separately carded issue remains separate. No round implements that backlog as
a condition of retirement.

## Invariants for every round

Keep `test/gungen-deadvox-contract.test.mjs` green until its replacement is wired into
root CI in the retirement PR. A move changes its imports, not its coverage. The final PR
renames or replaces the test atomically; it must not leave a commit without that gate.

The consumption boundary is `gungen/exports/deadvox.jsonnet`, interpreted by
`gungen/src/cli/exportRecipe.ts`, `loadExportRecipe`, not a copied inventory in this file.
All its export kinds survive; the recipe and its code cues move together. Reproduction
means the authored sources refresh the committed consumer assets and model records, not
byte identity with the previous exporter. Keep credits and orphan detection alongside
schema and load checks; see `test/model-export-sync.mjs`, `assertExportSynced` and
`assertRecipeCredits`.

Every round also preserves `test/things-deadvox-contract.test.mjs`, the Deadvox registry
and load contract, and the dependency rules in
`packages/engine/test/engineImportBoundary.test.ts`, `packageEdges`. Neither tool imports
the other; Deadvox does not acquire an authoring dependency. Changes to consumed outputs
include the refresh in the same PR. Local checks follow `AGENTS.md`, "Before pushing: tiered checks";
the exits below name additional evidence, not substitutes for those checks.

## Phase 5: consumption proof

**Depends on:** no unresolved design choice.

Strengthen the existing contract before restructuring so a missing non-gun export cannot
hide behind successful gun validation. The existing recipe sync covers every row, but
its GLTF load probes focus on particular firearm behaviours.

**Exit:** extend `test/gungen-deadvox-contract.test.mjs` to load every generated recipe
output with Deadvox's GLTF loader and validate its model through
`packages/deadvox/src/core/content.ts`, `buildRegistry`. Resolve declared part-node
references with `packages/deadvox/src/render/firearmModel.ts`, `namedNodes`. Use the
recipe as the population, assert it is nonempty, and retain the specialised moving-node
and material checks only for the distinct behaviour they protect. No fixed content counts
or export fingerprints. This round changes no product ownership or geometry and preserves
all invariants above.

## Phase 5: authored part catalogue

**Depends on:** consumption proof.

Give the mass rows concrete, closed item identities and build sources before changing
assembly composition. Keep the catalogue in gungen until the single move, so there is no
package-to-gungen bridge. Items and the remaining mass rows share
`gungen/src/gun/catalogue.jsonnet`, `parts`, so the catalogue is not a second mass
authority. `gungen/src/gun/physical.ts`, `gunModelParts`, rejects missing and ambiguous
items and rows. A family builder remains reusable without making its arbitrary parameter space
the shipped item catalogue.

**Exit:** catalogue tests prove unique identity and a buildable standalone assembly for
each authored atom; unknown selections fail rather than invent an item. Move authored
mass ownership in the same PR and prove assembled exports still resolve it exactly once.
A fixture with two placements of one item proves placement and pose do not fork identity.
No gameplay disassembly, viewer redesign or directory relocation in this PR. Preserve all
invariants above.

## Phase 5: part items at the consumer boundary

**Depends on:** authored part catalogue.

Connect part identities to Deadvox item/model records and make gun composition reference
the closed catalogue, rather than silently turning a parametric proposal into shippable
content. Keep export inputs and consumer item records together so “parts are items” is
more than a renamed mass table. Reuse the assembly path exemplified by
`packages/thing-core/src/singlePart.ts`, `singlePart`, without importing the thing tool's
catalogue. Gameplay fields remain owned by Deadvox.

**Exit:** extend the recipe-driven contract to prove every referenced part item resolves
to a consumer item and loadable model, and each assembly's body mass sums its authored
parts. Preserve child-item mass ownership in
`packages/deadvox/src/core/modelMass.ts`, `modelBodyMassKg`, and
`packages/deadvox/test/modelMass.test.ts`: fitted replaceable geometry must not be counted
twice. Add a focused fixture that detects a duplicated child contribution, with one mutant
caught by that test. Reject an uncurated part choice at export; proposals may remain in
the editor without becoming exports. No new fitting, crafting or inventory actions.
Preserve all invariants above.

## Phase 5: viewer boundary

**Depends on:** part items at the consumer boundary.

Keep the gun editor's curation, cycling and ammo presentation rather than replacing it
with the minimal thing preview. Share only domain-neutral mechanisms: inspect
`gungen/src/viewer/cameraState.ts`, `parseCameraState`, and
`gungen/src/viewer/paramPanel.ts`, `buildPanelModel`, for promotion into tool UI.
`gungen/src/viewer/shareUrl.ts`, `setModelQuery`, also carries tool selection policy;
that policy stays caller-owned rather than becoming a shared gun-shaped URL contract.
The shared renderer already exists in `packages/tool-ui/src/scene.ts`, `buildLayers`.

**Exit:** move mechanism tests with extracted code and keep caller tests for gun policy.
Use the existing gun browser flows to prove curated load/edit/save, ammo preview and
cycling still work; extend an existing flow for any missing catalogue-selection proof.
Smoke the thing preview once after shared UI changes. Strengthen `packageEdges` for any
new UI edges rather than relying on directory names alone. This round does not require
identical UI or old URL formats, and does not add a second renderer. Preserve all
invariants above.

## Phase 5: single package move and reproduction exit

**Depends on:** viewer boundary.

Move the gun implementation, authored sources, tests and still-valid reasons together to
the package home in `things/WORK.md`, "Target structure". A move rather than a rewrite
preserves one owner of gun and ammo policy. Essential CI, compiler, workspace and consumer wiring must move in the same
PR: postponing working paths to phase 6 would make this PR knowingly broken. See
`tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`; `tools/refresh-deadvox.mjs`; and
`.github/workflows/pages.yml`. Update `packageEdges` so the new tool cannot import its
peer, and lower packages and Deadvox cannot import the new tool.

**Exit:** from the new workspace, refresh the entire consumption recipe, validate the
Deadvox registry and pass the retained root contract against the new imports. Run the
moved typecheck and unit suite, the affected build and browser paths, and the existing
sweep job where its moved paths require it. Confirm Pages and the site launcher build
the new tool instead of a duplicate old entry point. Re-point the CARRY_ALL issues and
move their tracked deferred reasons in this round; issue transfer needs lead coordination,
not new issue IDs. No forwarding package, old-path alias or second recipe authority.
Preserve all invariants above, including the old root contract test name until retirement.

## Phase 6: retirement gate

**Depends on:** the complete phase 5 reproduction exit.

Remove residual gungen ownership only after its replacement proves the full consumption
boundary. The single move leaves this phase to retire remaining names and references,
not a second implementation.
Do not delete useful tests or pending feature reasons merely because they mention gungen.

**Exit:** rename the root contract to the gun tool's contract and update its CI invocation
in the same PR. Audit active scripts, workflows, Jsonnet imports, credits, docs and package
metadata for old ownership; no live path may depend on `gungen/`. Run root CI and site
checks plus the successor's recipe load/validation contract. The thing-tool contract
remains independent and green. Resolve all touched plan cues, delete this task file, and
leave phase 7's lasting-decision transfer and prefix question explicitly open in
`things/WORK.md`, "Phases". No gungen compatibility shim survives retirement.
