local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.lamp-cube-one',
  tier='scenario', optIn=true,
  content=['templates', 'layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house']),
)
