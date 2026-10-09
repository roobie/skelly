---
read_if:
  - you change how authored content and tuning enter a subproject
  - you're designing the build-time authoring or runtime-mod boundary
  - you change deterministic content identity or import semantics
tags: [content, mods, determinism, jsonnet]
---

# 4. Make authored content a deterministic build input

## Decision

Structured content across the repository is authored in Jsonnet at build time. The game-facing format remains JSON: each subproject's loaders and schema validators continue receiving the compiled output. Existing JSON remains valid input; new or touched structured content uses Jsonnet when repeated schemas, constructors, imports or comprehensions make the source clearer.

`tools/jsonnet/compile.mjs`, `compileJsonnetSources`, is the single repository entry point, using go-jsonnet with a fixed repository-root import search path. The Node/WASM evaluator tested for this work could not resolve file imports, so it could not supply the shared `.libsonnet` boundary. CI installs Go for build-time compilation, while game and tool consumers continue receiving JSON. `npm run content:check` rejects stale output rather than allowing source and runtime data to diverge.

The build-time language does not define runtime mod behavior. Runtime evaluation remains open for a design pass after playtest 1 (#181), or earlier if the engine-to-mod boundary is reconsidered. The game continues to validate content through `deadvox/src/core/content.ts`, `buildRegistry`; `deadvox/src/game/bundledContent.ts`, `BUNDLED_CONTENT`, supplies the base registry, and `deadvox/src/core/saveFormat.ts`, `SAVE_SCHEMA_VERSION`, owns save compatibility.

## Rationale

One source language makes repeated definitions composable while preserving JSON as the simple runtime interchange format. Fixed-root imports make output depend only on the repository. Assertions and deterministic compilation catch invalid or stale authored data before it enters the registry or the base-content identity carried by saves. Runtime rules, exact simulation, persistence and lifecycle remain engine responsibilities rather than executable mod code.

See `docs/jsonnet.md` for authoring patterns, project source locations and the shared compile contract. See `deadvox/docs/content.md`, `gungen/PROJECT.md`, and `mobgen/PROJECT.md` for each subproject's authoring boundary.
