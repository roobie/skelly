---
read_if:
  - you change how a melee hit interrupts a zombie, or a type's `stagger` content
  - you tune charged strikes or a weapon's impulse against zombie stagger thresholds
  - you add knockback, knockdown or any other hit response that moves a zombie
  - you decide how the tier-2 brute answers heavy hits
---

# Stagger

Slice 5 defence needs hits that interrupt an approaching threat (`SLICE-5.md`, "Related issues and admission"). Without that, a shambler at reach is answered only by trading blows. A heavy enough hit holds the zombie still and spoils the attack it was winding up, so a well-timed strike buys time instead of only damage. See `src/core/zombies.ts`, `ZombieSystem`, `stagger`.

## The rules

**Stagger rewards commitment.** A player commits by charging a strike or by carrying a heavy, slow weapon, and either can reach a type's threshold, the heavy weapon even on an ordinary swing. Light, quick ordinary swings stay below it, so stagger is a reward for commitment rather than a side effect of every swing. Where "heavy" starts is tuning, set by weapon impulse against each type's threshold in content. See `src/core/zombies.ts`, `stagger`, and `src/content/base/items-tools.libsonnet`, `melee`.

**A threshold, per type.** Both the threshold and the duration are content, because sturdier types should shrug off what drops a shambler. See `src/core/schema.ts`, `ZombieSchema`.

**It spoils the attack in progress.** A stagger cancels the melee wind-up and the acid spit and blocks new ones until it ends. A wind-up that resumed afterwards would land anyway, and the interruption would mean nothing.

**It never moves the zombie.** Stagger stops the zombie's own movement and leaves its position alone. Displacement is knockback's job, and keeping the two apart means a stagger can never push a body through a door or wall, and its timing can be proved separately from brute displacement (`SLICE-5.md`, "Reviewable build order").

**Staggers never add up.** A new stagger keeps whichever remaining time is longer, so it can never shorten one in progress. Adding the durations would let a burst of hits bank stagger time and lock a zombie for longer than any single hit earns. What limits how often the player can renew a stagger is the cost of commitment: a charge's time and stamina, or a heavy weapon's slow swing.

**It persists in saves.** Saving and loading must not free a staggered zombie or grant a new stagger, so the remaining time is part of the zombie's snapshot.

**Only melee staggers.** Stagger rewards a committed strike, so thrown, projectile and blast hits keep their own effects. Whether they should stagger too is open: see `docs/charged-attacks.md`, "Open questions".

**It is not the hit flinch.** The flinch is presentation and runs on every damaging hit; stagger is simulation and changes what the zombie may do. See `src/core/zombiePose.ts`, `HIT_FLINCH_DURATION`.

## Which types stagger

A type without `stagger` content never staggers. Types that inherit from the shambler stagger like it. The brute does not stagger: how it answers heavy hits belongs to the tier-2 brute, which also owns its knockback; see `packages/deadvox/EPIC.md`, "5. Holding ground".
