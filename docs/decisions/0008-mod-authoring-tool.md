---
read_if:
  - you build or scope the mod authoring tool or its SkellyEngine authoring API
  - you change mod folders, tool-to-game handoff, sharing or default mod selection
  - you schedule typed field patches against the tool's editing slices
  - you apply the remote-intake rules and framework PR gate to tool delivery
---

# 8. A mod authoring tool over the shared loader

## Direction

The mod authoring tool serves authors outside the repository and contributors editing
repository content. It runs both as a hosted browser page and locally over files, with
one UI and two storage backends from the first tool slice. Supporting both immediately
costs more to build but avoids making either authoring path a later retrofit.

Its home is a new workspace package, planned at `packages/mod-authoring-tool`, consuming
a deliberate SkellyEngine authoring API. This keeps authoring separate from play and geometry
tools without a later package extraction. The runtime must not import the tool; the tool must
not reach into arbitrary game internals or import other authoring tools, gungen or the
geometry engine. Existing boundaries still apply under `things/WORK.md`, "Decisions";
the schema's transitive neutral thing-core contract is not a direct geometry-tool import.
Thing and gun tools still own geometry and model export; this tool links their outputs.

The tool writes Jsonnet, following `docs/jsonnet.md`, "Jsonnet authoring", rather than
inventing a project language or maintaining separate repository and browser authoring
formats. Compilation produces the game's admitted data, not a second content contract.
Browser evaluation is a dependency of editing, not permission to save unevaluable source;
#801 owns browser Jsonnet support and imports of bundled sources.

### Loader authority and editing

The shared loader owns merge history, winning origins, conflicts and validation. The
tool consumes a loader-side report that retains shadowed definitions, rather than
reimplementing the merge and risking different verdicts. The existing merge owner is
`packages/deadvox/src/core/content.ts`, `merge`; the authoring report is planned work.
Retention optimizations must preserve that single authority.

Editing waits for typed field patches and per-field origins under
`docs/decisions/0007-typed-field-patches.md`, "Decision". A temporary copy-based override
editor and drift view would be discarded when patches arrive. Overview and read-only
inspection need not wait. The engine patch merge retains priority over queued work,
subject to `docs/decisions/0009-content-defined-products.md`, "Refactor gate". Design-check
it against the patch ADR before implementation. Dependency admission and conflict
enforcement must be delivered or explicitly depended on, not assumed to exist because
their rules have been documented.

### Folder mods and assets

A mod may carry its own assets in a directory, so an author outside the repository can
add models and sounds. One manifest contract covers a local folder and a folder at a
web URL from the start, with two fetchers. The manifest enumerates every file; the URL
fetcher resolves those files relative to the folder URL. This needs no directory listing
or GitHub API: a repository's raw-file hosting or Pages can serve the same folder.
GitHub URL distribution is canonical. Archive intake is deferred; a later archive
fetcher uses this manifest rather than defining another format.

Licence and provenance accompany supplied assets, rather than treating a local or remote
file as automatically redistributable; see `packages/deadvox/src/core/assets.ts`,
`validateManifest`. Admission, atomic persistence and resource cleanup must cover binaries
as well as definitions. Intake limits and other tunables belong in content, never code
constants, under `PILLARS.md`, "Content forward compatibility". Trusted admission limits
must not be supplied by the untrusted mod they bound.

Remote intake follows `docs/decisions/0009-content-defined-products.md`, "Remote intake":
HTTPS and CORS-readable sources, source disclosure and confirmation, files from the mod's
own origin, and size and evaluation-cost bounds. Data-only rules cannot access storage,
credentials or the network, so host allowlists and proxies add no needed trust boundary.
A repository browsing API is not implied. Browser-only workspace hosting still needs
an explicit transport for handoff.

### Testing, sharing and start flow

Testing uses a URL handoff to the game, not an implicit write into its IndexedDB. That
keeps the handoff explicit across local development origins and permits hosted sources.
A browser-only tool cannot serve its workspace by itself: its hosting/transport path must
be resolved before that mode's handoff is built. Arbitrary remote sources enter through
mod intake, not the bundled-id selector; see
`packages/deadvox/docs/url-mods.md`, "Demo mods and URL loading".

GitHub-hosted URL folders are the canonical sharing path, not an authorization or
repository-API integration. Catalogue preparation produces a reviewable addition for a
human to submit when the PR gate permits; it does not publish automatically. Jsonnet
keeps that output on the repository's authoring path without another conversion language.
A gallery remains a possible later product, not part of this build.

Mod selection belongs in the ordinary start flow alongside new-game and Continue, rather
than remaining opt-in behind a URL flag. These paths must use the same admission and save
identity checks, so discoverability does not introduce a second startup authority.
Control placement and active-set disclosure belong to that combined UX design.

## Build plan

These slices describe delivery dependencies, not permission to open new PRs under
`docs/decisions/0009-content-defined-products.md`, "Refactor gate". Work must use an
existing PR or wait until the refactor is executed. The independent game slice has no
tool dependency. The engine field-patch work retains priority over queued engine work
within that gate and can run beside read-only inspection; editing cannot overtake it.
Remove completed plan entries when code becomes their authority.

**Independent game slice: Default start flow.** This plan owns integration of mod
selection alongside new-game and Continue. It depends on shared admission and
save-identity checks so no entry route can start or resume under different rules, not
on any tool slice, folder admission or asset linking. Coordinate entry routes with
`packages/deadvox/docs/url-mods.md`, "Slices", whose first slice owns the URL migration;
that migration is not a prerequisite for making selection discoverable in the ordinary
start flow.

1. **Both-mode shell, loader report and read-only overview.** Establish the planned
   package, hosted/local adapters and a guarded framework authoring API together, so the
   first tool slice exercises both run modes and the single merge authority. Show only
   data an adapter can actually access; another origin's browser store is not implicitly
   readable. This slice has no editing dependency on field patches. Guard the API-only
   import direction through `packages/engine/test/engineImportBoundary.test.ts`,
   `packageEdges`, including subpath and forbidden reverse/private/tool imports.
2. **Engine field-patch merge.** Design-check and build the merge, typed refusal boundary
   and per-field origins governed by ADR 0007. This is independently scheduled within
   the PR gate, not blocked on slice 1. Resolve dependency-admission and fail-closed
   enforcement prerequisites against `packages/deadvox/docs/pack-split.md`, "Refactor workstreams"; the
   documented rules alone are not enforcement. This unblocks editing without a throwaway
   whole-entry editor.
3. **Browser Jsonnet evaluation.** Deliver the #801 prerequisite so both run modes can
   evaluate what they save, including bundled-source imports. Depends on the shared
   authoring boundary in slice 1 so evaluation reaches both adapters through one API;
   local evaluation follows the pinned compiler rule in
   `docs/jsonnet.md`, "Reasons".
4. **New-entry and patch editor.** Depends on slice 1 for the workspace/API, slice 2
   for patch semantics and per-field origins, and slice 3 to evaluate saved Jsonnet in
   the browser. Derive structural forms from
   `packages/deadvox/src/core/schema.ts`, `SECTION_DESCRIPTOR`, rather than keeping a
   second schema; add presentation metadata at that owner. The first editing workflow
   saves Jsonnet and uses the engine's patch semantics and per-field origins.
5. **Validation parity.** Depends on slice 1 for the hosted/local file adapters, not
   on an editor. Share file-provider validation with
   `packages/deadvox/src/cli/validate.ts`, `validate`, so browser and local workspaces do
   not silently pass different checks.
6. **Local and URL folder admission.** Depends on slice 5 to validate supplied files
   through the shared provider. Enforce the remote-intake policy and prove both fetchers
   admit the same manifest contract. No field-patch or editor dependency: intake admits compiled definitions and
   assets, not authoring operations. One manifest with two fetchers avoids a format per
   transport. Keep bounds in trusted content; prove atomic storage and resource
   cleanup before adding asset-editing UI.
7. **Asset linking.** Depends on slice 4 for the editing workspace and slice 6 for the
   admitted asset/manifest contract. Link exported assets and diagnose provenance,
   rather than creating a geometry editor.
8. **URL test handoff.** Depends on slice 4 for the authored workspace to test and
   slice 6 for the URL-folder intake contract. Resolve the browser-only hosting/transport
   path because a hosted page cannot serve its workspace itself. Prove local and hosted
   handoff, including origin restrictions. Default start-flow integration is the
   independent game slice above, not gated on this handoff or asset linking.
9. **Conflict and load-order inspection.** Depends on slice 1 for merge history and
   slice 2 for the loader's enforced dependency/declaration verdicts. Explain those
   verdicts, not merely overlapping definitions; read-only inspection needs no editor.
10. **Catalogue PR preparation.** Depends on slice 4 for Jsonnet output, slice 5 for
    validation, and slice 7 for linked assets and provenance. Produce a reviewable
    Jsonnet, catalogue and asset-provenance addition; a human opens the PR. Neither
    test handoff nor conflict-inspection UI is a prerequisite for preparing that addition.
    GitHub automation and a gallery need separate scope decisions.

Extend existing browser flows rather than adding a stage per slice; see `AGENTS.md`,
"Tests". Where a slice needs rates, thresholds or limits, author them in content and
validate them at the shared boundary. Code owns mechanisms, not tuning defaults.
