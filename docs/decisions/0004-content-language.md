---
read_if:
  - you're changing how Deadvox content and tunables are authored
  - you're designing deterministic functions or the engine-to-mod boundary
  - "you're taking up the mod-content work in #313 or #393"
tags: [deadvox, adr, content, mods, determinism]
---

# 4. Make the core game a mod

## Decision

The base content pack is the core mod. New content and tuning values belong in that pack, with schema validation, rather than being duplicated as TypeScript defaults. Existing TypeScript tuning moves only through scoped follow-up work. This keeps authored rules and their canonical identity in one place while leaving exact game mechanics under system ownership. See `deadvox/src/game/bundledContent.ts`, `BUNDLED_CONTENT`, and `deadvox/src/core/content.ts`, `buildRegistry`.

Authored content uses the conversion rule in `docs/jsonnet.md` and is compiled to JSON for existing game and tool consumers. `tools/jsonnet/compile.mjs`, `compileJsonnetSources`, is the repository's single compiler entry point; it uses go-jsonnet with repository-root imports and checks generated outputs. Runtime mod functions and the expression format remain open for a later design pass. The engine owns exact simulation, persistence and lifecycle work. A mod-facing rule may describe a consequence, but must not mutate an owner outside the engine's validated boundary.

## Runtime design remains open

The runtime-function format remains proposed pending BR's decision. The next design pass must choose how rules read state, which events and effects cross the engine/mod boundary, how composition and conflicts work, and how mod-owned state is saved. Open design issue #313 records dynamic world-event needs and the remaining boundary questions. #393 tracks inventory and extraction of existing TypeScript content and tunables.

### Direction for the runtime design pass, not yet decided

- Weather simulation stays in code while mods configure weather; a mod may configure continual rain. Rules may read weather through an event such as `weather_changed`.
- Ordering and conflict policy should be simple and useful, not clever. Mods may declare `dependencies: Mod[]`; whether anything more is needed is open.
- Migration should be incremental, in a low number of large steps; the steps remain open.
- Purity should be enforced by the language or a sandbox, not by convention, so composed content can be hashed and replayed deterministically. The mechanism remains open.
- Mind Over Matter is the golden standard the content format should aim to support, not only a capability benchmark, and not a mandate to clone its implementation; its scope is still open.

A later spike should compare a small runtime expression evaluator with CEL and establish an authoring and runtime boundary before a format is treated as stable.

## When

Revisit after Slice 3's playtest 1 (#181), or earlier if BR directs. The first spike should cover one content area and one runtime function; existing TypeScript tunables move only through scoped follow-up work.
