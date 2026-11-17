local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.wear-slots-look',
  tier='scenario',
  optIn=true,
  content=['wear-slots', 'starts'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house.debug', 'skelly.body', 'skelly.containers']),
)
