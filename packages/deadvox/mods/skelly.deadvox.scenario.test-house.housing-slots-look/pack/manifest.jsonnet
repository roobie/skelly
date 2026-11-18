local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.housing-slots-look',
  tier='scenario',
  optIn=true,
  content=['housing-slots', 'layouts', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox', 'skelly.deadvox.scenario.test-house', 'skelly.structures']),
)
