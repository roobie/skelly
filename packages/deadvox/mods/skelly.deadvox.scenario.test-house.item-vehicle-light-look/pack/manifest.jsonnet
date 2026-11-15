local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.item-vehicle-light-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=['skelly.deadvox.scenario.test-house.item-light-look'],
)
