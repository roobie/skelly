local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.buildings.misc-support-look',
  tier='scenario', optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.buildings',
    'skelly.deadvox.scenario.buildings.assembly-condition-look',
  ]),
)
