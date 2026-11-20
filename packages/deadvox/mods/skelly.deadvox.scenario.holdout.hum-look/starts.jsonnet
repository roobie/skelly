local site = import '../skelly.deadvox.scenario.holdout/holdout-site.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local only(rows, id) = [row for row in rows if row.id == id][0];
local holdout = site.scenario(site.debugWaveDay);
local waveActor = only((import '../skelly.deadvox.actors/enemies.jsonnet').actors, holdout.eventRules[0].effects[0].actor);
local hum = only((import 'packages/mods/skelly.electric-power/thermal-plant.jsonnet').powerDevices, 'turbo_generator').hum;
local wall = [sense for sense in (import 'packages/mods/skelly.senses/senses.jsonnet').senses if sense.capability == 'player'][0].wall;
// The farthest the wave hears the hum with a wall between, as `packages/engine/src/core/agentPerception.ts`,
// `soundTier`, ranks it. The module stands inside the plant's walls, so the walled reach is the one every release
// point is sure to get.
local reach = hum.radiusMetres * waveActor.agent.hearing * wall.hearingRangeScale * waveActor.agent.hearingModel.farMultiplier;
// A square whose diagonal is that reach holds the plant and every edge anchor, so any release point hears the hum.
local half = std.floor(reach / (2 * std.sqrt(2)) * 2) / 2;
// Holdout's own plant alone, running, with its first wave due within a minute and released where it hears the module.
{
  scenarios: [holdout + {
    id: 'holdout_hum',
    bounds: { x0: -half, z0: -half, x1: half, z1: half },
    start: { ask: 'power_plant' },
    asks: [{ kind: 'place', id: 'power_plant', template: site.plant.plant.id }],
    guarantee: {},
    // Half the square's side from the door: always resolvable, since a square's farthest corner from any point in it
    // is farther, and far enough that the wave walks in rather than appearing at the door.
    anchors: [only(super.anchors, 'north_road') + { id: 'within_hum', minDistance: half }],
    eventRules: [
      rule + { effects: [effect + { at: 'within_hum' } for effect in rule.effects] }
      for rule in super.eventRules
    ],
  }],
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'holdouthumlook',
    site: 'holdout_hum',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
