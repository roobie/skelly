local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.buildings.fixtures-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts', 'templates'],
  dependencies=kit.dependencies([
    'skelly.deadvox.loot', 'skelly.household-electrical', 'skelly.manufactured-blocks', 'skelly.structures',
  ]),
)
