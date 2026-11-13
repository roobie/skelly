local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.finishes',
  tier='scenario',
  optIn=true,
  content=['starts'],
  dependencies=['skelly.deadvox.scenario.test-house.debug', 'skelly.wearables'],
)
