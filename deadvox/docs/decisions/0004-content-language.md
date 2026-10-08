---
read_if:
  - you're changing how Deadvox content and tunables are authored
  - you're designing deterministic functions or the engine-to-mod boundary
  - "you're taking up the mod-content work in #313 or #393"
tags: [deadvox, adr, content, mods, determinism]
---

# 4. Make the core game a mod

**Status:** proposed. The content-language and runtime-function format remain
open for a later design pass; this ADR does not define an accepted schema.

## Direction

The base content pack is the core mod. New content and tuning values belong in
that pack, with schema validation, rather than being duplicated as TypeScript
defaults. Existing TypeScript tuning moves only through scoped follow-up work.
This keeps authored rules and their canonical identity in one place while
leaving exact game mechanics under system ownership. See
`src/game/bundledContent.ts`, `BUNDLED_CONTENT`, and `src/core/content.ts`,
`buildRegistry`.

Jsonnet is the proposed build-time authoring and composition language. Runtime
mod functions must be pure, serializable and bounded; the expression format is
not settled. The engine owns exact simulation, persistence and lifecycle work.
A mod-facing rule may describe a consequence, but must not mutate an owner
outside the engine's validated boundary.

## Open design decisions for BR

The content-language and runtime-function format remain proposed pending BR's
decision. The next design pass must choose how rules read state, which events
and effects cross the engine/mod boundary, how composition and conflicts work,
and how mod-owned state is saved. Open design issue #313 records dynamic
world-event needs and the remaining boundary questions. #393 tracks inventory
and extraction of existing TypeScript content and tunables.

The Mind Over Matter content for Cataclysm: DDA is a capability benchmark, not
an implementation mandate. A later spike should compare a small runtime
expression evaluator with CEL and establish an authoring and runtime boundary
before a format is treated as stable.

## When

Revisit after playtest 1 (#181), or earlier if BR directs. The first spike should
cover one content area and one runtime function; existing TypeScript tunables
move only through scoped follow-up work.
