local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.lamp-view-look',
  tier='scenario', optIn=true, content=['layouts', 'starts', 'templates'],
  dependencies=kit.dependencies(['skelly.building-blocks', 'skelly.deadvox.scenario.test-house', 'skelly.structures']),
)
