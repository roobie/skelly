local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.gauntlet.start',
  tier='scenario',
  content=['gauntlet-start', 'starts'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.deadvox.buildings', 'skelly.deadvox.loot',
    'skelly.deadvox.rural-sites', 'skelly.deadvox.scenario.gauntlet.city', 'skelly.firearms', 'skelly.hand-tools',
    'skelly.household-electrical', 'skelly.light-sources', 'skelly.medicine', 'skelly.melee', 'skelly.natural-world',
    'skelly.packaged-foods', 'skelly.structures', 'skelly.wearables',
  ],
)
