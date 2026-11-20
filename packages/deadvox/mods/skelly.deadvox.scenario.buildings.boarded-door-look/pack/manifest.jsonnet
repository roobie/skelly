local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.buildings.boarded-door-look',
  tier='scenario',
  optIn=true,
  content=['kits', 'layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.gauntlet.city']),
)
