---
read_if:
  - you're changing the screen and view-model boundary
  - you're evaluating a UI renderer or changing simulation dependencies
tags: [deadvox, adr, ui, lit-html]
---

# 1. Render the UI with lit-html

[[THIS grounds: ../../INTERACTIONS.md]]

**Status:** accepted.

## Decision

Render screens with lit-html from plain view models. Screens send commands and own presentation state; `src/core` has no UI-library dependency. Updating only changed DOM preserves focus and scroll position while keeping the simulation headless.

The core remains plain mutable state rather than adopting a reactive framework: those models would change the simulation boundary without a project need. Keep new dependencies small and maintainable, and do not depend on a single maintainer.

Template bindings are checked separately from application TypeScript. Keep the isolated TypeScript 5 analyzer pin until a replacement supports the template contract. `test/uiLitHtml.test.ts` guards the screen boundary; screen implementations live in `src/ui`.
