---
read_if:
  - you're evaluating the engine, physics or rendering stack
  - you're changing the boundary between simulation, rendering and authored content
  - you're asking why Deadvox is a browser-based single-player game
tags: [deadvox, adr, engine, voxel, rendering]
---

# 5. Own the voxel engine; render with three.js

**Status:** accepted.

## Context

Deadvox prioritizes a deep simulation and a moddable, text-dense interface. Its world must pause, advance at different rates, catch up unloaded areas and save as project-owned data. Single-player removes networking and server authority as engine requirements, making a small project-owned voxel engine practical.

## Decision

Build a TypeScript browser game with its own chunked voxel engine and simulation. Use three.js for world rendering, HTML/CSS for the interface, and data files for authored content. Publish a static build to GitHub Pages.

Keeping the simulation as plain data separate from rendering supports pause, time compression, catch-up and exact saves. HTML/CSS supports the text-dense, moddable interface; its screen boundary is in [ADR 0001](0001-ui-rendering-with-lit-html.md). Content packs keep authored items and systems extensible; their language is in [ADR 0004](../../../docs/decisions/0004-content-language.md).

## Consequences

Vehicle physics, animation and audio remain project work; Rapier is a candidate, not a selected dependency. GitHub Pages cannot set response headers, as noted in [CHALLENGES.md](../../CHALLENGES.md).
