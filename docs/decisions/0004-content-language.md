---
read_if:
  - you're changing how Deadvox content and tunables are authored
  - you're designing deterministic functions or the engine-to-mod boundary
  - "you're taking up the mod-content work in #313 or #393"
tags: [deadvox, adr, content, mods, determinism]
---

# 4. Make the core game a mod

## Context

Dynamic world events remain a design need in #313; #393 tracks extraction of TypeScript-owned
content and tuning. Authored rules need one canonical home without allowing mods to bypass
system-owned simulation and persistence.

## Decision

The base content pack is the core mod. New content and tuning values belong there with schema
validation, so authored rules have one canonical identity while exact mechanics stay
system-owned. Existing TypeScript tuning moves only through scoped follow-up work. See
`deadvox/src/game/bundledContent.ts`, `BUNDLED_CONTENT`, and `deadvox/src/core/content.ts`,
`buildRegistry`; see `docs/jsonnet.md` for the authoring rule.

Runtime mod functions and their expression format remain undecided. A mod-facing rule may
describe a consequence, but cannot mutate state outside the engine's validated boundary.

## Runtime design

Purity should be enforced by the language or a sandbox, so composed content can be hashed and
replayed deterministically. Mind Over Matter is the golden standard the content system should
support, not merely a capability benchmark; its scope is open. Keep module ordering and conflict
policy simple and useful, with `dependencies: Mod[]` as the proposed dependency boundary; whether
more is needed remains open. Migrate incrementally in a low number of large steps, with the steps
and boundaries still open. Weather simulation stays in code while mods configure weather, including
continual rain; rules may read weather through an event such as `weather_changed`, with the event
contract open.

The runtime-function format and its event, effect, composition and persistence contracts remain
open in #313. The content extraction tracked by #393 does not settle that format. A design
spike compares a small expression evaluator with CEL and tests one content area and one runtime
function before any format becomes stable.

## When

Revisit when BR picks up #313 or directs an earlier design pass. Existing TypeScript tuning
moves only through scoped follow-up work.
