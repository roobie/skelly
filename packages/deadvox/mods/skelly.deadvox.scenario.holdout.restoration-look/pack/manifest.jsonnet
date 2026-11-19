local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
manifest(
  id='skelly.deadvox.scenario.holdout.restoration-look',
  tier='scenario', optIn=true, content=['starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.holdout.restoration', 'skelly.containers', 'skelly.electric-power',
  ]),
)
