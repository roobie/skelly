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

Single-player is the decision this one follows from. While multiplayer was a
requirement, Godot 4's built-in networking made it the stronger choice. Dropping
that requirement removes netcode and server authority; it also makes a small
voxel engine of our own realistic.

The important work is a deep simulation and a moddable, text-dense interface, not
networked play. A project-owned voxel engine keeps the world and its simulation
under our control.

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
- The interface must be moddable and text-dense, like Cataclysm: DDA. HTML and
  CSS over the canvas make body-part wounds, nested containers, crafting trees,
  dense tooltips and logs far easier than any game UI toolkit. Moddable UI is also
  why Luanti fell out. The screen boundary and rendering contract are in
  [ADR 0001](0001-ui-rendering-with-lit-html.md).
- Simulation state remains plain data, separate from rendering. This supports
  pause, time compression, unloaded-area catch-up and exact saves; see
  `DESIGN.md`, `Simulation architecture`, and [ADR 0002](0002-saves.md).
- Content data files for items, materials, recipes, body parts, loot and zombie
  types merge with mod folders, giving moddability for free. The content
  direction is in [ADR 0004](0004-content-language.md).
- Building on GitHub and deploying to Pages is easy, and every commit is playable
  at a URL; see `.github/workflows/pages.yml`.

## Alternatives considered

- **Luanti and minetest-wasm:** Wasm does not change Luanti's server-driven formspec UI, which limits client-side UI modding.
- **noa:** It supplies voxel systems on Babylon.js; adopting it hands control of systems the game can keep project-owned to a library.
- **Voxelize:** Its authoritative server and network chunk streaming solve multiplayer requirements this game does not have.
- **Divine Voxel Engine:** Its TypeScript/Babylon.js engine uses worker-based world generation and meshing; like noa, it hands meshing to a library instead of keeping a small engine under project control.
- **Godot 4 with godot_voxel:** Its networking no longer decides the choice; its web export and text-dense UI are a poorer fit than the browser stack.
- **Bevy:** It brings a Rust-to-Wasm toolchain with fewer built-in game systems than the other engine options.

## Consequences

- Vehicle physics, animation and audio remain project work. Rapier is the
  candidate for vehicle physics, not a selected dependency; see `DESIGN.md`,
  `Vehicles`.
- GitHub Pages cannot set response headers; see `CHALLENGES.md`, `Browser limits`.
