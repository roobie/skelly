local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.debug',
  tier='scenario',
  optIn=true,
  content=['catalogue'],
  dependencies=[
    'skelly.deadvox.buildings', 'skelly.deadvox.camp', 'skelly.deadvox.crisis-hq', 'skelly.deadvox.labs.underground',
    'skelly.deadvox.rural-sites', 'skelly.deadvox.woods', 'skelly.electric-power', 'skelly.household-electrical',
    'skelly.natural-world', 'skelly.readables', 'skelly.structures',
  ],
)
