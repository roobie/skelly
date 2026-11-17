local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.lamp-cube-many',
  tier='scenario', optIn=true, content=['layouts', 'starts'],
  dependencies=['skelly.deadvox.scenario.test-house.lamp-cube-one'],
)
