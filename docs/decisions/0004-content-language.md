---
read_if:
  - you're asking why Deadvox content and tunables live in a core mod
  - you're asking why the runtime-function spike uses restricted CEL
  - you're designing deterministic functions or the engine-to-mod boundary
  - you're assessing the adoption limits of CEL reuse evidence
  - "you're taking up the mod-content work in #313 or #393"
  - you're asking why a mod may change a core tuning value
tags: [deadvox, adr, content, mods, determinism]
---

# 4. Make the core game a mod

## Context

Dynamic world events remain a design need in #313; #393 tracks extraction of TypeScript-owned content and tuning. Authored rules need one canonical home without allowing mods to bypass system-owned simulation and persistence.

## Decision

The base content pack is the core mod. New content and tuning values belong there with schema validation, so authored rules have one canonical identity while exact mechanics stay system-owned. See `deadvox/src/game/bundledContent.ts`, `buildBundledContent`, and `docs/jsonnet.md` for the authoring rule.

The deeper runtime-function spike proceeds on restricted CEL. A maintained expression runtime supplies parsing, typing and evaluation without making a new language an engine maintenance obligation. Pure expressions fit snapshot inputs and validated effect descriptions; the deeper spike tests whether this remains useful for composed functions and mod-owned state. Adoption and the production profile remain open. A mod-facing rule may describe a consequence, but cannot mutate state outside the engine's validated boundary.

## Runtime design

Purity should be enforced by the language or a sandbox, so composed content can be hashed and replayed deterministically. Mind Over Matter is the golden standard the content system should support, not merely a capability benchmark; its scope is open.

Module ordering and conflict policy stay simple and useful. A mod declares the packs it requires, because a mod written for one setting would otherwise fail confusingly under another; the rule is in `deadvox/docs/pack-split.md`, "Layers". Whether more is needed remains open. Migration goes incrementally in a low number of large steps, with the steps and boundaries still open. Weather simulation stays in code while mods configure it, so rules read weather rather than run it; the event contract is open.

The core mod is a pack like any other, with no extra protection or privilege, and a mod changes a core tuning value as it changes any pack's; see `deadvox/docs/pack-split.md`, "Core is the default first pack, not a required one". One rule for every pack is simpler than a privileged core, and the mod author owns the consequences of what they override. Modifier hooks remain a mechanism, not the only way to change core tuning; their vocabulary and how several mods' modifiers stack remain open.

The game and the modding framework own save compatibility, and a mod has no say in it, so a save whose mod state no longer matches is refused like any pack mismatch; see `deadvox/docs/decisions/0002-saves.md`, "Compatibility".

The runtime-function format and its event, effect, composition and persistence contracts remain open in #313. The content extraction tracked by #393 does not settle that format. The spike's evidence, and why the engine must still own scheduling, state and effects, is in `deadvox/src/spikes/expressions/README.md`, "CEL mod boundary". The isolated mod profile and the scalar comparison are separate profiles, not a widening of the scalar contract.

The mod profile keeps author operator syntax and checks every intermediate result, because a failure that disappears inside a predicate makes final-result validation insufficient. It uses public parser and serializer APIs rather than patching third-party files at install time, and rejects an expression it cannot round-trip rather than silently changing it. This does not adopt a production arithmetic profile or a general integer-to-double conversion policy.

Reuse evidence is in `deadvox/src/spikes/expressions/README.md`, "Exercised, not chosen". It chooses no library version solving, global patching, production helper vocabulary or save migration for the game.

Restricted profiles do not establish the safety or cost of unrestricted runtimes. Representative engine contracts exercise a MoM-shaped rule layer, not a port of its world mechanics. Target fidelity, triggers, randomness, effect vocabulary, mod state, composition, effect combining, field patches and UI remain open. No harness policy adopts any of those choices for the game.

## When

Revisit when BR picks up #313 or directs an earlier design pass. Existing TypeScript tuning moves only through scoped follow-up work.
