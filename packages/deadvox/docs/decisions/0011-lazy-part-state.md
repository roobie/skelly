---
read_if:
  - you're designing assembly parts, their condition or their persistence
  - you're changing when inspecting or interacting with generated parts creates state
  - you're considering a shared lazy-state mechanism for parts and column supplies
---

# 11. Part state grows with changes, not exploration

**Status:** accepted design constraint; not a claim of implementation.

## Context

Instantiating every component of every discovered car or piece of furniture would
multiply save growth without adding player choices. The supply admission boundary is
`packages/engine/src/core/columnSupply.ts`, `createColumnSupply`, connected by
`packages/engine/src/game/session.ts`, `createSession`. Part generation must not repeat
that storage cost for untouched components. The identity-based wear precedent is
`packages/engine/src/vehicles/wear.ts`, `fittingWear`; it motivates repeatable variation,
not a separate source of simulation truth.

## Decision

Part state is lazy: save size must grow with what the player changes, not with what
they have explored. An untouched assembly is its blueprint plus a seed. Compute each
part's condition from that seed; store a part only when a simulation action moves it
away from the computed state, through removal, fitting, replacement or damage. This
makes exploration cheap without losing the consequences of interaction.

The lockstep contract in `0008-deterministic-world.md`, "Decision", requires:

- Derive a part's seed from its identity: world seed, assembly id and slot id. Never
  draw from a shared random stream on materialisation; peers can materialise in different
  orders without choosing different parts.
- Only a simulation event may materialise a part. Inspection, UI and condition reads
  must not write state, because different observations must not change snapshot hashes.
  Enforce a read side with no write path by type, rather than relying on review.
- Compute condition through the determinism math module, `packages/engine/src/math.ts`,
  so browser-dependent approximations cannot change simulation outcomes.

## Scope

These are engine-wide constraints for lazy parts, not a plant-specific persistence
system. The scope of the no-independent-assembly-condition rule is still a P1 choice;
see `../holdout.md`, "Supplies and progression". This decision does not require a
conversion of every assembly kind in P1, nor decide whether column supplies move to
difference-only storage. Keeping those choices separate prevents a persistence
constraint from silently expanding the playable slice.
