---
read_if:
  - you're importing rendering, UI, audio or input presentation from another package
  - you're adding, removing or regrouping a presentation entry point
  - you're adding a test that needs presentation internals
  - you're adding an import to a presentation file
  - you're changing loading readiness, GPU upload pacing or shader warm-up
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

## GPU readiness

The first playable frame waits for uploaded geometry, including index buffers, and warm programs. No loading frame admits more
atomic geometry-buffer uploads than content's budget; see `src/render/gpuUploads.ts`, `GpuUploads`,
and `packages/engine/src/core/schema/graphics.ts`, `GraphicsTuningSchema`. Budget buffer operations,
not elapsed time: a driver call cannot be interrupted. This avoids the first render's upload burst
and GPU back-pressure that produced a five-second first-frame freeze. Streaming does not use this
pacer until its admission path is explicitly integrated.

Keep the prepared scene stable while uploads drain so continuous instance updates cannot starve
readiness; see `src/presentation/play.ts`, `frame`. Warm the actual lighting, caster and
postprocessing variants, including the output pass's screen colour space, not just the terrain material; see `src/render/playView.ts`,
`prepareFirstFrame`, `src/render/shadows.ts`, `warmUpCasters`, and `src/render/mood.ts`, `warmUp`.
The loading mask must also cover three's first-use program checks. With parallel compilation the
driver reports finished programs without blocking, so every finished program is checked in the same
frame, and a frame count per program cannot pace loading. Without that extension an individual link
check can still block, so those checks are admitted one per frame rather than postponed to play. See
`src/render/gpuPrograms.ts`, `GpuPrograms`.

Compiling starts on the first loading check rather than once the ready ring is meshed, so the driver
builds programs while the world streams instead of after it. That early pass is only a head start:
draw preparation still compiles the prepared scene, which builds only programs that arrived or changed
since, so the first frame waits for exactly the programs it draws and none is skipped. See
`src/presentation/worldLoading.ts`, `LoadingCheck`, and `src/render/playView.ts`, `startWarmUp`.

GPU preparation shares the initial loading workload's content-defined deadline so a lost context or
an unfinished program cannot leave the mask up forever. See `src/presentation/worldLoading.ts`,
`WorldLoading`, and `packages/engine/src/core/schema/graphics.ts`, `GraphicsTuningSchema`.

## Tests

The tests here use fixtures only. A test that reads shipped content or deadvox code stays in deadvox and
reaches presentation through the entries or the test-only surface.
