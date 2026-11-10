---
read_if:
  - you're importing the game runtime from another package
  - you're adding, removing or regrouping a runtime entry point
  - you're adding a test that needs runtime internals
---

# Engine

`@skelly/engine` is the game runtime that deadvox runs: simulation, world, items, bodies, sky, saves and vehicles,
and the game session, input and replay around them (`src/game`). It
holds no presentation code and no product content; the boundary and its reasons are in
`docs/decisions/0009-content-defined-products.md`, "Refactor gate".

## Entry points

Other packages import the runtime only through the curated entries that the `exports` field of `package.json` names, one
per domain.
An entry carries only what code outside the package uses, so the package's surface is chosen rather than every
file it holds. Files inside the package import each other by relative path, not through these entries: an entry
loads every module it re-exports, so going through one would load modules the importer does not use. See
`packages/deadvox/tools/runtimeClosure.ts`, `ownName`.

The `./internal/*` subpath is the test-only surface: it resolves only under the `skelly-engine-test` export
condition, which the deadvox Vitest config and the dev servers of its browser stages enable, and which the
product dev server and build never do. Deadvox tests that use shipped
content need runtime internals no entry carries; this surface serves them without growing the entries. See
`packages/deadvox/tools/runtimeEntries.ts`, `entryViolations`, for the check that keeps product code off it.

## Tests

The tests here use fixtures only. A test that reads shipped content stays in deadvox and reaches the runtime
through the entries or the test-only surface.

The runtime compiles without DOM types; see `tsconfig.json`.
