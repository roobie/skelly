---
read_if:
  - you author or change structured game data in any subproject
  - you change the shared Jsonnet compiler, its formatter, or its import and validation rules
  - you optimize evaluation of authored content
  - you add build-specific content or a Jsonnet module
  - you change how a pack declares the files the asset submodule builds for it
  - you author map features or decide what belongs in a map template
  - you check which generated map features still require curated migration
---

# Jsonnet authoring

Author new content in Jsonnet, except maps edited in Tiled. Convert existing JSON when a touch exposes repetition; only a focused one-value edit in a non-repetitive existing file may stay JSON. Compiled output preserves the consumer's format; `tools/jsonnet/compile.mjs`, `compileJsonnetSources`, owns the shared boundary.

## Source boundaries

- Keep maps edited in Tiled as `.tmj`; compilation must not overwrite editor-owned data. Use `.tmj.jsonnet` only for maps not edited in Tiled. See `packages/deadvox/maps/README.md`.
- Add structured sources only under the compiler's declared `SOURCE_ROOTS`, preserving each consumer's expected output format. See `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`.
- Jsonnet inside the asset submodule stays out of `SOURCE_ROOTS`: the submodule ignores its JSON twins and writes them with its own compiler, so each twin has one writer. The root install runs that compiler so the twins skelly imports exist after every install, CI's included; see `package.json`, `postinstall`, and `packages/skelly-assets/tools/sources.mjs`, `installJsonnetSources`.
- Content imports the asset submodule's tool sources and built outputs by the repository-root prefix `packages/skelly-assets/`, not through a compiled copy. It is the smallest change, adds no second output tree, and content validation compiles against the pinned sources at every pin bump. See `tools/jsonnet/lib/economy.libsonnet`, `notSpawnable`.
- Keep exporter-written JSON outside the Jsonnet source manifest so it has one writer; the exporter owns its output rather than a second authored source. The exporters live in the asset submodule; see `docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "Decision".
- A pack declares the files the asset submodule builds for it from the pinned build manifest, not from a copied list, so a pin bump changes the declarations with the files. See `tools/jsonnet/lib/built-pack.libsonnet` and `tools/jsonnet/lib/pack-manifest.libsonnet`.
- Do not impose a subprocess capture limit on trusted formatter output: growing a content document must not fail because of the process API's default buffer. See `tools/jsonnet/compile.mjs`, `formatJson`.
- Keep shared topic content under `packages/mods` and Deadvox product and scenario content under `packages/deadvox/mods` so ownership follows the consumer boundary. See `packages/deadvox/src/game/bundledContent.ts`, `buildBundledContent`, and `packages/deadvox/src/core/content.ts`, `buildRegistry`. Keep local helpers beside their source and shared helpers under `tools/jsonnet/lib` so module ownership is explicit.
- Build-specific settings must be explicit top-level arguments, not hidden environment inputs, so identical sources produce identical output.

## Curated map features

Every map feature not constructed from noise comes from a curated template. Author its geometry as readable source, not as generated Jsonnet or layer-building code. Deterministic semi-procedural code may place and apply those templates; it does not replace their authored geometry. An exception needs a concrete reason and an operator decision before implementation.

A placed content template is spatial data, not a Jsonnet constructor. Constructors may express non-spatial relationships or reference curated pieces; they are not permission to generate architecture. Literal layers describe both structures and intentional negative space. Code may choose, rotate and place them, but not invent partitions through coordinate predicates or successive paint passes.

Curated geometry lets authors inspect and change intended spaces without reverse-engineering a generator. Exclusive ownership prevents composition from repainting a correctly authored shell, while reserved walking space protects circulation from furnishing. See `docs/decisions/0005-curated-map-kits.md`, "Decision".

Generated geometry in `packages/deadvox/mods/skelly.deadvox.camp/camp.libsonnet`,
`packages/deadvox/mods/skelly.deadvox.scenario.playtest/ladders.libsonnet` and `packages/deadvox/mods/skelly.deadvox.scenario.lock-test/locks.libsonnet`
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
- Cache height-invariant membership and reuse glyphs for ownership when expanding authored plans. Repeated interpreted list scans make content checks expensive without adding authoring flexibility; see `packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-level.libsonnet`, `build`.
- Use the pinned go-jsonnet runtime so contributors and CI evaluate the same source without requiring a Go toolchain. See `tools/jsonnet/runtime.json` and `tools/jsonnet/setup.mjs`.
