---
id: deadvox::adr-0005-own-voxel-engine
description: Decision for Deadvox's browser-based, single-player voxel engine and rendering stack
read_if:
  - you're evaluating a voxel engine, physics or rendering library for Deadvox
  - you're asking why Deadvox is a browser-based, single-player game
  - you're changing the boundary between simulation, rendering and authored content
tags: [deadvox, adr, engine, voxel, rendering]
created: 2026-10-08
status: accepted
---

# 5. Own the voxel engine; render with three.js

**Status:** accepted.

## Context

Deadvox is a browser game for one player. The important work is a deep simulation
and a moddable, text-dense interface, not networked play. Without multiplayer,
there is no netcode or server authority to build. A project-owned voxel engine is
small enough to keep the world and its simulation under our control.

The project needs a browser-native interface and a simulation whose state can be
paused, advanced at different rates, caught up after areas are unloaded, and
saved as project-owned data. The engine choice must support that split as well as
a static build and deployment.

## Decision

Build Deadvox as a TypeScript browser game with its own chunked voxel engine and
simulation. Use three.js to render the world, HTML and CSS for the interface, and
data files for authored content. Build through GitHub and deploy the static game
to GitHub Pages.

- Single-player removes networking and server authority as engine requirements;
  chunk storage, meshing and simulation rules can stay under project control.
- The interface is moddable and text-dense, like Cataclysm: DDA. HTML and CSS
  provide the needed interface without putting the simulation in a UI framework.
  The screen boundary and rendering contract are in
  [ADR 0001](0001-ui-rendering-with-lit-html.md).
- Simulation state remains plain data, separate from rendering. This supports
  pause, time compression, unloaded-area catch-up and exact saves; see
  `DESIGN.md`, `Simulation architecture`, and [ADR 0002](0002-saves.md).
- Authored content is data that systems compose into the game, rather than
  mechanics duplicated in a UI or engine library. The content direction is in
  [ADR 0004](0004-content-language.md).
- GitHub Actions builds the game for the static Pages deployment described by
  `.github/workflows/pages.yml`.

## Alternatives considered

- **Luanti and minetest-wasm:** Wasm does not change Luanti's server-driven formspec UI, which limits client-side UI modding.
- **noa:** It supplies voxel systems on Babylon.js; that replaces the chosen three.js renderer and takes control of systems the game can keep project-owned.
- **Voxelize:** Its authoritative server and network chunk streaming solve multiplayer requirements this game does not have.
- **Divine Voxel Engine:** Its Babylon.js worker engine adds a second voxel-engine stack instead of the small project-owned chunk pipeline.
- **Godot 4 with godot_voxel:** Its networking no longer decides the choice; its web export and text-dense UI are a poorer fit than the browser stack.
- **Bevy:** It brings a Rust-to-Wasm toolchain with fewer built-in game systems than the other engine options.

## Consequences

- Vehicle physics, animation and audio remain project work. Rapier is the
  candidate for vehicle physics, not a selected dependency; see `DESIGN.md`,
  `Vehicles`.
- GitHub Pages cannot set response headers; see `CHALLENGES.md`, `Browser limits`.
