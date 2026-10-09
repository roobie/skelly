---
read_if:
  - you author or change structured game data in any subproject
  - you change the shared Jsonnet compiler or its import and validation rules
  - you add build-specific content or a Jsonnet module
---

# Jsonnet authoring

Jsonnet is the build-time source language for authored structured content across the repository. It lets authors define repeated schemas and systematic variants once, while the game and existing tools continue consuming JSON. Write new or touched content as `.jsonnet`, use functions, templates, imports and comprehensions when they clarify a real relationship, and keep IDs as explicit references. Existing JSON remains valid input until it is touched.

The shared compiler in `tools/jsonnet/compile.mjs`, `compileJsonnetSources`, uses go-jsonnet and searches imports from the repository root. Put shared `.libsonnet` modules under `tools/jsonnet/lib`; do not add a per-project evaluator or import path. It formats and checks generated output before it reaches consumers, so authored and compiled data follow the same repository checks. Deadvox runtime readers, validation, tests, builds and the save-content hash consume compiled JSON. `npm run content:check` fails when a generated file differs from its source; `npm run content:compile` refreshes it. Assertions and compiler errors fail the build and identify the source file.

## Source layout

Jsonnet's composition-root, helper-module and authored-data roles map onto each consumer's existing paths; they do not require a duplicate project-level directory structure.

- Deadvox core-mod sources live in `deadvox/src/content/base`. Each `.jsonnet` file there is a composition root that emits the same JSON shape its registry already loads; local helper modules may live beside it as `.libsonnet`, while shared modules belong in `tools/jsonnet/lib`. The registry still validates and loads JSON; see `deadvox/src/game/bundledContent.ts`, `BUNDLED_CONTENT`, and `deadvox/src/core/content.ts`, `buildRegistry`.
- Deadvox Tiled maps live under `deadvox/maps`; author or change them in `.tmj.jsonnet` and compile back to `.tmj` so the editor and map tools keep their expected format.
- Gungen designs and cartridge data live in `gungen/designs` and `gungen/cartridges`. Loader and workflow integration with the shared compiler remains a follow-up.
- Mobgen body plans and poses are authored in TypeScript under `mobgen/src/mob`; a separate Jsonnet data-source boundary and loader integration remain follow-up work, not a second compiler.
- Structured site data outside the configured roots must add its source location to `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`, before introducing Jsonnet there; preserve the consumer's expected output extension.

The compiler has no build variants or top-level arguments yet. If a real content build setting is added, pass it as a declared top-level argument rather than a hidden global environment value.

## Patterns and why

1. **Base templates with shallow overrides.** Define common entity fields once, then override only meaningful differences. This prevents family variants from drifting while keeping inheritance easy to inspect. Use `+:` only when intentionally extending a nested array or object; otherwise replace it explicitly.
2. **Functions for repeated schemas.** Use a constructor when values vary naturally by parameters; every generated value then retains the same required shape.
3. **Imports as module boundaries.** Export small, deliberate APIs from `.libsonnet` files. Modules make ownership and reuse visible instead of scattering helpers through large compositions.
4. **Comprehensions for systematic variants.** Generate regular tiers and combinations; keep irregular authored choices explicit because the loop would obscure them. Comprehensions can also build lookup objects keyed by explicit IDs.
5. **Executable assertions.** Check high-value IDs, references, ranges and structural invariants before JSON reaches runtime. A bad source should stop the build, not become malformed game data. Since evaluation is lazy, force validation of critical data rather than assuming every expression has run.
6. **Separate data, rules and output.** Keep authored values distinct from constructors and the final game-facing shape so one tuning change can update all dependent output.
7. **Treat IDs as an API.** Keep IDs explicit, stable, lowercase and independent of display names; reference IDs instead of embedding duplicate definitions.

For example, a module can build a family from one constructor, generate regular variants with a comprehension, then assert a reference before emitting its result:

```jsonnet
local makeTool = function(id, weight) { id: id, weight: weight };
local toolIds = ['first_tool', 'second_tool'];
local tools = [makeTool(id, 1) for id in toolIds];
local content = { tools: tools, keyId: 'sample_key' };
assert content.keyId != '' : 'key reference must not be empty';
content
```

Keep the example's invariant meaningful for the real data: check that referenced IDs exist and that IDs are unique where the consumer relies on uniqueness.

## Team rules

1. **No copy-paste variants** when a template, function, or comprehension can express the relationship.
2. **Every repeated schema gets a constructor function or base template.**
3. **Every reference uses an ID**, never an embedded duplicate definition.
4. **Every module exports a deliberate interface**, not a pile of unrelated globals.
5. **Every build runs assertions** before exporting JSON.
6. **Prefer top-level arguments** for build settings and environment-dependent choices.
7. **Use hidden fields (`::`) only for internal implementation details** that must not reach the game’s JSON output.
8. **Keep inheritance shallow.** One or two levels of extension is usually readable; deep chains become difficult to debug.
9. **Do not rely on lazy evaluation for correctness.** It is useful, but validation should force evaluation of critical data.
10. **Generate output deterministically.** The same inputs should always produce the same mod data.

The compiler uses go-jsonnet because imports are part of the shared source contract. The Node/WASM evaluator tested for this work could not resolve file imports, so it could not supply the repository-root module boundary. The Go evaluator adds a build-time toolchain, installed by CI, in exchange for supported imports and one stable compiler path; it does not move Jsonnet evaluation into runtime mod loading.
