local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local layouts = std.flattenArrays([
  (import 'layouts-test-house.jsonnet').layouts,
  (import 'layouts-playtest.json').layouts,
  (import 'layouts-cabins.jsonnet').layouts,
  (import 'tutorial.jsonnet').layouts,
]);
{
  starts: kit.fromLayouts(layouts) + [kit.common + { id: 'gauntlet', site: 'gauntlet' }],
}
