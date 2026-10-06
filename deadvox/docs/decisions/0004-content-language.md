---
id: deadvox::adr-0004-content-language
description: Proposed mod format for authored content and deterministic runtime expressions
read_if:
  - you're changing how Deadvox content or tunables are authored and composed
  - you're adding a function evaluated from content
  - you're evaluating the content-language spike after Slice 3
tags: [deadvox, adr, content, mods, determinism]
created: 2026-10-06
status: proposed
---

# 4. Make the core game a mod

**Status:** proposed (2026-10-06). The format is not implemented; this proposal is confirmed or revised after the content-language spike.

## Context

Deadvox needs content to describe both data and deterministic pure functions, while TypeScript systems own game logic. The base JSON files are loaded as a registry by `src/game/bundledContent.ts`, `BUNDLED_CONTENT`; `src/core/content.ts`, `buildRegistry`, composes ordered sources, and `src/core/schema.ts`, `ContentFileSchema`, plus `npm run validate` define the content contract. The schema is strict, so expression definitions and expression-valued fields need an explicit schema shape before the game can consume them.

BR's design principle is that mods are data and pure functions, while the game's logic is systems. Purity must be enforced by the language or a sandbox, not by convention, so the composed content corpus can be hashed and replayed deterministically. The current save identity already carries ordered content identities and canonical hashes in `src/core/saveFormat.ts`, `SaveVersionComponents`.

BR's words (2026-10-06):

- 11:18: “what if we used purescript for the game's actual content?” and “if we simply preclude the use of i/o in purescript, we have data and pure functions as mods”
- 11:23: “jsonnet seems like the best fit for us”; “but we still have to come up with a seialization format for pure funcs”; “like how CDDA and their jmath”
- 11:32: “and, just to be clear, the aim is to define all content and tunables via mods - even the _core game_”
- 11:34: “yeah, let's do it now” — this answers the lead's question: should new tuning values go into the base pack now, as schema-validated JSON, so no new constants are added in code?
- 11:38: “as for the serializable functions (jmath thing) / it'll need one or two design passes before we set it in stone”
- 11:45: ‘in a sense, it shows us what the core mod needs too - i mean "custom" state and events are required for the core game too’; “events are really the protocol between engine and mod, right?”

BR's answers to the protocol questions (2026-10-06, 11:52):

- **Catalogue and vocabulary:** “as for the catalogue and vocabulary, I think we can send a coder to scan the game as-is and report findings (which won't conver exactly everything, but it's a start)” The dated as-is survey, `deadvox/docs/reviews/2026-10-06-event-effect-survey.md`, is the starting input to pass 2.
- **How rules read state:** “as for how rules read state: needs thoughtful consideration”. This remains open; this ADR does not propose an answer.
- **Ordering and conflicts:** “module ordering and conflict policy should be kept simple but useful. We won't try to be clever here. For one thing, I think we can allow mods to declare 'dependencies:Mod[]' at least, but maybe not much more than that?” This remains a question, not a decision.
- **Migration:** “migration will have to be incremental, but I think we should do it in a low number of big steps”. The steps remain for pass 2.

The goal is that the core game itself is a mod: today's base pack under `src/content/base` is the core mod, and all content and tunables ultimately come from mods. TypeScript systems hold logic, not a second copy of tuning values. New tuning values belong in the core mod immediately. Existing TypeScript constants predating that ruling stay in place until the post-Slice-3 spike or a follow-up item moves them; for example, `src/core/needs.ts`, `NEED_RATES`, remains an existing tuning source until that work is dispatched. This ADR does not move existing constants or add content fields.

## Benchmark: Mind Over Matter

BR's words (2026-10-06, 11:42): “the golden standard (type of mod) we should aim to support is the MindOverMatter mod for CDDA”. The public [Mind Over Matter source](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/mods/MindOverMatter) is a benchmark for the kind of behavior-as-data the format may need to express, not a mandate to clone its implementation or settle every feature in this ADR.

A first survey suggests its breadth goes beyond pure functions:

- **Mod-owned state:** Nether attunement and counters for power learning or maintained powers are vitamins. Focus is the character's own stat, read and written through `u_val('focus')` in math; known powers and levels use the engine's spell list (`SPELL`, `u_spell_level`); cooldowns are spell fields, often math expressions; and practice uses `practice` recipes. Much of MoM's state therefore lives in engine-provided systems such as spells and focus. The engine/mod split for that state is a pass-2 question, not a settled ownership rule.
- **Event- and condition-triggered rules:** `effect_on_condition` combines events, recurring timers, conditions with math expressions, and effect lists. The engine–mod protocol below is one candidate for expressing such behavior without giving mods direct mutation.
- **Abilities:** powers describe targeting, area, cost and effects, and are learned and improved through practice. This overlaps the tiered training work in #275.
- **Modifiers:** enchantments compose and stack changes to stats.
- **Reusable math:** named `jmath_function`s are shared across powers and rules.
- **Cross-mod content:** `mod_interactions` makes content conditional on another mod; this depends on the still-open composition contract.
- **Ordinary content:** items, monsters, recipes, effects, mutations, professions, dialogue and map generation also belong to the mod corpus.

This benchmark informs the second design pass. It does not expand the initial spike beyond one content area and one runtime function; the pass must determine which broader capabilities the content format is intended to support.

## Options considered

**PureScript for the complete content corpus.** Effects in types make purity legible, and its type system could describe data and functions together. FFI and `Effect.Unsafe` remain escape hatches; the native compiler adds a build toolchain, and the team would need to own unfamiliar language and interop conventions.

**Dhall.** It is total and hermetic and emits JSON, which fits reproducible data. Its more constrained authoring and generation model may not provide the reach needed for content functions and composition.

**Jsonnet for content authoring.** It is pure and hermetic, supports functions and composition, and emits JSON. It is not total, and a function value cannot be manifested as JSON. Use it to author and compose data at build time, not as the serialized runtime-function format.

**CEL as the runtime expression language.** CEL is designed for bounded runtime expressions, but it does not itself author and compose the full content corpus. Its evaluator and semantics would also become part of the runtime contract. Compare it with a small first-party expression evaluator during the spike.

**Evaluate Jsonnet in the game at runtime.** This would put a build-authoring language and its evaluator on the hot path, repeat interpretation during simulation, and couple runtime behavior to Jsonnet semantics. Build-time evaluation plus a small compiled expression form keeps Jsonnet out of per-tick execution.

## Proposed decision

### Mod authoring and composition

Use Jsonnet for authoring and composing mods at build time. A selected Jsonnet implementation evaluates the mod sources into one canonical JSON corpus; the existing content contract is extended to validate that corpus, and its canonical hash binds the whole composition, core mod included. Systems consume the resulting registry. They do not read Jsonnet at runtime.

The current loader's file ordering and override behavior are implementation details, not a ruling on mod composition. The engine-owned policy for mod load order, how overrides and extensions combine, and how conflicts are diagnosed or resolved remains open for BR.

BR's immediate rule applies to new tuning values as well as authored content: put each new value in the base/core mod's domain content file, or a new domain file when none fits; add the schema field and type/range validation; have systems read it from the composed registry. Do not add a TypeScript default or duplicate. Existing TypeScript tunables move only after the spike, through a specifically scoped follow-up item.

### Runtime expression functions — design pass 1

This section is a candidate design, not a format decision. BR said the serializable functions “it'll need one or two design passes before we set it in stone”. Jsonnet functions that generate the corpus are build-time authoring helpers; they are not runtime functions and are not serialized as callable values.

One candidate, following CDDA's `jmath_function`, is to represent a runtime pure function as a content entry with an ID, arguments, and a `return` expression string. The arguments might be named; numeric content might refer to an expression inline or by function ID. The exact encoding and call form remain open.

A sketch of one possible future content section—not a shape accepted by the current schema or a selected format—could be:

```json
{
  "functions": [
    {
      "id": "dismemberment_launch_curve",
      "args": ["progress"],
      "return": "clamp(lerp(0, 1, progress), 0, 1)"
    }
  ]
}
```

A bounded expression language is a candidate: the first-pass sketch lists arithmetic, comparisons, `?:`, `min`, `max`, `clamp`, `lerp`, piecewise expressions, and table lookup, with no loops. It could allow function calls while validation rejects cycles, unknown names, wrong arity, and undeclared inputs. None of that surface or validation policy is fixed. The second pass must define total results and useful validation-time errors for every accepted expression.

One evaluation candidate is to parse and compile each expression once at content load, then evaluate it in TypeScript at runtime. Another authoring option is for Jsonnet to expand a small-domain function into a table at build time. Randomness must not be ambient; how an expression receives the simulation RNG stream, if at all, is also open. `src/core/random.ts`, `Rng.stream`, is the existing seeded-stream boundary, not a decision about the expression API.

### Engine–mod protocol — design pass 1

This is a protocol sketch for the second design pass, not a settled contract. BR said custom state and events “are required for the core game too” and asked whether “events are really the protocol between engine and mod”. The candidate protocol is:

1. **Declarations at load:** each mod declares the state it owns, its schema and default, whether that state is saved, the events it subscribes to, and the effects it may emit. The engine can validate and hash these declarations before execution.
2. **Events, engine to mod:** events describe coarse-grained facts that happened, such as a wound, elapsed time, item use, heard noise or finished action. A rule receives the event and a read-only view of its declared state. Events should be coarse-grained (for example, on-hit, on-wound or every N seconds), never emitted per frame per entity.
3. **Effects, mod to engine:** a rule returns effects as data—intents such as damage a region, set a variable, add a status, spawn, emit a noise or award practice. The engine validates and applies them in a defined order; mods do not mutate game state.

The candidate rule boundary is `(event, state) → effects`. The core mod uses the same protocol as add-on mods. Use the infection rule from #303 as a worked example: a wound or elapsed-time event reaches the core-mod rule; its onset/chance logic returns intents to set the infection stage and shock. In this pass-1 candidate, that rule would belong to the core mod rather than engine code; pass 2 must decide the boundary. Mind Over Matter uses the same pattern across many more rules.

Weather is a second worked example of the engine/mod split. BR said (2026-10-06, 12:08): “i'm thinking weather should be something mods bring ; or at least the configuration of it. E.g. if a mod want to make it rain continually, then allow it”; “but the weather system should be in code”; “so yeah, mods should be able to read weather, via e.g. weather_changed event?” In this pass-1 candidate, the engine owns weather simulation over time, transitions, deterministic randomness, saves, rendering and audio; mods author weather configuration such as states, likelihoods, durations, intensities and seasonal variation. An add-on could configure continual rain. BR suggested a `weather_changed` event for rules reacting to transitions. The current `src/core/weather.ts`, `Weather` and `skyInWeather`, is render-only and explicitly has no simulation weather system yet. A rule triggered by another fact, such as a wound, may also need current weather to test whether it is raining outdoors; that is a concrete instance of the still-open state-read question, not an answer to it.

This pass-1 candidate keeps hot-path, exactness-critical mechanics such as movement, collision, ray tests, scheduling, saves, rendering and audio mixing in the engine, with rules and tuning values authored by mods. Ownership and precise rules for ordering and conflicts remain open for the second pass.

### Core mod and identity

The core mod is the current base pack, not a special source of built-in defaults. A future composition has a whole-corpus canonical hash covering every mod and the core. That identity participates in exact save/replay compatibility; see `src/core/saveFormat.ts`, `SaveVersionComponents`. The expression evaluator and parser are TypeScript simulation behavior and remain covered by the simulation source fingerprint; see `tools/simulationFingerprint.ts`, `SIMULATION_ENTRIES`.

## Consequences

- A Jsonnet build step is required. Candidate implementations for the spike include Google's C++ Jsonnet CLI, Go's `go-jsonnet`, go-jsonnet's WebAssembly build, and an npm-packaged binding; none is selected or installed by this ADR. Any dependency must meet `AGENTS.md`'s dependency-age rule when the spike selects it.
- Biome and Knip do not lint Jsonnet. `jsonnetfmt` checks Jsonnet formatting; evaluate the generated JSON and run it through `npm run validate`, whose schema and reference checks remain the content contract. The spike must decide whether a separate Jsonnet linter adds useful checks beyond formatting and validation.
- The project owns the runtime expression parser, compiler, evaluator, validation and tests. Runtime call cost, build time, CI cost and authoring fluency are measured in the spike, not assumed here.
- Adding a function, tuning value or mod changes the composed corpus and its identity. The hash includes the core even when its contents are unchanged by an add-on mod.

## Open questions for BR

The second design pass must resolve, or deliberately leave for the spike, these expression-format questions:

- What is the grammar surface: operators and precedence, numeric domain and edge semantics, literals for tables, and out-of-range table behavior? Which built-ins belong in the closed set?
- Are function arguments named or positional, including CDDA's `_0` convention? How does content refer to a function, and what is the inline form for a numeric expression?
- How does each call site declare its inputs, and how does validation prove an expression uses only those inputs?
- How is the simulation RNG stream passed through a pure expression, if expressions may draw randomness?
- Which expression errors are found by `npm run validate`, and how are they reported with source and path?
- How do mods override or extend a function definition, and how does that interact with the still-open mod load order and conflict policy?

For the engine–mod protocol, what is the event catalogue, including the boundary between events and condition checks? What effect vocabulary may rules return? How may rules read state beyond their own declared state? BR said this “needs thoughtful consideration”; this survey does not propose an answer. BR wants ordering and conflict policy to be “simple but useful”, not clever, and offered `dependencies: Mod[]` as a possibility, asking “maybe not much more than that?” What, if anything, beyond dependencies is needed? How are mod-owned state schemas, defaults, save ownership and ability progress declared? Which abilities need to be represented, including targeting, costs, effects and practice? How do existing TypeScript rules migrate into the core mod?

BR's 11:52 direction is that migration should be incremental but use a low number of big steps. Which steps, and their boundaries, remain for pass 2. For the event catalogue and vocabulary, the as-is survey linked above is the starting input to pass 2.

What is the simplest useful ordering and conflict policy? How do overrides differ from extensions, and how are conflicting definitions diagnosed? One option for the core is a privileged but replaceable slot with no special privilege in composition: loading the same core mod through an ordinary non-core slot should produce identical composed output. Is that the intended boundary? Which content area should the spike port first?

## When

After Slice 3, or earlier if BR directs, spike one content area and one runtime function (for example, a dismemberment launch curve): author and compose them in Jsonnet, validate the emitted corpus through the content schema, and evaluate a candidate expression format. Measure build and CI cost, per-call runtime cost, and authoring fluency. Existing TypeScript tuning values migrate only in follow-up work after that spike.

### Design passes

Pass 1 is this proposed ADR, including the candidate expression shape and open questions. Pass 2 follows BR's review and is informed by the spike if it has run. The serializable function format is fixed only when BR accepts it; until then, revise this ADR rather than treating the sketch as a settled contract.
