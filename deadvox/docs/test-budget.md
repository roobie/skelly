---
read_if:
  - you're reviewing why the default Deadvox unit suite was reduced
  - you're revisiting a suite reduction after a budget overrun or related defect
---

# Default Deadvox unit-suite reductions

The default Deadvox unit suite exceeded its budget. BR chose named cuts without changing the budget (d92, 2026-10-06, option B). The budget value and measurement method remain in the lead's host notes.

Each cut keeps the assertion defining its protected property and removes only repeated or incidental work. Worker policy is unchanged; timeouts remain proportional to their work. Follow `AGENTS.md`, “Tests,” when recording the coverage given up and its remaining guard.

## Decision record

- Narrowed sampled mesher layouts; remaining guard: see `test/mesher.test.ts`, “draws the same faces as plain face culling (random chunks)”.
- Narrowed sampled occlusion terrains; remaining guard: see `test/occlusion.test.ts`, “gives every merged-quad corner the per-vertex value (random terrain)”.
- Gave up repeated Hamlet order and seed cases; remaining guard: see `test/hamlet.test.ts`, “generates the same in any chunk order”.
- Shortened the idle/stroll horizon; remaining guard: see `test/zombies.test.ts`, “uses seeded idle and straight stroll intervals during a sustained sample”.
- Gave up low-impulse and post-touchdown synthetic dismemberment coverage; remaining guards: see `test/zombies.test.ts`, “scales launch distance monotonically through 40 N·s and keeps weapon distances bounded”, and `test/severedEnergy.test.ts`, “caps real bat launches and dissipates each bounce across five zombie seeds”.
- No content behavior was given up; remaining guard: see `test/content.test.ts`, “base content has no issues”.
- Ordinary save and scheduler cases gave up incidental full-world fixture coverage; remaining guard: see `test/snapshot-continuation.test.ts`, “detects omission of simulation, world, scheduler, inventory, and audio state”.
- Gave up the duplicate deep non-rest continuation comparison; remaining guards: see `test/snapshot-continuation.test.ts`, “deeply matches N steps with K/save/load/N−K (active rest)”, “preserves an active-sleep interruption emitted between frames across save/load”, and “preserves a pending sleep interruption across a paused snapshot and load”.
- No save-format behavior was given up; remaining guard: see `test/snapshot-format.test.ts`, “round-trips an edited hamlet byte-exactly and continues deterministically from the restored bytes”.

Revisit these cuts when an issue reports another default-suite budget overrun or a defect that a given-up case would have caught. Restore the affected case when responding to such a defect, and link the issue.
