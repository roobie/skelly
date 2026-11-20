local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.buildings.downspout-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts', 'templates'],
  dependencies=kit.dependencies([
    'skelly.containers', 'skelly.manufactured-blocks', 'skelly.structures',
  ]),
)
