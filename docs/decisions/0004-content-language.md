---
read_if:
  - you're asking why Deadvox content and tunables live in a core mod
  - you're asking why the runtime-function spike uses restricted CEL
  - you're designing deterministic functions or the engine-to-mod boundary
  - you're assessing the adoption limits of CEL reuse evidence
  - "you're taking up the mod-content work in #313 or #393"
  - you're asking why a mod may change a core tuning value
  - you're designing mod triggers, randomness, effects, state, composition, field patches or UI
tags: [deadvox, adr, content, mods, determinism]
---

# 4. Make the core game a mod

## Context

Dynamic world events remain a design need in #313; #393 tracks extraction of TypeScript-owned content and tuning. Authored rules need one canonical home without allowing mods to bypass system-owned simulation and persistence.

## Decision

The base content pack is the core mod. New content and tuning values belong there with schema validation, so authored rules have one canonical identity while exact mechanics stay system-owned. See `deadvox/src/game/bundledContent.ts`, `buildBundledContent`, and `docs/jsonnet.md` for the authoring rule.

The deeper runtime-function spike proceeds on restricted CEL. A maintained expression runtime supplies parsing, typing and evaluation without making a new language an engine maintenance obligation. Pure expressions fit snapshot inputs and validated effect descriptions; the deeper spike tests whether this remains useful for composed functions and mod-owned state. Adoption and the production profile remain open in #313. A mod-facing rule may describe a consequence, but cannot mutate state outside the engine's validated boundary.

## Runtime design

Purity should be enforced by the language or a sandbox, so composed content can be hashed and replayed deterministically. Mind Over Matter is the golden standard the content system should support, not merely a capability benchmark; the mod rules below say how closely the game follows it.

Module ordering and conflict policy stay simple and useful. A mod declares the packs it requires, because a mod written for one setting would otherwise fail confusingly under another; the rule is in `deadvox/docs/pack-split.md`, "Layers". Composition and combining follow the mod rules below. Migration goes incrementally in a low number of large steps, with the steps and boundaries set in #393. Weather simulation stays in code while mods configure it, so rules read weather rather than run it; its event contract belongs to #313.

The core mod is a pack like any other, with no extra protection or privilege, and a mod changes a core tuning value as it changes any pack's; see `deadvox/docs/pack-split.md`, "Core is the default first pack, not a required one". One rule for every pack is simpler than a privileged core, and the mod author owns the consequences of what they override. Modifier hooks remain a mechanism, not the only way to change core tuning; their vocabulary and how several mods' modifiers stack remain open in #313.

The game and the modding framework own save compatibility, and a mod has no say in it, so a save whose mod state no longer matches is refused like any pack mismatch; see `deadvox/docs/decisions/0002-saves.md`, "Compatibility".

The runtime-function format remains open in #313, within the mod rules below. The content extraction tracked by #393 does not settle that format. The spike's evidence, and why the engine must still own scheduling, state and effects, is in `deadvox/src/spikes/expressions/README.md`, "CEL mod boundary". The isolated mod profile and the scalar comparison are separate profiles, not a widening of the scalar contract.

The mod profile keeps author operator syntax and checks every intermediate result, because a failure that disappears inside a predicate makes final-result validation insufficient. It uses public parser and serializer APIs rather than patching third-party files at install time, and rejects an expression it cannot round-trip rather than silently changing it. This does not adopt a production arithmetic profile or a general integer-to-double conversion policy.

Reuse evidence is in `deadvox/src/spikes/expressions/README.md`, "Exercised, not chosen". It chooses no library version solving, global patching, production helper vocabulary or save migration for the game.

Restricted profiles do not establish the safety or cost of unrestricted runtimes. Representative engine contracts exercise a MoM-shaped rule layer, not a port of its world mechanics. No harness policy adopts a choice for the game; the rules below do.

## Mod rules

These rules bound the format #313 designs. Each keeps the engine the owner of scheduling, state, randomness and effects, so mod content stays pure, hashable and replayable.

- **Target:** the game supports a mod of the same kind as Mind Over Matter, written in the game's own vocabulary, not MoM's files or syntax as they are. Porting MoM's data would mean rebuilding a Cataclysm-shaped engine surface, such as its event vocabulary, `jmath` and vitamins, and would let one external mod set the effect vocabulary and event list every other rule builds on. Supporting only the rule layer would leave out the world verbs and content kinds such a mod needs. So the engine gains the verbs, events and content kinds a mod of this kind needs, in its own terms, and no MoM file loads unchanged.
- **Triggers:** a rule runs on a typed engine event or on a game-time timer the mod schedules. A state the engine knows gives a pair of enter and exit events. Any other while-condition is a CEL predicate the mod's timer checks, so the engine never evaluates mod conditions every tick. Because an exit event can be missed, a rule should be able to check whether a state holds at a given point and recover; the shape of that check is open in #313.
- **Randomness:** a rule never rolls. An effect value may hold a random thunk, named from a closed engine set with optional arguments, and the engine draws it from its seeded stream when it applies the effect. CEL therefore never sees a rolled value and stays pure. Whether thunks may nest, and where in an effect a thunk may stand, are open in #313.
- **Effect vocabulary:** effects are engine verbs plus mod-defined effects that expand to engine verbs, so a mod can name a reusable consequence without extending the engine, and validation stays on the engine's verbs. Thunk names belong to the engine and pass through expansion unchanged.
- **Mod state:** a mod declares namespaced counters and flags with bounds, plus scopes, enums and refs. Free-form records, lists and nesting are excluded, so mod state keeps a checkable size and save shape. A bounded map keyed by content type is open in #313.
- **Composition:** a mod may call or replace the named functions and rules of its hard dependencies and of no other mod, so every cross-mod link is declared and checkable at load.
- **Combining effects:** every mod's effects apply, in load order. Load order follows dependencies and stays deterministic between unrelated mods, so replay holds without a priority scheme.
- **Field patches:** a mod changes a field of another pack's entry through typed patch operations checked at load, and the schema marks which fields accept which operations; see `docs/decisions/0007-typed-field-patches.md`, "Decision".
- **UI:** mod UI is deferred to a spike once #313 puts an expression language in place, since what a mod could show depends on what its rules can express.

## When

Revisit when BR picks up #313 or directs an earlier design pass. Existing TypeScript tuning moves only through scoped follow-up work.
