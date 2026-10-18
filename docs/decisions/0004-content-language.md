---
read_if:
  - you're changing how Deadvox content and tunables are authored
  - you're designing deterministic functions or the engine-to-mod boundary
  - you're assessing the adoption limits of CEL reuse evidence
  - "you're taking up the mod-content work in #313 or #393"
  - you're letting a mod change a core tuning value or declaring the packs a mod requires
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
`deadvox/src/game/bundledContent.ts`, `buildBundledContent`, and `deadvox/src/core/content.ts`,
`buildRegistry`; see `docs/jsonnet.md` for the authoring rule.

The deeper runtime-function spike proceeds on restricted CEL. A maintained expression runtime
supplies parsing, typing and evaluation without making a new language an engine maintenance
obligation. Pure expressions fit snapshot inputs and validated effect descriptions; the deeper
spike tests whether this remains useful for composed functions and mod-owned state. Adoption and
the production profile remain open. A mod-facing rule may describe a consequence, but cannot
mutate state outside the engine's validated boundary.

## Runtime design

Purity should be enforced by the language or a sandbox, so composed content can be hashed and
replayed deterministically. Mind Over Matter is the golden standard the content system should
support, not merely a capability benchmark; its scope is open. Keep module ordering and conflict
policy simple and useful, with `dependencies: Mod[]` as the dependency boundary: a mod names the
packs it requires and loading refuses a mismatch, because a mod written for one setting would
otherwise fail confusingly under another (`deadvox/docs/pack-split.md`, "Layers"). Whether more is
needed remains open. Migrate incrementally in a low number of large steps, with the steps
and boundaries still open. Weather simulation stays in code while mods configure weather, including
continual rain; rules may read weather through an event such as `weather_changed`, with the event
contract open.

A mod changes a core tuning value only through a modifier hook that core declares, never by
replacing the value. A declared hook names what a mod may change, so core keeps authority over the
mechanism the value tunes, and a diagnostic can name every mod that modified it; replacement would
let one mod silently take the value over from core and from every other mod. The hook vocabulary,
the order in which several mods' modifiers stack, and whether a setting pack may replace core
values remain open.

A save whose mod state no longer matches the mod is refused, as a pack mismatch is; see
`deadvox/docs/decisions/0002-saves.md`, "Compatibility". The game and the modding framework own
that policy, and a mod has no say in it.

The runtime-function format and its event, effect, composition and persistence contracts remain
open in #313. The content extraction tracked by #393 does not settle that format. See
`deadvox/src/spikes/expressions/celMods.ts`, `ModHarness`, and
`deadvox/test/celModsSpike.test.ts` for isolated CEL composition evidence; see
`deadvox/src/spikes/expressions/README.md`, "CEL mod boundary", for why the engine must still own
scheduling, state and effects. The scalar comparison remains in
`deadvox/src/spikes/expressions/contract.ts`, `Candidate`. These are separate profiles, not a
widening of the scalar contract. See `deadvox/tools/bench-expressions.mjs`, `measureModRules`, for
Node probes, and `deadvox/src/spikes/expressions/README.md`, "Published runtime boundary", for the
Wasm comparison's limits.

The isolated mod profile preserves author operator syntax by rewriting parsed arithmetic to checked
numeric calls before serializing and compiling it. Intermediate failures must not disappear inside
predicates, so final-result validation is insufficient. Public typed parser and serializer APIs
avoid modifying third-party files at install time or depending on undocumented runtime handler
tables. Serialization must preserve tree structure and literal types; an expression that cannot
round-trip is rejected rather than silently changed. See
`deadvox/src/spikes/expressions/celRewrite.ts`, `serializeRewrite`, and
`deadvox/test/celRewriteSpike.test.ts` for that boundary and its limitations. This does not adopt a
production arithmetic profile or a general integer-to-double conversion policy.

Reuse evidence includes dependency-scoped function libraries, typed collections, native expression-local
binding and an engine-provided helper surface; see `deadvox/test/celReuseSpike.test.ts` and
`deadvox/src/spikes/expressions/README.md`, "Exercised, not chosen". Lexical replacement scopes keep
library consumers independent, while native binding avoids owning a binding language. Collection
boundary validation and identity covering engine-library semantics are necessary to keep bounded work
and strict replay rejection meaningful. Library version solving, global patching, a production helper
vocabulary and save migration remain open; this evidence chooses none of them for the game.

Restricted profiles do not establish the safety or cost of unrestricted runtimes. Representative
engine contracts exercise a MoM-shaped rule layer, not a port of its world mechanics. Target
fidelity, triggers, randomness, effect vocabulary, mod state, composition, effect combining, field
patches and UI remain open. No harness policy adopts any of those choices for the game.

## When

Revisit when BR picks up #313 or directs an earlier design pass. Existing TypeScript tuning
moves only through scoped follow-up work.
