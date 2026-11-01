---
read_if:
  - you're asking why content and tunables live in ordinary mods rather than the engine
  - you're asking why mod and event rules use restricted CEL rather than a scripting language
  - you're modelling a scripted sequence of events, such as a panel that opens a door
  - you're designing deterministic functions or the engine-to-mod boundary
  - you're assessing what the CEL spike evidence does not prove
  - "you're taking up the mod-content work in #313 or #393"
  - you're asking why a mod may change a core tuning value
  - you're designing mod triggers, randomness, effects, state, composition, field patches or UI
tags: [deadvox, adr, content, mods, determinism]
---

# 4. Make the core game a mod

## Context

Dynamic world events remain a design need in #313; #393 tracks extraction of TypeScript-owned content and tuning. Authored rules need one canonical home without allowing mods to bypass system-owned simulation and persistence.

## Decision

Content and tuning belong in schema-validated mods, while exact mechanisms stay engine-owned. Core, theme, product and scenario ownership follows `docs/decisions/0009-content-defined-products.md`, "Definitions and distribution"; no single core pack owns every shared value. The loader remains one authority for admission; see `packages/deadvox/src/game/bundledContent.ts`, `buildBundledContent`, and `docs/jsonnet.md` for authoring.

Mod and event rules use restricted CEL inside a typed rule envelope, and no scripting language is admitted. The envelope is Jsonnet data: a trigger, an optional condition and a list of engine effects. CEL fills only the condition and the effect arguments. It cannot sequence, loop or mutate, so the engine keeps scheduling, state, randomness and effects, as the mod rules below require. A maintained runtime supplies parsing, type checking and evaluation without making a new language an engine maintenance obligation. A mod-facing rule may describe a consequence, but cannot mutate state outside the engine's validated boundary.

A scripting language would cost more for less. The Luau and Starlark candidates were safe only under a profile that removed stateful statements and unbounded work, which leaves expressions inside a larger runtime. Their published bindings expose no static analyzer, so a type mistake surfaces when a rule is evaluated during play, while CEL's checker reports typed diagnostics against authored source at load. See `packages/deadvox/src/spikes/expressions/README.md`, "Published runtime boundary", and `packages/deadvox/src/spikes/expressions/README.md`, "CEL mod boundary".

The guard boundary around CEL is owned engine code: checked arithmetic through a rewrite, rejection of any expression the serializer cannot reproduce, a failure latch for callback errors that CEL's logical operators would otherwise recover from, and structural work reservation in place of an instruction counter. It relies on the pinned package's public parser and serializer, so a package upgrade re-proves the guards. Authors lose a valid expression that cannot survive the serializer, which is safer than silently changing it.

## Runtime design

Purity should be enforced by the language or a sandbox, so composed content can be hashed and replayed deterministically. Mind Over Matter is the golden standard the content system should support, not merely a capability benchmark; the mod rules below say how closely the game follows it.

A mod declares its dependencies so reuse does not silently import another product's assumptions; see `packages/deadvox/docs/pack-split.md`, "Layers". Composition and combining follow the mod rules below. Runtime and pack extraction follows the single-refactor gate in `docs/decisions/0009-content-defined-products.md`, "Refactor gate"; #393 retains the bounded tuning-extraction work. Weather simulation stays in code while mods configure it, so rules read weather rather than run it; its event contract belongs to #313.

Every mod uses the same override rules, including core-tier providers. No tier grants protection or privilege, and the overriding mod owns the consequences. Modifier hooks remain a mechanism, not the only way to change tuning; their vocabulary and how several mods' modifiers stack remain open in #313. Restricted rules have no storage, credential or network access; see `docs/decisions/0009-content-defined-products.md`, "Remote intake".

The game and the modding framework own save compatibility, and a mod has no say in it, so a save whose mod state no longer matches is refused like any pack mismatch; see `packages/deadvox/docs/decisions/0002-saves.md`, "Compatibility".

The production profile starts from the spike's mod profile: flat aggregates, no nested traversal macros, author operator syntax with every intermediate result checked, and bounded synchronous host callbacks. A failure that disappears inside a predicate makes final-result validation insufficient, and termination rests on these exclusions rather than on a fuel meter, so widening the profile reopens its termination proof. The mod profile stays separate from the spike's scalar comparison profile. A general integer-to-double conversion policy for effects and comparisons, the engine helper vocabulary and its version policy remain open in #313; the spike's reuse evidence chooses no library version solving or global patching; see `packages/deadvox/src/spikes/expressions/README.md`, "Exercised, not chosen".

Representative engine contracts exercise a MoM-shaped rule layer, not a port of its world mechanics. No harness policy adopts a choice for the game; the rules below do.

## Mod rules

These rules bound the format #313 designs. Each keeps the engine the owner of scheduling, state, randomness and effects, so mod content stays pure, hashable and replayable.

- **Target:** the game supports a mod of the same kind as Mind Over Matter, written in the game's own vocabulary, not MoM's files or syntax as they are. Porting MoM's data would mean rebuilding a Cataclysm-shaped engine surface, such as its event vocabulary, `jmath` and vitamins, and would let one external mod set the effect vocabulary and event list every other rule builds on. Supporting only the rule layer would leave out the world verbs and content kinds such a mod needs. So the engine gains the verbs, events and content kinds a mod of this kind needs, in its own terms, and no MoM file loads unchanged.
- **Triggers:** a rule runs on a typed engine event or on a game-time timer the mod schedules. A state the engine knows gives a pair of enter and exit events. Any other while-condition is a CEL predicate the mod's timer checks, so the engine never evaluates mod conditions every tick. Because an exit event can be missed, a rule should be able to check whether a state holds at a given point and recover; the shape of that check is open in #313.
- **Sequences:** a multi-step event is a chain of rules. Each later step triggers on an engine event an earlier effect caused, on a timer an earlier effect scheduled, or tests in its condition a flag an earlier effect set. A script that pauses mid-run would need its suspended state saved; between chained rules every point is ordinary saved data, the firing record, flags and pending timers, so save/load and replay stay deterministic. For example, an area-entry rule spawns a tagged group, and a rule triggered when that group is cleared opens a door. Area entry waits on `packages/deadvox/SLICE-5.md`, "Remaining event gate — issue #313". What counts as cleared when a group member leaves play, and how such a chain recovers so it cannot softlock, are open in #313.
- **Randomness:** a rule never rolls. An effect value may hold a random thunk, named from a closed engine set with optional arguments, and the engine draws it from its seeded stream when it applies the effect. CEL therefore never sees a rolled value and stays pure. Whether thunks may nest, and where in an effect a thunk may stand, are open in #313.
- **Effect vocabulary:** effects are engine verbs plus mod-defined effects that expand to engine verbs, so a mod can name a reusable consequence without extending the engine, and validation stays on the engine's verbs. Thunk names belong to the engine and pass through expansion unchanged.
- **Mod state:** a mod declares namespaced counters and flags with bounds, plus scopes, enums and refs. Free-form records, lists and nesting are excluded, so mod state keeps a checkable size and save shape. A bounded map keyed by content type is open in #313.
- **Composition:** a mod may call or replace the named functions and rules of its hard dependencies and of no other mod, so every cross-mod link is declared and checkable at load.
- **Combining effects:** every mod's stacking effects apply, since they override nothing, in load order. Load order follows dependencies and stays deterministic between unrelated mods, so replay holds without a priority scheme. An effect that sets a value another mod also sets is an override, and only a mod that depends on the other and declares the override may make it, as for field patches; see `docs/decisions/0007-typed-field-patches.md`, "Conflicts". So a set-verb names a literal target, read after mod-defined effects expand so that wrapping a set-verb cannot hide it, and the loader refuses two mods with no dependency path between them that set one target. The clash is then caught once, at load, before play, and load order never decides it. This binds the first set-verb #313 adds; no verb sets shared world state yet. Open in #313: set-verbs whose target is computed or bound to a run-time instance, and each new set-verb's target granularity, by kind or by content id. Per kind is coarser than any clash: it refuses two mods that set different doors.
- **Field patches:** a mod changes a field of another pack's entry through typed patch operations checked at load; every address is patchable except what the engine owns; see `docs/decisions/0007-typed-field-patches.md`, "Decision".
- **UI:** mod UI is deferred to a spike once CEL rules run in the engine (#313), since what a mod could show depends on what its rules can express.

## When

Revisit the choice of CEL (#313) if authored content needs imperative multi-step units that chained rules cannot express, or if the guard boundary grows with each feature instead of staying fixed. Existing TypeScript tuning moves only through scoped follow-up work.
