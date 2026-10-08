---
read_if:
  - you're changing how Deadvox screens render or update
  - you're evaluating the boundary between UI and simulation state
tags: [deadvox, adr, ui, lit-html]
---

# 1. Render the UI with lit-html

[[THIS grounds: ../../INTERACTIONS.md]]

**Status:** accepted.

## Decision

Render every Deadvox HTML screen with lit-html. A screen renders a plain view
model when its input version changes, sends commands to the game and owns only
presentation state. `src/core` does not depend on the UI library. Updating only
changed DOM preserves focus and scroll position while keeping the simulation
headless.

The core uses plain mutable state, not signals. Solid and Svelte's reactive
models do not fit without changing that boundary. New dependencies should stay
small and should not depend on a single maintainer.

Template bindings are not checked by the application TypeScript compiler.
`lit-analyzer` checks them through the classic TypeScript Compiler API, which
TypeScript 7 lacks. `tools/lit-check` runs the analyzer under a pinned TypeScript
5, isolated from application dependencies; `npm run lint:lit` runs it, and CI
fails on a finding. Keep the TypeScript 5 pin until there is a replacement.

## Consequences

The screen and view-model boundary keeps a future renderer change out of the
simulation owners. The boundary is guarded by `test/uiLitHtml.test.ts`; screen
implementations live in `src/ui`.
