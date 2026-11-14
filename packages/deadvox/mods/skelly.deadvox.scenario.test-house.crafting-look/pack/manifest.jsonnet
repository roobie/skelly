local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.crafting-look',
  tier='scenario', optIn=true,
  content=['starts', 'catalogue'],
  dependencies=kit.dependencies(['skelly.deadvox.scenario.test-house', 'skelly.containers']),
)
