local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.plant-instruments-look',
  tier='scenario',
  optIn=true,
  content=['instruments', 'layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox', 'skelly.deadvox.scenario.test-house', 'skelly.structures', 'skelly.electric-power', 'skelly.manufactured-blocks']),
)
