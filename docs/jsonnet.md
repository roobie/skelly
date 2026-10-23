---
read_if:
  - you author or change structured game data in any subproject
  - you change the shared Jsonnet compiler, its formatter, or its import and validation rules
  - you add build-specific content or a Jsonnet module
  - you author map features or decide what belongs in a map template
  - you check which generated map features still require curated migration
---

# Jsonnet authoring

Author new content in Jsonnet, except maps edited in Tiled. Convert existing JSON when a touch exposes repetition; only a focused one-value edit in a non-repetitive existing file may stay JSON. Compiled output preserves the consumer's format; `tools/jsonnet/compile.mjs`, `compileJsonnetSources`, owns the shared boundary.

## Source boundaries

- Keep maps edited in Tiled as `.tmj`; compilation must not overwrite editor-owned data. Use `.tmj.jsonnet` only for maps not edited in Tiled. See `packages/deadvox/maps/README.md`.
- Add structured sources only under the compiler's declared `SOURCE_ROOTS`, preserving each consumer's expected output format. See `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`.
- Keep exporter-written JSON outside the Jsonnet source manifest so a refresh has one writer; the exporter owns its output rather than a second authored source.
- The exporter refresh compiles in two stages because its inputs and outputs form a cycle: the tools' recipes and catalogues are compiled Jsonnet that the exporter reads, and the content Jsonnet imports the model files the exporter writes. A single compile either reads a stale recipe or fails on a model file that is not written yet. A partial compile of the tools' own source directories runs first and leaves the manifest alone, because the manifest describes the full source set. See `tools/refresh-deadvox.mjs` and `tools/jsonnet/compile.mjs`, `compileJsonnetSources`.
- Do not impose a subprocess capture limit on trusted formatter output: growing a content document must not fail because of the process API's default buffer. See `tools/jsonnet/compile.mjs`, `formatJson`.
- Deadvox core-pack data is authored under `packages/deadvox/src/content/base` and consumed through `packages/deadvox/src/game/bundledContent.ts`, `buildBundledContent`, and `packages/deadvox/src/core/content.ts`, `buildRegistry`. Keep local helpers beside their source and shared helpers under `tools/jsonnet/lib` so module ownership is explicit.
- Mobgen's material tables stay separate from body-plan construction so look tuning remains content-owned. See `packages/mobgen/src/mob/materialTemplates.jsonnet` and `packages/mobgen/src/mob/materials.ts`, `resolveMaterials`.
- Build-specific settings must be explicit top-level arguments, not hidden environment inputs, so identical sources produce identical output.

## Curated map features

Every map feature not constructed from noise comes from a curated template. Author its geometry as readable source, not as generated Jsonnet or layer-building code. Deterministic semi-procedural code may place and apply those templates; it does not replace their authored geometry. An exception needs a concrete reason and an operator decision before implementation.

A placed content template is spatial data, not a Jsonnet constructor. Constructors may express non-spatial relationships or reference curated pieces; they are not permission to generate architecture. Literal layers describe both structures and intentional negative space. Code may choose, rotate and place them, but not invent partitions through coordinate predicates or successive paint passes.

Curated geometry lets authors inspect and change intended spaces without reverse-engineering a generator. Exclusive ownership prevents composition from repainting a correctly authored shell, while reserved walking space protects circulation from furnishing. See `docs/decisions/0005-curated-map-kits.md`, "Decision".

Generated geometry in `packages/deadvox/src/content/base/camp.libsonnet`,
`packages/deadvox/src/content/base/ladders.libsonnet` and `packages/deadvox/src/content/base/locks.libsonnet`
remains outside #712's city-and-lab migration. Those features need a separate curated
migration before they satisfy this rule; the gauntlet migration does not authorize
additional generators.

## Reasons

- Use constructors for non-spatial relationships when shared structure keeps variants from drifting. Keep irregular authored choices explicit when abstraction would obscure them.
- No source-coverage gate is used: the JSON exception depends on whether a particular edit exposes repetition. A file-wide gate would force unrelated migrations, while a history-based gate would have to classify content diffs against that exception. Review the exception when editing a file.
- Treat IDs as content interfaces: explicit references remain stable when display names change.
- Keep module exports deliberate and inheritance shallow so ownership and composition stay inspectable.
- Force critical assertions because Jsonnet evaluation is lazy; invalid authored data must fail before it reaches consumers.
- Separate authored values from transformation rules and final output so one tuning change can update dependent data without duplicating definitions.
- Use the pinned go-jsonnet runtime so contributors and CI evaluate the same source without requiring a Go toolchain. See `tools/jsonnet/runtime.json` and `tools/jsonnet/setup.mjs`.
