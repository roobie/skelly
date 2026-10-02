---
id: skelly::deadvox-adr-0001
description: Decision record choosing lit-html to render deadvox's HTML screens, and the redraw contract it works under
tags: [deadvox, adr, ui, lit-html]
created: 2026-09-26
status: active
---

# 1. Render the UI with lit-html

[[THIS grounds: ../../INTERACTIONS.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]

**Status:** accepted (2026-09-27, issue #25) and implemented. Proposed 2026-09-26.
The port was completed in Slice 1: the last screen, the inventory, moved to
lit-html in #105, and `NOT_YET_PORTED` in `test/uiLitHtml.test.ts` is empty
(checked 2026-10-03).

## Context

The screens (inventory, quickbar and handling bar, death screen, credits, spawn
menu) are plain DOM: about 1,030 lines in `src/ui`, 710 of them the inventory
screen. Each screen builds its elements by hand and, when anything changes,
throws them away and builds them again (`replaceChildren`). The game loop
decides when: each frame, `InventoryScreen.update` builds a key from the
inventory's and the block entities' version counters and redraws when it
changes. PROJECT.md recorded the choice to wait: "No framework yet; pick one
when screens get stateful".

They're getting stateful. Crafting (Slice 2) and appliances (Slice 5) add
panels that list recipes with what's missing, half-made items, and appliance
controls, all next to the inventory ([INTERACTIONS.md](../../INTERACTIONS.md)).
Rebuilding everything on each change already loses scroll position, focus and
hover, and it makes each new panel more DOM plumbing.

The constraints:

- The game state is plain mutable objects in `src/core`, tested headless and
  meant to move to a worker. The UI reads it and sends commands; it must not
  make the core depend on a UI library or its reactivity.
- The redraw trigger is "a version counter changed", polled each frame.
- The build is Vite and TypeScript with no Babel, and there are two runtime
  dependencies (three.js and Valibot). New ones should be small and not rest
  on one person.

Options, with npm registry data from 2026-09-26 (npm maintainers are people with
publish rights, not the size of the team):

| Library | Latest | npm maintainers | Fit |
| --- | --- | --- | --- |
| lit-html | 3.3.3 (2026-05-14) | 13 | `render(template(state), el)` when the key changes; updates only what changed; standard tagged templates, no build step |
| Mithril | 2.3.8 (2025-11-08) | 4 | Virtual DOM redrawn and diffed on `m.redraw()`; hyperscript, no build step; components with lifecycle hooks |
| Preact | 10.29.8 (2026-08-01) | 6 | React's API; JSX that Vite compiles itself, or `htm` (one maintainer, last published 2022) |
| Solid | 1.9.15 (2026-08-17) | 1 | Fine-grained signals; needs its own JSX compiler plugin, and the core's state isn't signals |
| Svelte | 5.57.1 (2026-09-18) | 3 | A compiler with its own reactivity; same mismatch as Solid |

## Decision

Draw the HTML screens with **lit-html**:

- Each screen is a function from a view model (a plain object built from core
  queries) to a `TemplateResult`, rendered into its container with `render()`.
- The redraw contract stays as it is: each frame, a screen builds a key from the
  versions it depends on plus its UI state, and renders when the key changes.
  lit-html updates only the parts of the DOM that changed.
- Events call core commands. Drag and drop stays a small controller that owns
  its UI state and produces a move target.
- Nothing in `src/core` imports lit-html.
- Every screen moves to lit-html, and no screen stays plain DOM. New screens are
  written in lit-html from the start.
- The move goes one screen at a time. The spawn menu and the death screen came first,
  then the credits and the HUD (quickbar and handling bar). The inventory screen came
  last, with its behaviour unchanged (#105), before Slice 2's crafting work changes it.
- `test/uiLitHtml.test.ts` fails on hand-built DOM in `src/ui` and `src/debug` outside
  a list of screens not yet ported. The list only shrinks, and the port is done when
  it is empty. It has been empty since #105.

## Consequences

- One new runtime dependency. Its only dependency is a types package,
  `@types/trusted-types`. It isn't a framework: there is no component system, router or store, so screens are
  plain functions, and "components" are functions that return templates.
- DOM that didn't change is kept between redraws, so scroll position, focus,
  hover and CSS transitions survive, and coarse version counters stay cheap
  (INTERACTIONS.md, "Reach").
- Templates are strings to TypeScript, so a mistyped attribute or binding isn't
  a type error on its own. `lit-analyzer` checks them, but it needs the classic
  TypeScript Compiler API, which TypeScript 7 (the app's compiler) doesn't have;
  `deadvox/tools/lit-check` runs it under a pinned TypeScript 5 instead, isolated
  from the app's dependencies, as `npm run lint:lit`, and CI fails on any finding.
  Its last release is 2.0.3 (2024-01): if it stops working with a later
  TypeScript 5 or lit-html, the pin holds until there is a replacement.
- View models can be tested in Node without a DOM. lit-analyzer checks the
  templates' HTML, bindings and types; what they look like is still checked
  by eye.
- Reversing the choice means rewriting templates, not the core: the view models
  and the command boundary don't depend on lit-html.
- PROJECT.md's UI row names lit-html.
