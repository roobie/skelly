---
read_if:
  - you change how the leaper moves, pounces, flinches or glows
  - you change the `pounce` ability or add another enemy that jumps at the player
  - you change which clip set a body moves on after losing a leg
  - you admit another baked mob whose clips carry their own timings or travel
---

# Leaper

The leaper is a fast quadruped that closes the gap in one jump. It is the first enemy whose model, clips and ragdoll groups all come from a baked skelly-assets build, so the game plays what the authoring tool made instead of re-tuning it; see `docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "Staged admission".

## Gait by injury

Cutting a leaper's legs is the player's main answer to it, so each cut changes how it moves. One lost hind leg puts it on the limping set for that side; both drag the body on its forelegs. A leaper that has lost a leg is hobbled: it moves at its crawl speed and cannot start a pounce. A cut leg ends pouncing outright rather than leaving a shorter, weaker jump, because the cut is the answer and a crippled leaper that still lunged would take that answer away. See `packages/engine/src/core/legLoss.ts`, `leaperGaitOf`, and `packages/engine/src/core/actorPose.ts`, `actorHobbled`.

A leaper's clip sets are its shape, not a humanoid crawl: losing a leg never drops it to the humanoid crawling set.

A cut leaves no part to pick up, because the asset release cuts the leaper into no parts; the gait change is worth more than waiting for them. See `packages/deadvox/docs/content.md`, "Static reachability".

## Travel

The pounce clip carries its own forward travel. The simulation moves the body by that travel along its facing, and the pose holds the clip's root at the start, so the drawn jump and the body never part. Other leaper clips are drawn in place and the agent moves the body, as for every other enemy. See `packages/engine/src/core/actorPose.ts`, `pounceTravelMetres`.

The body stays on the ground through the jump's arc; only the drawn root rises. A jumping collision body would have to clear obstacles the agent's path does not know about.

## The pounce

**Sight in a range band starts it.** A chasing leaper that sees the player from inside its band, standing on the ground and off cooldown, pounces. The band brackets the clip's baked travel, so a pounce from inside it comes down on the player, and the attack sound telegraphs it before the takeoff.

**The clip's hit time lands it.** Damage lands only in the tick the clip reaches its hit time, and only if the player is then within the melee reach rule, so a dodge during the jump works. See `packages/engine/src/core/actorMotion.ts`, `pounceLands`.

**A guard does not answer it.** A raised weapon guard neither stops nor softens a landed pounce. The pounce is a threat to avoid, not to block: distance, a dodge and shots answer it. A guard is made to turn a melee motion, and a pounce is the whole body coming down. See `packages/engine/src/game/session.ts`, `blockedDamage`.

**The clip's charge drives the glow.** The pounce frames carry a charge, and the charged materials follow it, so the build-up reads on the body before the jump. See `packages/engine/src/core/actorPose.ts`, `pounceCharge`.
