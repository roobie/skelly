local gauntlet = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.start/starts.jsonnet').starts[0];
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The detached town house look: the gauntlet city at noon, where the city pool always places the villa once.
// No site places a single assembly, so the look link's `cam` stands the player at its front garden.
{
  starts: [gauntlet + kit.look + kit.notSiteDefault + {
    id: 'gauntletvillalook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
