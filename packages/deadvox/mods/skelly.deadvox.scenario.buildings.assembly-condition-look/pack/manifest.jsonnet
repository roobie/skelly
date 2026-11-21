local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.buildings.assembly-condition-look',
  tier='scenario', optIn=true,
  content=['buildings', 'layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.structures']),
)
