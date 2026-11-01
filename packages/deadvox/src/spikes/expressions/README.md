---
read_if:
  - you're evaluating expression runtimes or extending the isolated Wasm spike
  - you're interpreting the expression benchmark or its safety claims
  - you're evaluating CEL for MoM-shaped mod logic or its engine contracts
  - you're assessing function libraries, local bindings or engine helper reuse in the CEL spike
---

# Expression runtime evidence

## Published runtime boundary

Only published browser artifacts are eligible for this spike. Building a language from a downloaded
repository would answer a different question: whether we can own a compiler distribution, rather
than whether a mod loader can consume an extant distribution. Grain is stopped at this boundary:
its eligible published compiler bundle is not browser-ready, its browser wrapper does not meet the
dependency-age rule, and native compiler releases cannot implement browser load-time compilation.
A failed artifact search is not evidence that the language itself is unsuitable.

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

Native CEL binding avoids owning a second binding language or duplicating a costly expression.
The restricted aggregate profile deliberately excludes nested collection construction: aliases can
otherwise turn a small authored tree into exponentially more equality or membership work without
increasing its outer collection width. Flat aggregates preserve useful local reuse without owning
expanded-shape accounting. See `celMods.ts`, `compileModExpression`, and
`../../../test/celReuseSpike.test.ts` for the enforced profile, checker, single-evaluation and
lexical-scope evidence. The production profile starts from this restriction; see
`../../../../../docs/decisions/0004-content-language.md`, "Runtime design".

Scoped state snapshots prevent aggregate membership and equality from revealing independent mods'
state. Named functions require explicit snapshots rather than capturing mutable game state, so
language implementation stays in CEL rather than a second engine evaluator. See `celMods.ts`,
`ModHarness` and `FunctionDef`, and `../../../test/celReuseSpike.test.ts` for list and record-like
map reuse. CEL's checker remains authoritative; host collection validation and copying are part of
the termination proof, not just type hygiene.

Native double arithmetic can silently produce infinity even inside a predicate, so checking only
a final result would miss invalid intermediates. Author arithmetic therefore passes through a
parse-rewrite-serialize boundary before compilation; see `celRewrite.ts`, `serializeRewrite`, and
`celMods.ts`, `compileModExpression`. Public typed APIs keep the package as received and avoid
owning an install-time library patch or depending on undocumented runtime handler tables.
The numeric-only checked boundary rejects string and list concatenation rather than silently
retaining unchecked operators. Checked integer operands promote to bounded doubles, so author
arithmetic does not inherit native integer truncating division or integer overflow behaviour.
Integer literals still have CEL's integer type outside the checked signatures; this is not a
general implicit conversion policy for effects, named functions or comparisons.

Serialization is a semantic boundary, not merely formatting. The loader rejects a changed tree or
literal instead of compiling it: the package serializer can round fractional doubles and omit
parentheses in nested comparisons. See `../../../test/celRewriteSpike.test.ts` for fidelity,
operator-removal and mixed-signature probes. Rejecting a valid authored
expression because it cannot survive the serializer is an authoring limitation, not safe support
for that expression.

CEL's logical operators and macros can recover from an evaluated callback exception when another
operand supplies a decisive result. The spike's strict checked-callback contract therefore needs
an out-of-band failure latch per evaluation; see `celMods.ts`, `compileModExpression`. Every
registered callback records failure before throwing, and a recovered result is rejected before
any effect application. Named bodies enforce the same boundary, and their failures propagate
through the caller's latch. Unevaluated short-circuit branches record no failure. This owns an
engine-boundary error policy, not a replacement evaluator.
CEL-native errors that never enter a checked callback retain CEL's recoverable semantics.

Diagnostics must refer to authored source, not generated calls. The rewrite pairs structurally
identical trees to recover original locations; per-call checked aliases retain arithmetic anchors
even through suppressed callback errors. See `celRewrite.ts`, `serializeRewrite`, and `celMods.ts`,
`compileModExpression`. Other callback failures without CEL locations fall back to the original
expression root, so this is not exact subexpression evidence for every host callback.

Termination relies on rejecting recursion, dynamic dispatch, unbounded collections and nested
traversal macros, not on an unavailable interpreter instruction counter. Bounded all/exists over literal or
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

The game's mod rules are in `../../../../../docs/decisions/0004-content-language.md`, "Mod rules";
the harness settles none of them. Each item says what the spike exercised and where that differs
from the rule. The differences change the engine envelope or the admitted CEL environment, not
CEL's ability to evaluate a pure expression.

- **Target:** only the rule layer is exercised. The rule's same-kind mod in the game's own
  vocabulary needs further engine verbs and content kinds, which the actor ledger does not prove.
- **Triggers:** only engine-emitted typed events are exercised. Mod-scheduled timers, enter and exit
  event pairs and timer-checked predicates need engine scheduling and cancellation, which the spike
  does not prove. CEL can consume their snapshots.
- **Randomness:** the spike supplies a seeded engine draw as an input, including weighted selection.
  The rule differs: CEL returns random thunks that the engine resolves, so the draw input and direct
  roll predicates go.
- **Effect vocabulary:** a fixed typed engine effect vocabulary is exercised. Mod-defined effects
  that expand to engine verbs need registration and validation outside CEL and are not exercised.
- **Mod state:** bounded namespaced counters are exercised. Flags, scopes, enums and refs are not
  proved by a numeric counter.
- **Composition:** dependency-scoped function libraries, replacement and an optional gated interaction
  pack are exercised. The optional pack goes beyond the rule, which links only hard dependencies.
  See `celMods.ts`, `ModHarness`, and
  `../../../test/fixtures/mods/cel-reuse-spike.jsonnet`. Lexical owner scopes prevent a dependent's
  replacement from altering its library or an independent sibling; visible replacement conflicts
  are rejected rather than resolved by incidental load order. Library bodies retain their owner's
  bindings, not a caller's overrides. These rules trade global patching power for local reasoning.
  Dependency IDs can encode a library version without a solver: changing the ID requires dependent
  references to change; retaining the ID with a breaking signature produces checker diagnostics.
  Compatible body changes still change mod identity. Rule references are engine-envelope links,
  not CEL calls.
- **Local reuse:** native expression-local binding and typed collection functions are exercised, not
  chosen as a production profile. See `../../../test/celReuseSpike.test.ts`. Jsonnet helpers can
  share authoring text but cannot provide replaceable runtime symbols; named functions can, at the
  cost of typed boundaries, collection validation/copying and reachable-body cost reservation.
- **Engine library:** checked, typed engine helpers available without dependencies are exercised, not
  chosen. See `celMods.ts`, `maths`, `compileModExpression` and `engineLibraryIdentity`. Mod namespacing
  keeps a same-name mod helper distinct; engine symbols cannot be replaced through a mod declaration.
  Changing engine helper semantics requires a library identity change for strict save/replay
  rejection, even when mod source stays unchanged. A production engine-library vocabulary and version
  policy remain open in #313.
- **Effect combining:** dependency order then lexical rule order, with every effect applied in turn,
  is exercised and matches the rule. Tick rollback is the harness's own. A later rule sees earlier
  state changes, including changes from a chained rule.
- **Field patches:** not exercised. They belong to the content loader, not CEL; see
  `../../../../../docs/decisions/0007-typed-field-patches.md`, "Decision".
- **UI:** not exercised; mod UI is deferred to a spike once CEL rules run in the engine (#313).
- **Core tuning:** a mod changes a core value as it changes any pack's value
  (`../../../../../docs/decisions/0004-content-language.md`, "Runtime design"); this is not exercised.
  Overrides need engine authorization and identity; exposing more numeric inputs alone does not
  authorize writes.
- **Save mismatch:** strict mod-identity/state rejection is exercised and is the game's rule
  (`../../../docs/decisions/0002-saves.md`, "Compatibility"); no save migration is implied.

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
load-time compilation with each rule's scoped functions already compiled, then unconditional predicate
and effect evaluation on fixed snapshots. It excludes harness construction, effect application,
state copying and scheduling. The `--mods --reuse` probe adds the reuse fixture; named calls include
collection boundary validation/copying, but neither mode measures library compilation or the whole
mod-loader lifecycle. The `--mods --bundles` mode compares deployable scalar CEL and mod
profile entries so wrapper growth is not mistaken for additional CEL package code. Browser microbenchmarks are not whole-simulation guarantees either.

See `../../../test/expressionWasmCases.ts`, `wasmCases`, for behaviour checks shared between Node
and browser probes. Float equality across engines is bounded fixture evidence, not proof of all
floating-point programs or future runtime versions. CEL is adopted; see
`../../../../../docs/decisions/0004-content-language.md`, "Decision".
