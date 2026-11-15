local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.gauntlet.shader-gap-look',
  tier='scenario',
  optIn=true,
  content=['starts', 'graphics-shader-gap'],
  dependencies=kit.dependencies(['skelly.deadvox.actors', 'skelly.deadvox.scenario.gauntlet.debug', 'skelly.graphics']),
  overrides=[
    { pack: 'skelly.graphics', entry: 'graphics:core' },
    { pack: 'skelly.deadvox.actors', entry: 'graphics:core' },
  ],
)
