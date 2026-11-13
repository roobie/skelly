local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.weathering-test',
  tier='scenario',
  content=['starts'],
  dependencies=kit.dependencies(['skelly.deadvox.site-generation']),
)
