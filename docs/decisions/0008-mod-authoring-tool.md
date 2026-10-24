---
read_if:
  - you build or scope the mod authoring tool or its Deadvox authoring API
  - you change mod folders, tool-to-game handoff, sharing or default mod selection
  - you schedule typed field patches against the tool's editing slices
---

# 8. A mod authoring tool over the shared loader

## Direction

The mod authoring tool serves authors outside the repository and contributors editing
repository content. It runs both as a hosted browser page and locally over files, with
one UI and two storage backends from the first tool slice. Supporting both immediately
costs more to build but avoids making either authoring path a later retrofit.

Its home is a new workspace package, planned at `packages/mod-authoring-tool`, consuming
a deliberate Deadvox authoring API. This keeps authoring separate from play and geometry
tools without a later package extraction. Deadvox must not import the tool; the tool must
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

The Deadvox loader owns merge history, winning origins, conflicts and validation. The
tool consumes a loader-side report that retains shadowed definitions, rather than
reimplementing the merge and risking different verdicts. The existing merge owner is
`packages/deadvox/src/core/content.ts`, `merge`; the authoring report is planned work.
Retention optimizations must preserve that single authority.

Editing waits for typed field patches and per-field origins under
`docs/decisions/0007-typed-field-patches.md`, "Decision". A temporary copy-based override
editor and drift view would be discarded when patches arrive. Overview and read-only
inspection need not wait. Schedule the patch merge as a Deadvox engine feature ahead of
other queued Deadvox work, with a design check against that ADR before implementation;
there is no product decision left about whether to schedule it. Dependency admission and
conflict enforcement must be accounted for in that engine feature, not assumed to exist
because their rules have been documented.

### Folder mods and assets

A mod may carry its own assets in a directory, so an author outside the repository can
add models and sounds. One manifest contract covers a local folder and a folder at a
web URL from the start, with two fetchers. The manifest enumerates every file; the URL
fetcher resolves those files relative to the folder URL. This needs no directory listing
or GitHub API: a repository's raw-file hosting or Pages can serve the same folder.
An archive transport can be considered later without defining a second mod format.

Licence and provenance accompany supplied assets, rather than treating a local or remote
file as automatically redistributable; see `packages/deadvox/src/core/assets.ts`,
`validateManifest`. Admission, atomic persistence and resource cleanup must cover binaries
as well as definitions. Intake limits and other tunables belong in content, never code
constants, under `PILLARS.md`, "Content forward compatibility". Trusted admission limits
must not be supplied by the untrusted mod they bound.

Cross-site fetching needs design confirmation before the folder loader is built: raw
hosting and Pages must permit browser CORS reads of the manifest and every listed file,
HTTPS pages cannot depend on mixed-content fetches, and local serving needs an explicit
cross-origin arrangement. A repository browsing API is not implied. Remote-mod trust and
disclosure, and conveniences such as accepting a repository page URL, remain undecided.

### Testing, sharing and start flow

Testing uses a URL handoff to the game, not an implicit write into its IndexedDB. That
keeps the handoff explicit across local development origins and permits hosted sources.
A browser-only tool cannot serve its workspace by itself: its hosting/transport path must
be resolved before that mode's handoff is built. Arbitrary remote sources enter through
mod intake, not the bundled-id selector; see
`packages/deadvox/docs/url-mods.md`, "Demo mods and URL loading".

GitHub integration is a direction to keep possible through URL handoff and URL folders,
not a scoped integration or authorization workflow. Sharing prepares a PR-ready bundled
catalogue addition for a human to open and for review before publication. Jsonnet keeps
that output on the repository's authoring path without a second conversion language.
A gallery remains a possible later product, not rejected and not part of this build.

Mod selection belongs in the ordinary start flow alongside new-game and Continue, rather
than remaining opt-in behind a URL flag. These paths must use the same admission and save
identity checks, so discoverability does not introduce a second startup authority.
Control placement and active-set disclosure belong to that combined UX design.

## Build plan

This is the implementation sequence, one PR per numbered slice, not a claim that the
features exist. Slice 2 is scheduled ahead of other queued Deadvox engine work and can
run alongside the read-only tool work; tool editing cannot overtake it. Each slice's
brief supplies implementation detail. Remove completed plan entries when code becomes
the authority, preserving the rules and reasons above.

1. **Both-mode shell, loader report and read-only overview.** Establish the planned
   package, hosted/local adapters and a guarded Deadvox authoring API together, so the
   first tool slice exercises both run modes and the single merge authority. Show only
   data an adapter can actually access; another origin's browser store is not implicitly
   readable. This slice has no editing dependency on field patches. Guard the API-only
   import direction through `packages/engine/test/engineImportBoundary.test.ts`,
   `packageEdges`, including subpath and forbidden reverse/private/tool imports.
2. **Engine field-patch merge.** Design-check and build the merge, schema marking and
   per-field origins governed by ADR 0007. This is independently scheduled, not blocked
   on slice 1. Resolve its dependency-admission and fail-closed enforcement prerequisites
   against `packages/deadvox/docs/pack-split.md`, "Round split" before building; the
   documented rules alone are not enforcement. This unblocks editing without a throwaway
   whole-entry editor.
3. **Browser Jsonnet evaluation.** Deliver the #801 prerequisite so both run modes can
   evaluate what they save, including bundled-source imports. Depends on the shared
   authoring boundary in slice 1; local evaluation follows the pinned compiler rule in
   `docs/jsonnet.md`, "Reasons".
4. **New-entry and patch editor.** Depends on slices 1–3. Derive structural forms from
   `packages/deadvox/src/core/schema.ts`, `SECTION_DESCRIPTOR`, rather than keeping a
   second schema; add presentation metadata at that owner. The first editing workflow
   saves Jsonnet and uses the engine's patch semantics and per-field origins.
5. **Validation parity.** Depends on slice 4. Share file-provider validation with
   `packages/deadvox/src/cli/validate.ts`, `validate`, so browser and local workspaces do
   not silently pass different checks.
6. **Local and URL folder admission.** Depends on slices 2, 3 and 5 and resolution of
   the remote trust/disclosure and cross-site-fetch design gates. One manifest with two
   fetchers avoids transport-specific formats. Keep bounds in trusted content; prove
   atomic storage and resource cleanup before adding asset-editing UI.
7. **Asset linking.** Depends on slices 4–6. Use the admitted folder contract to link
   exported assets and diagnose provenance, rather than creating a geometry editor.
8. **Default start flow and URL test handoff.** Depends on slices 6–7 and a resolved
   browser-only hosting/transport path. Integrate mod selection with new-game and
   Continue through one admission boundary; prove local and hosted handoff, including
   origin restrictions. Coordinate with `packages/deadvox/docs/url-mods.md`, "Slices",
   rather than retaining an opt-in decision gate.
9. **Conflict and load-order inspection.** Depends on slices 1, 2 and 4. Explain the
   loader's dependency and declaration verdicts, not merely overlapping definitions.
10. **Catalogue PR preparation.** Depends on slices 5–9. Produce a reviewable Jsonnet,
    catalogue and asset-provenance addition; a human opens the PR. GitHub automation and
    a gallery need separate scope decisions.

Extend existing browser flows rather than adding a stage per slice; see `AGENTS.md`,
"Tests". Where a slice needs rates, thresholds or limits, author them in content and
validate them at the shared boundary. Code owns mechanisms, not tuning defaults.
