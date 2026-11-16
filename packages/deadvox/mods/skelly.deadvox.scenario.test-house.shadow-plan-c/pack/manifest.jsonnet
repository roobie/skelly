local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.shadow-plan-c',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=['skelly.deadvox.scenario.test-house.item-vehicle-light-look'],
)
