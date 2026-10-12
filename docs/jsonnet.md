---
read_if:
  - you author or change structured game data in any subproject
  - you change the shared Jsonnet compiler or its import and validation rules
  - you add build-specific content or a Jsonnet module
---

# Jsonnet authoring

Use Jsonnet when shared structure makes templates, functions or comprehensions clearer than repeated data. A focused one-value edit may stay JSON. Compiled output preserves the consumer's format; `tools/jsonnet/compile.mjs`, `compileJsonnetSources`, owns the shared boundary.

## Source boundaries

- Keep maps edited in Tiled as `.tmj`; compilation must not overwrite editor-owned data. Use `.tmj.jsonnet` only for maps not edited in Tiled. See `deadvox/maps/README.md`.
- Add structured sources only under the compiler's declared `SOURCE_ROOTS`, preserving each consumer's expected output format. See `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`.
- Deadvox core-pack data is authored under `deadvox/src/content/base` and consumed through `deadvox/src/game/bundledContent.ts`, `BUNDLED_CONTENT`, and `deadvox/src/core/content.ts`, `buildRegistry`. Keep local helpers beside their source and shared helpers under `tools/jsonnet/lib` so module ownership is explicit.
- Build-specific settings must be explicit top-level arguments, not hidden environment inputs, so identical sources produce identical output.

## Reasons

- Use templates and constructors when they expose a real relationship; shared structure keeps variants from drifting. Keep irregular authored choices explicit when abstraction would obscure them.
- Treat IDs as content interfaces: explicit references remain stable when display names change.
- Keep module exports deliberate and inheritance shallow so ownership and composition stay inspectable.
- Force critical assertions because Jsonnet evaluation is lazy; invalid authored data must fail before it reaches consumers.
- Separate authored values from transformation rules and final output so one tuning change can update dependent data without duplicating definitions.
- Use the pinned go-jsonnet runtime so contributors and CI evaluate the same source without requiring a Go toolchain. See `tools/jsonnet/runtime.json` and `tools/jsonnet/setup.mjs`.
