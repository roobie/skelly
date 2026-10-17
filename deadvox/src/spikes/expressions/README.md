---
read_if:
  - you're evaluating expression runtimes or extending the isolated Wasm spike
  - you're interpreting the expression benchmark or its safety claims
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
guarantees. Browser microbenchmarks are not whole-simulation guarantees either.

See `../../../test/expressionWasmCases.ts`, `wasmCases`, for behaviour checks shared between Node
and browser probes. Float equality across engines is bounded fixture evidence, not proof of all
floating-point programs or future runtime versions. No runtime is adopted; see
`../../../../docs/decisions/0004-content-language.md`, "Runtime design".
