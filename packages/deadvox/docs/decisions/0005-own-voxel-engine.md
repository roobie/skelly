---
read_if:
  - you're evaluating the engine, selected Rapier f64 build or rendering stack
  - you're changing the boundary between simulation, rendering and authored content
  - you're asking why Deadvox is a browser game with no game server
tags: [deadvox, adr, engine, voxel, rendering]
---

# 5. Own the voxel engine; render with three.js

**Status:** accepted.

## Context

Deadvox prioritizes a deep simulation and a moddable, text-dense interface. Its world must pause, advance at different rates, catch up unloaded areas and save as project-owned data. Multiplayer, after version 1, is lockstep, so the engine needs deterministic simulation but no server authority or network chunk streaming, making a small project-owned voxel engine practical; see [ADR 0008](0008-deterministic-world.md).

## Decision

Build a TypeScript browser game with its own chunked voxel engine and simulation. Use three.js for world rendering, HTML/CSS for the interface, and data files for authored content. Publish a static build to GitHub Pages.

Keeping the simulation as plain data separate from rendering supports pause, time compression, catch-up and exact saves. HTML/CSS supports the text-dense, moddable interface; its screen boundary is in [ADR 0001](0001-ui-rendering-with-lit-html.md). Content packs keep authored items and systems extensible; their language is in [ADR 0004](../../../../docs/decisions/0004-content-language.md).

## Rejected alternatives

- Luanti's server-driven formspec UI limits client-side UI modding; Wasm does not change that boundary.
- noa supplies voxel systems on Babylon.js, handing systems the game can keep project-owned to a library.
- Voxelize's authoritative server and network chunk streaming solve a server-authoritative multiplayer that lockstep does not need.
- Divine Voxel Engine uses worker-based world generation and meshing, but hands meshing to a library rather than keeping the small engine project-owned.
- Godot 4's networking no longer decides the choice, and its web export and UI fit the browser-native interface less well.
- Bevy adds a Rust-to-Wasm toolchain while bringing fewer built-in game systems than the other engine options.

## Consequences

Vehicle physics integration, animation and audio remain project work. Driving and parked collision use the project-owned Rapier f64 build shared with ragdolls under [ADR 0009](0009-rapier-f64-build.md); owning the voxel engine does not require owning a separate rigid-body solver. GitHub Pages cannot set response headers.
