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
model when its input version changes; it sends commands to the game and owns
only presentation state. `src/core` does not depend on the UI library.

This keeps the simulation headless and makes screen updates preserve unchanged
DOM, including focus and scroll position. It also avoids maintaining hand-built
DOM replacement code as the inventory and crafting interfaces gain state.

`test/uiLitHtml.test.ts` guards the rendering boundary. See `src/ui` for the
screen implementations.

## Consequences

lit-html is a runtime dependency, and its templates are checked separately from
the application TypeScript compiler. The view-model boundary keeps a future
renderer change from requiring changes to simulation owners.
