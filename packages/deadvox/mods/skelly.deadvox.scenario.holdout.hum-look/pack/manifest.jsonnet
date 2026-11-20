local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The look runs the thermal plant's module from the start, so it replaces that module's blueprint with one that has no
// seeded failure.
manifest(
  id='skelly.deadvox.scenario.holdout.hum-look',
  tier='scenario', optIn=true, content=['running-plant', 'starts'],
  dependencies=kit.dependencies([
    'skelly.deadvox.scenario.holdout', 'skelly.deadvox.actors', 'skelly.electric-power', 'skelly.senses',
  ]),
  overrides=[{ pack: 'skelly.electric-power', entry: 'partBlueprints:turbo_generator' }],
)
