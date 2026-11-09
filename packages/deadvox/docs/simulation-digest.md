---
read_if:
  - you move, split or repoint simulation code without meaning to change behaviour
  - "you run a #1532 refactor round that moves runtime code out of deadvox or cuts a seam"
  - you need to show that a code move left the actor simulation unchanged
  - you change what the simulation digest hashes, or why no test asserts its output
  - you wonder why a refactor round's fingerprint changed while its digest stayed equal
tags: [deadvox, simulation, refactor, testing]
---

# Simulation digest

Moving simulation code can change behaviour without failing a test, because tests assert
properties rather than exact outcomes. A reproducible run whose digest is compared before and
after the move shows that the simulation did the same thing. The run and what it hashes live in
`tools/simulationDigest.ts`; the flattened digest's field list and its order are part of its
definition, so a baseline stays comparable when a round only reshapes how state is nested. See
`tools/simulationDigest.ts`, `FLATTENED_FIELDS` and `flattened`.

A round that moves or splits simulation code without meaning to change behaviour proves that
by digest equality: run the tool at the round's base and at its head, and report both
outputs. Each #1532 seam or move round compares against the baseline the lead names for it.
Tests cannot carry this proof, because the digest changes whenever content or tuning
changes, and `AGENTS.md`, "Tests" bans asserting values that drift during development. So the
tool pins nothing, no test asserts its output, and the values live only in round reports.

The tool reaches the runtime through static relative imports, so a round that moves those
modules repoints the tool with the TypeScript language service, like any other importer.
Deadvox's typecheck does not cover the tool, because `tsconfig.json` includes only the
source, the tests and the Vite config; running the tool is what shows it still works.

The simulation fingerprint answers a different question: which source files the simulation
depends on and what they contain. Its value changes whenever those paths or files change, so it
cannot show that behaviour held; see `tools/simulationFingerprint.ts`.

A round that moves simulation sources between packages therefore changes the fingerprint by
design, because admitted paths and files change, while the digest of the sampled simulation
stays equal. The digest covers only that fixed simulation run, so equality does not show that
presentation or other unsampled behaviour held.
