local gauntlet = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.start/starts.jsonnet').starts[0];
local day = (import 'packages/mods/skelly.day-cycle/dayCycle.json').dayCycle;
{
  starts: [gauntlet + {
    id: 'gauntletnightfoglook',
    debugOnly: true,
    allSkills: 10,
    defaultForSite:: true,
    startTimeGameTimeOfDay: day.midnightGameTimeOfDay,
  }],
}
