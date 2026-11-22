local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.fixed-lamp-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.test-house',
    'skelly.deadvox.actors',
    'skelly.structures',
    'skelly.household-electrical',
    'skelly.electric-power',
  ]),
)
