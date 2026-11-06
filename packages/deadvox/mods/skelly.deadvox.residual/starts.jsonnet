local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local layouts = std.flattenArrays([
  (import 'layouts-test-house.jsonnet').layouts,
  (import 'layouts-playtest.json').layouts,
  (import 'layouts-cabins.jsonnet').layouts,
  (import 'tutorial.jsonnet').layouts,
  (import 'packages/deadvox/mods/skelly.deadvox.crisis-hq/crisis-hq.jsonnet').layouts,
  (import 'packages/deadvox/mods/skelly.deadvox.rural-sites/rural-medical.jsonnet').layouts,
  (import 'packages/deadvox/mods/skelly.deadvox.rural-sites/rural-police.jsonnet').layouts,
  (import 'packages/deadvox/mods/skelly.deadvox.rural-sites/rural-substation.jsonnet').layouts,
]);
{
  starts: kit.fromLayouts(layouts) + [
    kit.common + { id: 'gauntlet', site: 'gauntlet' },
    kit.common + { id: 'city', site: 'city' },
    kit.common + { id: 'forest', site: 'forest' },
    kit.common + { id: 'weatheringtest', site: 'weatheringTest', debugOnly: true, startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay },
  ],
}
