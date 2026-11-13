local gauntlet = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.start/starts.jsonnet').starts[0];
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [gauntlet + kit.look + kit.notSiteDefault + {
    id: 'gauntletnightfoglook',
    startTimeGameTimeOfDay: kit.day.midnightGameTimeOfDay,
  }],
}
