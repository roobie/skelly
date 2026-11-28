local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.beam-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'markers', 'starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.test-house', 'skelly.building-blocks', 'skelly.manufactured-blocks',
    'skelly.natural-world', 'skelly.deadvox.actors',
  ]),
)
