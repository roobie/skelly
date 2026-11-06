---
read_if:
  - you move, split or repoint simulation code without meaning to change behaviour
  - "you run a #1532 refactor round that moves runtime code out of deadvox or cuts a seam"
  - you need to show that a code move left the actor simulation unchanged
  - you change what the simulation digest hashes, or why no test asserts its output
tags: [deadvox, simulation, refactor, testing]
---

# Simulation digest

`npm run digest:simulation` prints two SHA-256 digests of one fixed actor run: three actors on
a floor with one wall, and a scripted player whose moves take them through investigate, chase
and search. The raw digest hashes every snapshot as the actor system returns it. The flattened
digest hashes a fixed list of decision fields, so it stays comparable when a round only
reshapes how state is nested. See `tools/simulationDigest.ts`, `FLATTENED_FIELDS`.

A round that moves or splits simulation code without meaning to change behaviour proves that
by digest equality: run the tool at the round's base and at its head, and report both
outputs. Each #1532 seam or move round compares against the baseline the lead names for it.
Tests cannot carry this proof, because the digest changes whenever content or tuning
changes, and `AGENTS.md`, "Tests" bans asserting values that drift during development. So the
tool pins nothing, no test asserts its output, and the values live only in round reports.

The tool reaches the runtime through static relative imports, so a round that moves those
modules repoints the tool with the TypeScript language service, like any other importer.

The simulation fingerprint answers a different question: which source files the simulation
depends on. Its value changes whenever those paths move, so it cannot show that behaviour held;
see `tools/simulationFingerprint.ts`.
