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
policy simple and useful, with `dependencies: Mod[]` as the proposed dependency boundary; whether
more is needed remains open. Migrate incrementally in a low number of large steps, with the steps
and boundaries still open. Weather simulation stays in code while mods configure weather, including
continual rain; rules may read weather through an event such as `weather_changed`, with the event
contract open.

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

Restricted profiles do not establish the safety or cost of unrestricted runtimes. Representative
engine contracts exercise a MoM-shaped rule layer, not a port of its world mechanics. Target
fidelity, triggers, randomness, effect vocabulary, mod state, composition, effect combining, field
patches, UI, core tuning and save mismatch policy remain open. No harness policy adopts any of
those choices for the game.

## When

Revisit when BR picks up #313 or directs an earlier design pass. Existing TypeScript tuning
moves only through scoped follow-up work.
