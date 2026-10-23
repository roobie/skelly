---
read_if:
  - you're writing or changing simulation, worldgen or mod-expression code that must agree across browsers
  - you're choosing how the simulation core represents numbers or computes sin, cos, atan2, exp, logs, hypot or powers
  - you're deciding how unloaded regions catch up, or how the player's presence reaches regions around them
  - you're changing what column loading, unloading or streaming may do to the simulation
  - you're changing how time compression is derived
  - you're changing what generation or save identity covers once mods evaluate expressions
  - you're asking whether and when multiplayer ships and what it asks of the simulation
  - you're deciding where catch-up must agree with ordinary ticking and where the coarse model takes over
tags: [deadvox, adr, determinism, simulation, worldgen, saves, multiplayer, mods, catch-up]
---

# 8. One deterministic world in every browser

**Status:** accepted.

## Context

The world is large and almost all of it is unloaded at any moment. A save restores an exact snapshot and regenerates unedited terrain from the seed; see [ADR 0002](0002-saves.md).

The JavaScript spec gives basic arithmetic, `Math.sqrt`, `Math.fround`, `Math.floor` and `Math.imul` one exact result on every engine, but lets engines approximate the other Math functions and `**`, and change them between versions. The simulation and worldgen call them throughout.

Time compression follows frame time, and loading or unloading a column has simulation effects, so replay records both as if they were inputs; see `src/game/inputReplay.ts`, `ReplayWire`, and `src/game/inputReplayDriver.ts`, `InputReplayDriver`.

## Decision

The same seed and the same inputs give the same world and the same simulation, bit for bit, in every supported browser. Multiplayer is in scope as lockstep: peers exchange inputs and each runs the whole simulation.

- **Version.** The determinism contract ships in version 1. Networked lockstep play ships after it.

- **Save truth.** The snapshot is the save's truth. The input log beside it is bounded and serves replay and debugging; it never replaces the snapshot.
- **Numbers.** The simulation core and worldgen compute with doubles. The engine's approximated Math functions and `**` are banned there by lint, and a project-owned deterministic math module, built only from operations the spec rounds exactly, provides them. Mod expressions call only that module. Randomness comes only from the seeded streams.
- **Enforcement.** The lint ban, and a check that compares simulation and worldgen fingerprints on two engines, both gate CI.
- **Time compression** is a pure function of simulated input. Frame rate decides how fast the simulation runs in real time, never its outcome.
- **Streaming.** Simulation effects may follow the player's position, which is an input, but never the timing of a column load or unload. Tier changes are computed from position on the tick; the streamer serves them and does not cause them.
- **Around the player.** The player's region and all eight neighbouring regions are simulated, each with the player's presence as an input. With several players, the simulated set is the union of their blocks.
- **Catch-up.** The horizon is the edge of the block around the player. A region in the block runs the region model with the player's presence, and its catch-up while unloaded agrees with full ticking within each system's tolerance. A region that leaves the block switches to the system's coarse model, which is canonical. Either way catch-up is deterministic, because replay reruns it.
- **Generation identity** covers the evaluated output of the content in a canonical form, not the pack sources. Expressions evaluated per tick are engine behaviour, which the simulation fingerprint covers.

## Reasons for the details

- **Simulation as well as worldgen.** Worldgen agreement alone protects saved edits from terrain that changed under a browser update, but lockstep and cross-browser replay need the simulation to agree too. The price of adopting it grows with every new file that calls the engine's functions, so it is cheapest now.
- **Lockstep.** It allows multiplayer with little bandwidth and no game server. Adopting it later costs more than now, because each system written without the contract adds rework; leaving it later is cheap, since it means dropping the checks.
- **Contract in version 1, play after it.** The contract adds little beyond what the lint ban and cross-engine check already require, and it keeps lockstep cheap to add later. Networked play or a two-peer harness can still be added later at little cost.
- **Snapshot plus a bounded log.** Loading is bounded by save size rather than play time, and a determinism error cannot compound across sessions. The bounded log still reproduces a bug inside its window.
- **Floats with our own functions.** The cost is moderate and contained: one small module, call sites swapped one at a time, some speed per function, and a lint rule that keeps them swapped. Tunables stay plain JSON numbers, whose parsing is already exact, worldgen noise keeps its form and physics code keeps its shape. Mod expressions stay usable by calling only the module's functions. Seeded outputs change once, and undoing the choice means dropping the rule. Fixed point stays open later at its own price.
- **Enforce now.** Drift is caught in the change that introduces it, not found later across every file written meanwhile. The check asserts that fingerprints are equal, not any value, so it pins nothing that drifts.
- **Pure compression.** Live play and replay then agree without recording compression. The change is contained in the frame driver and the scheduler. It rules out pacing the outcome by frame budget, which no rule needs.
- **Position, not load timing.** Load timing is the part that breaks determinism; position is an input, so distance tiers keep working. This keeps the save's promise that play continues as if save and load had not happened, keeps lockstep possible and takes column events out of the replay. Forbidding every residency effect would instead make the simulation read terrain on demand everywhere.
- **The block of nine.** A region next to the player's should behave as though the player is next to it, and the diagonal neighbours are as adjacent as the others, so all eight count. Which regions are in the block depends only on position, so it fits the streaming rule and lockstep. Its stepped cost is nine regions per player, whatever the map size. State a region gains while in the block goes into the snapshot when it leaves, so it needs no ledger. Widening the block later is a tuning change.
- **A catch-up horizon.** Short absences are the ones a player can compare with what they saw; long ones are not, and chaotic systems such as pursuit, physics and combat cannot agree with ticking over long absences anyway.
- **The horizon at the block's edge.** It adds no state and no tunable. Agreement tests cover only the region model against ordinary ticking, for a region in the block but unloaded; the coarse model needs determinism tests, not agreement tests.
- **Evaluated output.** Reorganising a pack without changing what it means keeps saves valid, where a source hash would treat two equal results as different worlds. Moving to source identity stays cheap.

## Consequences

Every new simulation and worldgen system carries the number rule. Seeded outputs change once, as the math module replaces the engine's functions. Two risks remain whatever the number rule: a sort comparator that is inconsistent on some inputs, such as NaN, orders differently per engine, and NaN bit patterns differ when hashed. The cross-engine check finds both.

Crossing a region border admits or drops several regions at once, so admission needs a cost budget, and hysteresis to stop flicker along a border. The block's reach depends on where the player stands within their region. Under lockstep its cost grows with how far apart players are.

The block decides influence near the player only. Influence that travels farther than one region, or continues after the player leaves, is carried by saved edits, whose changed columns are stored whole; a region event ledger or abstract hordes would add to that without a rewrite.

Until networked play ships, nothing exercises input order across peers, so input timing, peer streams and the union of blocks may need rework when they first meet real peers.

The world has a second fidelity regime beyond the block, so a player may find that it behaves differently out of sight. Because the horizon is the block's edge, widening the block moves the horizon, and the two can't be tuned apart. A player who steps two regions away and straight back gets a coarse result over an absence of seconds. Border hysteresis has to cover both the block and the horizon. A later time or distance horizon adds a boundary and leaves the models alone.

Identity needs a canonical form for evaluated content, and every new content field enters it.
