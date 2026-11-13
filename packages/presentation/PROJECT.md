---
read_if:
  - you're importing rendering, UI, audio or input presentation from another package
  - you're adding, removing or regrouping a presentation entry point
  - you're adding a test that needs presentation internals
  - you're adding an import to a presentation file
---

# Presentation

`@skelly/presentation` draws and plays the game the engine runs: rendering (`src/render`), the UI (`src/ui`),
play, input, audio and the debug surface (`src/presentation`), and the mesher and save workers (`src/worker`).
It holds no product content and names no product path; the product passes its configuration in. The boundary
and its reasons are in `docs/decisions/0009-content-defined-products.md`, "Package boundaries".

## Imports

Presentation reaches the engine only through its curated entries, `@skelly/engine/<entry>`, never through
`@skelly/engine/internal/*`, and imports nothing from deadvox. The engine's entries are its chosen surface,
so presentation built on them can be reused by another product, and the engine can change its files without
breaking presentation. Files inside the package import each other by relative path, not through the package's
own entries, for the reason `packages/engine/PROJECT.md`, "Entry points" gives. See
`packages/deadvox/tools/runtimeClosure.ts`, `PRESENTATION_POLICY`.

## Entry points

Other packages import presentation only through the curated entries that the `exports` field of
`package.json` names, one per domain, plus the two stylesheets. An entry carries only what code outside the
package uses. A page links the stylesheets by package name rather than importing them from its module, so they
block the first paint: in the dev server an imported stylesheet waits for the module graph, and the page paints
unstyled until then. See `packages/deadvox/tools/packageStylesheetsPlugin.ts`, `packageStylesheetsPlugin`.
`tutorialUrl` has its own entry because it loads no npm package, so a consumer that runs without
an install can load its file.

The `./internal/*` subpath is the test-only surface, under the same export condition as the engine's; see
`packages/engine/PROJECT.md`, "Entry points".

## Tests

The tests here use fixtures only. A test that reads shipped content or deadvox code stays in deadvox and
reaches presentation through the entries or the test-only surface.
