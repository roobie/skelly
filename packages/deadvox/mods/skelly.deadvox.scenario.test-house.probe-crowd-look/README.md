---
read_if:
  - you check the held-up crowd's way-round probe rate (#1957)
  - you change the probe gates in `packages/engine/src/core/agent.ts`, `AgentController.bashObstacle`
  - you change the performance overlay's probe line or the fixture's crowd, wall or window
---

# Probe-crowd look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.probe-crowd-look#{debug:true}).

Eight shamblers press a north-south partition at noon. Its middle rows hold one hinged window the
window half of the crowd sees the player through; the rows north and south of it are plain wall,
reached by that half through the chasers' alert chain. The player starts a few metres east of the
partition, facing it; every skill is at its top level from the start kit.

## Check

1. Play, then toggle the performance overlay with F4 and read `way-round probes N/s` next to the
   shamblers count.
2. Before #1957's fix the held-up crowd probes every tick, so the line stays in the hundreds per second
   and the frame rate sinks with the crowd.
3. After the fix the wall half never probes (nothing bashable is ahead) and the window half probes at most
   once per `wayAroundProbeIntervalSimSeconds` (`mods/skelly.deadvox.actors/enemies.jsonnet`, `wander`) plus once
   per change to the obstruction nearby — its own blows on the pane count — so the line reads at most a few per
   second while the blows on the window keep their attack-cooldown cadence.
4. Watch the window half longer: its blows land on the pane and frame at the same cadence as before, and the
   crowd still slides and jumps as it did; only the probe count changes.

The count the overlay divides comes from `packages/engine/src/core/actorSystem.ts`,
`ActorSystem.wayAroundProbeCount`.
