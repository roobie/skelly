---
read_if:
  - you're evaluating expression runtimes or extending the isolated Wasm spike
  - you're interpreting the expression benchmark or its safety claims
  - you're evaluating CEL for MoM-shaped mod logic or its engine contracts
---

# Expression runtime evidence

## Published runtime boundary

Only published browser artifacts are eligible for this spike. Building a language from a downloaded
repository would answer a different question: whether we can own a compiler distribution, rather
than whether a mod loader can consume an extant distribution. Grain is stopped at this boundary:
its eligible published compiler bundle is not browser-ready, its browser wrapper does not meet the
dependency-age rule, and native compiler releases cannot implement browser load-time compilation.
Revisit Grain in #313 if an eligible browser compiler distribution becomes available. A failed
artifact search is not evidence that the language itself is unsuitable.

See `starlark.ts`, `starlark`, and `luau.ts`, `luau`, for the executable candidates. The bindings
do not expose a deterministic instruction budget, so this comparison uses a bounded scalar profile
rather than claiming unrestricted sandbox safety. See `wasmProfile.ts`, `checkWasmProfile`.
The restriction is ours, not a limitation of either language. It excludes stateful statements and
unbounded work before entering Wasm; widening it requires a different termination proof. Wasm alone
provides neither purity nor termination.

The Starlark binding exposes execution rather than retained compilation. Its load probe compiles the module
without inventing inputs or executing the rule, and its call cost includes recompilation. Neither
binding exposes a static analyzer, so operand typing remains an evaluation concern. The Luau
spike retains one runtime for the spike's lifetime: the published binding's state teardown followed
by a fresh state produced invalid function references. Scalar rules cannot access the retained
runtime or each other's closures. This is not proof of an unloadable production mod lifecycle.

Identity must cover source, the runtime distribution and the enforced profile as well as the typed
boundary; see `contract.ts`, `serializeIdentity`. Retaining original source avoids claiming an
unavailable language canonicalizer. Changes to bindings, numeric conversion or the profile require
an identity change; hashing source alone cannot capture those semantic changes.

## CEL mod boundary

The mod profile is separate from the scalar `contract.ts`, `Candidate`: otherwise collection and
composition evidence would silently change the scalar comparison. See `celMods.ts`,
`compileModExpression` and `ModHarness`, and `../../../test/celModsSpike.test.ts`. Authored
mini-mods live in `../../../test/fixtures/mods/cel-mod-spike.jsonnet`; nothing in the shipped game
imports the harness. The dummy engine applies counter changes and accumulates effects on one
engine-bound actor ledger, not a world simulation. World verbs remain engine work.

CEL supplies the parser, AST locations, typed function signatures, list/map evaluation and
all/exists macros. The harness supplies dependency-scoped symbols and state snapshots,
function-body compilation and replacement, event ordering, effect validation, seeded draws,
counter ownership and save validation. State snapshots contain only the rule's own and visible
dependencies' keys, so aggregate membership and equality cannot reveal independent mods' state.
This keeps language implementation in the package rather than rebuilding an evaluator in the
engine. Named functions cannot capture mutable game state: callers pass numeric snapshots
explicitly.

Native double arithmetic can silently produce infinity even inside a predicate. The mod profile
therefore admits arithmetic through typed, finite-checking functions rather than native arithmetic
operators. The package refuses replacement of its built-in numeric operator overloads; wrapping a
final result alone would miss invalid intermediate values. See `celMods.ts`, `maths`, and
`../../../test/celModsSpike.test.ts` for the executable hazard probe. This is harness-supplied
arithmetic, not evidence for safe native operator syntax. Choosing operator syntax would require
numeric range analysis or evaluator instrumentation before claiming the same error contract.

CEL's logical operators and macros can recover from an evaluated callback exception when another
operand supplies a decisive result. The spike's strict checked-callback contract therefore needs
an out-of-band failure latch per evaluation; see `celMods.ts`, `compileModExpression`. Every
registered callback records failure before throwing, and a recovered result is rejected before
any effect application. Named bodies enforce the same boundary, and their failures propagate
through the caller's latch. Unevaluated short-circuit branches record no failure. This owns an
engine-boundary error policy, not a replacement evaluator or a production adoption decision.
CEL-native errors that never enter a checked callback retain CEL's recoverable semantics.

Runtime issues identify the rule's predicate or effects expression; named-body errors also identify
the defining mod and function. Offsets may fall back to the expression root for callback errors,
so this is partial author-facing location evidence, not exact subexpression source mapping.

Termination relies on rejecting recursion, dynamic dispatch, unbounded collections and nested
macros, not on an unavailable interpreter instruction counter. Bounded all/exists over literal or
validated input lists remain useful without permitting arbitrary comprehensions. The structural
reservation includes reachable function bodies, worst-case macro traversal and bounded aggregate
comparisons. The tick spends that reservation before evaluation, across event roots and chained
branches. It is conservative work accounting, not a millisecond deadline or a CEL-native fuel
meter. Host callbacks must remain synchronous and bounded; widening callbacks or macros requires
revisiting that proof. Runtime input size validation is part of the proof, not optional hygiene.

Each rule reads a fresh scoped snapshot after preceding effects. A propagated CEL error, latched
checked-callback failure, rejected engine write or budget failure discards the whole tick's ledger,
counters and random draws. This prevents partial effects without treating CEL's native recoverable
errors as JavaScript exceptions. It is not a production engine transaction design. The fixture's
decay event stands in for an engine game-time timer: no scheduler, NPC lifecycle, continuous
modifier system or re-entrant event emission is proved. Those contracts belong to #313.

## Exercised, not chosen

These representatives keep open choices visible rather than letting a test harness settle them.
The alternatives below change the engine envelope or the admitted CEL environment, not CEL's
ability to evaluate a pure expression.

- **Target fidelity:** rule-layer fidelity is exercised, not chosen. A close MoM port or same-kind world mod
  requires additional engine verbs and content kinds; the actor ledger proves neither.
- **Triggers:** engine-emitted typed events are exercised, not chosen. Timers require engine scheduling
  and cancellation; continuous conditions require modifier hooks. CEL can consume their snapshots.
- **Randomness:** a seeded engine draw supplied as an input, including weighted selection, is exercised,
  not chosen. Engine-only randomness would remove the draw input; weighted-only randomness would
  narrow the callable surface and disallow direct roll predicates.
- **Effect vocabulary:** a fixed typed engine effect vocabulary is exercised, not chosen. Mod-defined effects or
  engine extensions need registration and validation outside CEL before their constructors exist.
- **Mod state:** bounded namespaced counters are exercised, not chosen. Engine-only state would remove
  mod declarations; arbitrary records need richer schemas, size bounds and save validation. Flags,
  enums and per-character progression are not proved by a numeric counter.
- **Composition:** hard dependencies with named function calls/replacement and an optional gated interaction
  pack are exercised, not chosen. Independent mods would prohibit cross-references; hard-only
  composition would remove optional gating. Rule references are engine-envelope links, not CEL calls.
- **Effect combining:** dependency order then lexical rule order, sequential effects and tick rollback are
  exercised, not chosen. Priorities or conflict rejection change harness validation and dispatch,
  not CEL. A later rule sees earlier state changes, including changes from a chained rule.
- **Field patches:** field-patch policy is not exercised or chosen. Jsonnet can patch definitions before CEL
  sees them; whole replacement or load-time patching still belongs to the content loader.
- **UI:** UI policy is not exercised or chosen. Read-only declarations or custom panels require
  renderer contracts; they do not follow from collection evaluation.
- **Core tuning:** core-tuning policy is not exercised or chosen. Replacement or modifier hooks need engine
  authorization and identity; exposing more numeric inputs alone does not authorize writes.
- **Save mismatch:** strict mod-identity/state rejection is exercised, not chosen. Dropping unknown state or
  migrations would change restore semantics outside CEL; no save migration is implied.

## Reading measurements

See `../../../tools/bench-expressions.mjs`, `measureBundles`, for deployable output sizes including
Wasm and dynamic runtime alternatives. Summing alternatives describes the full deployment, not a
single browser's selected download. Embedded Wasm is already counted in its JavaScript file; a
separate Wasm asset is counted in addition to its loader. Library-mode baseline output and
application-mode deployable output are different measurements and must be labelled separately.

See `benchmark.ts`, `benchmarkWasmExpressions`, for the browser comparison, and
`../../../tools/probe-wasm-expressions.mjs` for cross-engine evidence. Awaiting each result includes
marshalling and the asynchronous binding boundary even for synchronous baselines. Initialization
and retained-rule evaluation must not be conflated. A repeated-load mean excludes first-use runtime
initialization. Node microbenchmarks remain probes, not browser or whole-simulation frame-budget
guarantees. For CEL mod rules, `../../../tools/bench-expressions.mjs`, `measureModRules`, measures
load-time parse/profile/typecheck with functions already registered, then unconditional predicate
and effect evaluation on fixed snapshots. It excludes harness construction, effect application,
state copying and scheduling. The `--mods --bundles` mode compares deployable scalar CEL and mod
profile entries so wrapper growth is not mistaken for additional CEL package code. Browser microbenchmarks are not whole-simulation guarantees either.

See `../../../test/expressionWasmCases.ts`, `wasmCases`, for behaviour checks shared between Node
and browser probes. Float equality across engines is bounded fixture evidence, not proof of all
floating-point programs or future runtime versions. No runtime is adopted; see
`../../../../docs/decisions/0004-content-language.md`, "Runtime design".
